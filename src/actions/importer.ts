"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { roundMoney } from "@/lib/money"
import { suggestCategoriesForTitles } from "@/lib/categorization"
import { categorizeTitlesWithAi } from "@/lib/ai-categorize"
import { parseCsvLine } from "@/lib/card-csv-import"

/**
 * Valor especial em `categoryId` que liga a categorização AUTOMÁTICA aprendida:
 * cada linha do CSV é categorizada pelo histórico (ver suggestCategoriesForTitles),
 * com fallback para uma categoria existente quando não há sugestão.
 */
const AUTO_CATEGORY = "__auto__";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_LINES = 5000;

/**
 * Converte uma string de data (YYYY-MM-DD ou DD/MM/YYYY) em Date UTC.
 * Retorna null se inválida (provável cabeçalho).
 */
function parseCsvDate(dateStr: string): Date | null {
  let y: number, m: number, d: number;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateStr)) {
    const [yy, mm, dd] = dateStr.split("-");
    y = Number(yy);
    m = Number(mm);
    d = Number(dd);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [dd, mm, yy] = dateStr.split("/");
    d = Number(dd);
    m = Number(mm);
    y = Number(yy);
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  // Garante que a data realmente existe (ex.: 31/02 vira outra data)
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return date;
}

/**
 * Chave canônica de deduplicação: uma transação é duplicada de outra quando
 * pertencem à MESMA conta, no mesmo dia (UTC), com mesmo valor e mesmo título.
 * As datas são sempre persistidas como meia-noite UTC (ver parseCsvDate), então
 * derivar yyyy-mm-dd a partir dos componentes UTC mantém a chave estável.
 */
function dedupKey(accountId: string, date: Date, amount: number, title: string): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${accountId}|${yyyy}-${mm}-${dd}|${amount}|${title}`;
}

type ParsedRow = { title: string; amount: number; type: "INCOME" | "EXPENSE"; date: Date };

/**
 * Parseia o texto do CSV em linhas válidas, deduplicando contra `seenKeys`
 * (conjunto de chaves já vistas — inclui o que existe no banco e cresce conforme
 * aceitamos linhas, pegando duplicatas dentro do próprio arquivo). Trunca em
 * MAX_LINES. Helper compartilhado entre importação direta e análise/preview.
 */
function parseCsvText(
  text: string,
  accountId: string,
  seenKeys: Set<string>
): { rows: ParsedRow[]; duplicatesSkipped: number; truncated: boolean } {
  let lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  let truncated = false;
  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES);
    truncated = true;
  }

  const rows: ParsedRow[] = [];
  let duplicatesSkipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 3) continue;

    const [dateStr, title, amountStr] = cols;
    const date = parseCsvDate(dateStr);
    if (!date) continue;

    const amount = parseFloat(amountStr.replace(",", "."));
    if (isNaN(amount)) continue;

    const type: "INCOME" | "EXPENSE" = amount >= 0 ? "INCOME" : "EXPENSE";
    const finalTitle = title || "Transação Importada";
    const finalAmount = roundMoney(Math.abs(amount));

    const key = dedupKey(accountId, date, finalAmount, finalTitle);
    if (seenKeys.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seenKeys.add(key);

    rows.push({ title: finalTitle, amount: finalAmount, type, date });
  }

  return { rows, duplicatesSkipped, truncated };
}

export async function importTransactionsFromCsv(formData: FormData): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const file = formData.get("file") as File;
    const accountId = formData.get("accountId") as string;
    const categoryId = formData.get("categoryId") as string;

    if (!file || !accountId || !categoryId) {
      return { success: false, error: "Arquivo, conta ou categoria ausentes." };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "Arquivo muito grande. O limite é de 2MB." };
    }

    const lowerName = file.name.toLowerCase();
    const isCsvName = lowerName.endsWith(".csv");
    const isCsvType = file.type.includes("csv") || file.type.includes("text");
    if (!isCsvName && !isCsvType) {
      return { success: false, error: "Formato inválido. Envie um arquivo .csv." };
    }

    const isAutoCategory = categoryId === AUTO_CATEGORY;

    // Valida ownership/existência da conta e categoria antes de importar.
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return { success: false, error: "Conta não encontrada." };
    }

    // Categoria de fallback usada no modo automático quando o histórico não
    // sugere nada para uma linha. Também serve para garantir que exista ao
    // menos uma categoria cadastrada antes de importar nesse modo.
    let fallbackCategoryId: string | null = null;

    if (isAutoCategory) {
      const firstCategory = await prisma.category.findFirst({
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      if (!firstCategory) {
        return { success: false, error: "Nenhuma categoria cadastrada para categorização automática." };
      }
      fallbackCategoryId = firstCategory.id;
    } else {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return { success: false, error: "Categoria não encontrada." };
      }
    }

    // Carrega de uma vez as transações existentes da conta para deduplicar por
    // (conta|dia|valor|título), sem fazer uma query por linha.
    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { date: true, amount: true, title: true },
    });

    const seenKeys = new Set<string>();
    for (const e of existing) {
      seenKeys.add(dedupKey(accountId, e.date, e.amount, e.title));
    }

    const text = await file.text();
    const { rows: parsedRows, duplicatesSkipped, truncated } = parseCsvText(text, accountId, seenKeys);
    const truncatedWarning = truncated
      ? ` O arquivo excedeu o limite de ${MAX_LINES} linhas; apenas as primeiras ${MAX_LINES} foram processadas.`
      : "";

    // Resolve a categoria de cada linha. No modo automático, carrega o
    // histórico UMA vez via suggestCategoriesForTitles e usa o fallback quando
    // não há sugestão (contabilizando quantas foram auto-categorizadas).
    let autoCategorizedCount = 0;
    const suggestions = isAutoCategory
      ? await suggestCategoriesForTitles(parsedRows.map(r => r.title))
      : null;

    const transactionsToCreate = parsedRows.map(row => {
      let resolvedCategoryId = categoryId;

      if (isAutoCategory) {
        const suggested = suggestions?.get(row.title) ?? null;
        if (suggested) {
          autoCategorizedCount++;
          resolvedCategoryId = suggested;
        } else {
          // fallbackCategoryId é garantidamente não-nulo no modo automático.
          resolvedCategoryId = fallbackCategoryId as string;
        }
      }

      return {
        title: row.title,
        amount: row.amount,
        type: row.type,
        date: row.date,
        accountId,
        categoryId: resolvedCategoryId,
      };
    });

    if (transactionsToCreate.length === 0) {
      if (duplicatesSkipped > 0) {
        return {
          success: false,
          error: `Nenhuma transação importada: todas as ${duplicatesSkipped} linha(s) válida(s) já existiam (duplicadas).`,
        };
      }
      return { success: false, error: "Nenhuma transação válida encontrada no CSV. Use o formato: Data,Título,Valor" };
    }

    await prisma.transaction.createMany({
      data: transactionsToCreate
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/insights");

    const duplicateWarning = duplicatesSkipped > 0
      ? ` ${duplicatesSkipped} ignorada(s) (duplicadas).`
      : "";

    const autoWarning = isAutoCategory
      ? ` ${autoCategorizedCount} auto-categorizada(s) pelo histórico.`
      : "";

    return {
      success: true,
      count: transactionsToCreate.length,
      message: `${transactionsToCreate.length} importada(s).${duplicateWarning}${autoWarning}${truncatedWarning}`,
    };

  } catch {
    console.error("Erro na importação de CSV.");
    return { success: false, error: "Erro ao processar o arquivo CSV." };
  }
}

// ---------------------------------------------------------------------------
// Fluxo em duas etapas (com pré-visualização): analisar -> confirmar.
// ---------------------------------------------------------------------------

export type CsvCategorizeMode = "default" | "history" | "ai";

export type AnalyzedRow = {
  date: string; // ISO (meia-noite UTC)
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  suggestedCategoryId: string | null;
  source: "history" | "ai" | null;
};

export type AnalyzeResult = {
  success: boolean;
  error?: string;
  rows?: AnalyzedRow[];
  counts?: { total: number; duplicates: number; history: number; ai: number; unresolved: number };
  aiUsed?: boolean;
  message?: string;
};

/**
 * Fase A: lê o CSV, deduplica e SUGERE categorias (sem gravar nada).
 * Estratégia híbrida: histórico (grátis) primeiro; a IA só recebe os títulos
 * únicos que o histórico não resolveu (quando mode === "ai").
 */
export async function analyzeCsvForImport(formData: FormData): Promise<AnalyzeResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const file = formData.get("file") as File;
    const accountId = formData.get("accountId") as string;
    const modeRaw = formData.get("mode");
    const mode: CsvCategorizeMode =
      modeRaw === "history" || modeRaw === "ai" ? modeRaw : "default";

    if (!file || !accountId) {
      return { success: false, error: "Arquivo ou conta ausentes." };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "Arquivo muito grande. O limite é de 2MB." };
    }
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !file.type.includes("csv") && !file.type.includes("text")) {
      return { success: false, error: "Formato inválido. Envie um arquivo .csv." };
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return { success: false, error: "Conta não encontrada." };

    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { date: true, amount: true, title: true },
    });
    const seenKeys = new Set<string>();
    for (const e of existing) seenKeys.add(dedupKey(accountId, e.date, e.amount, e.title));

    const text = await file.text();
    const { rows, duplicatesSkipped, truncated } = parseCsvText(text, accountId, seenKeys);

    if (rows.length === 0) {
      if (duplicatesSkipped > 0) {
        return { success: false, error: `Nenhuma linha nova: todas as ${duplicatesSkipped} já existiam (duplicadas).` };
      }
      return { success: false, error: "Nenhuma transação válida encontrada. Use o formato: Data,Título,Valor" };
    }

    // Histórico (determinístico) para todas as linhas, quando aplicável.
    const historyMap =
      mode === "history" || mode === "ai"
        ? await suggestCategoriesForTitles(rows.map((r) => r.title))
        : new Map<string, string | null>();

    // IA só para os títulos únicos sem match no histórico.
    let aiUsed = false;
    let aiMap = new Map<string, string | null>();
    if (mode === "ai") {
      const remaining = Array.from(
        new Set(rows.map((r) => r.title).filter((t) => !(historyMap.get(t) ?? null)))
      );
      if (remaining.length > 0) {
        const categories = await prisma.category.findMany({ select: { id: true, name: true } });
        const result = await categorizeTitlesWithAi(remaining, categories);
        aiMap = result.map;
        aiUsed = result.used;
      }
    }

    let history = 0;
    let ai = 0;
    let unresolved = 0;
    const outRows: AnalyzedRow[] = rows.map((r) => {
      const h = historyMap.get(r.title) ?? null;
      if (h) {
        history++;
        return { date: r.date.toISOString(), title: r.title, amount: r.amount, type: r.type, suggestedCategoryId: h, source: "history" };
      }
      const a = aiMap.get(r.title) ?? null;
      if (a) {
        ai++;
        return { date: r.date.toISOString(), title: r.title, amount: r.amount, type: r.type, suggestedCategoryId: a, source: "ai" };
      }
      unresolved++;
      return { date: r.date.toISOString(), title: r.title, amount: r.amount, type: r.type, suggestedCategoryId: null, source: null };
    });

    const parts: string[] = [];
    if (duplicatesSkipped > 0) parts.push(`${duplicatesSkipped} duplicada(s) ignorada(s).`);
    if (truncated) parts.push(`Arquivo truncado em ${MAX_LINES} linhas.`);
    if (mode === "ai" && !aiUsed && unresolved > 0) parts.push("IA indisponível (sem chave ou orçamento) — use a categoria padrão.");

    return {
      success: true,
      rows: outRows,
      counts: { total: outRows.length, duplicates: duplicatesSkipped, history, ai, unresolved },
      aiUsed,
      message: parts.join(" "),
    };
  } catch {
    console.error("Erro ao analisar CSV.");
    return { success: false, error: "Erro ao analisar o arquivo CSV." };
  }
}

export type ConfirmRow = {
  date: string;
  title: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  categoryId?: string | null;
};

export type ConfirmInput = {
  accountId: string;
  defaultCategoryId: string;
  rows: ConfirmRow[];
};

/**
 * Fase B: grava as transações revisadas pelo usuário. NÃO confia no client —
 * revalida conta, datas/valores/tipos e que TODO categoryId pertence a uma
 * categoria existente; linhas sem categoria caem no `defaultCategoryId`.
 */
export async function confirmCsvImport(
  input: ConfirmInput
): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    if (!input || typeof input.accountId !== "string" || !Array.isArray(input.rows)) {
      return { success: false, error: "Dados de importação inválidos." };
    }
    if (input.rows.length === 0) {
      return { success: false, error: "Nenhuma linha para importar." };
    }
    if (input.rows.length > MAX_LINES) {
      return { success: false, error: `Limite de ${MAX_LINES} linhas por importação.` };
    }

    const account = await prisma.account.findUnique({ where: { id: input.accountId } });
    if (!account) return { success: false, error: "Conta não encontrada." };

    const categories = await prisma.category.findMany({ select: { id: true } });
    const validIds = new Set(categories.map((c) => c.id));
    if (!validIds.has(input.defaultCategoryId)) {
      return { success: false, error: "Categoria padrão inválida." };
    }

    const accountId = input.accountId;
    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { date: true, amount: true, title: true },
    });
    const seenKeys = new Set<string>();
    for (const e of existing) seenKeys.add(dedupKey(accountId, e.date, e.amount, e.title));

    const toCreate: Array<{ title: string; amount: number; type: "INCOME" | "EXPENSE"; date: Date; accountId: string; categoryId: string }> = [];
    let duplicatesSkipped = 0;

    for (const row of input.rows) {
      const date = new Date(row.date);
      if (Number.isNaN(date.getTime())) continue;

      const amount = roundMoney(Math.abs(Number(row.amount)));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const type: "INCOME" | "EXPENSE" = row.type === "INCOME" ? "INCOME" : row.type === "EXPENSE" ? "EXPENSE" : "EXPENSE";
      const title = (typeof row.title === "string" && row.title.trim().length > 0 ? row.title.trim() : "Transação Importada").slice(0, 200);

      // Categoria: se informada, precisa existir (anti-adulteração); senão, padrão.
      let categoryId = input.defaultCategoryId;
      if (row.categoryId) {
        if (!validIds.has(row.categoryId)) {
          return { success: false, error: "Categoria inválida em uma das linhas." };
        }
        categoryId = row.categoryId;
      }

      const key = dedupKey(accountId, date, amount, title);
      if (seenKeys.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      seenKeys.add(key);

      toCreate.push({ title, amount, type, date, accountId, categoryId });
    }

    if (toCreate.length === 0) {
      return {
        success: false,
        error: duplicatesSkipped > 0
          ? `Nenhuma transação importada: ${duplicatesSkipped} já existiam (duplicadas).`
          : "Nenhuma transação válida para importar.",
      };
    }

    await prisma.transaction.createMany({ data: toCreate });

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/insights");

    const dupWarning = duplicatesSkipped > 0 ? ` ${duplicatesSkipped} ignorada(s) (duplicadas).` : "";
    return { success: true, count: toCreate.length, message: `${toCreate.length} importada(s).${dupWarning}` };
  } catch {
    console.error("Erro ao confirmar importação de CSV.");
    return { success: false, error: "Erro ao importar as transações." };
  }
}
