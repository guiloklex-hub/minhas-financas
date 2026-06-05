"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { roundMoney } from "@/lib/money"
import { suggestCategoriesForTitles } from "@/lib/categorization"

/**
 * Valor especial em `categoryId` que liga a categorização AUTOMÁTICA aprendida:
 * cada linha do CSV é categorizada pelo histórico (ver suggestCategoriesForTitles),
 * com fallback para uma categoria existente quando não há sugestão.
 */
const AUTO_CATEGORY = "__auto__";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_LINES = 5000;

/**
 * Parser de linha CSV que respeita campos entre aspas com vírgulas internas
 * e aspas duplas escapadas ("").
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          // Aspas duplas escapadas
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result.map(c => c.trim());
}

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

    const text = await file.text();
    let lines = text.split(/\r?\n/).filter(l => l.trim() !== "");

    let truncatedWarning = "";
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      truncatedWarning = ` O arquivo excedeu o limite de ${MAX_LINES} linhas; apenas as primeiras ${MAX_LINES} foram processadas.`;
    }

    // Carrega de uma vez as transações existentes da conta para deduplicar por
    // (conta|dia|valor|título), sem fazer uma query por linha.
    const existing = await prisma.transaction.findMany({
      where: { accountId },
      select: { date: true, amount: true, title: true },
    });

    // Set de chaves já vistas: começa com o que existe no banco e cresce conforme
    // aceitamos linhas — assim duplicatas DENTRO do próprio arquivo também são pulas.
    const seenKeys = new Set<string>();
    for (const e of existing) {
      seenKeys.add(dedupKey(accountId, e.date, e.amount, e.title));
    }

    // Primeira passada: parse + dedup. A categoria ainda não é resolvida aqui
    // porque, no modo automático, sugerimos por lote (uma única carga do
    // histórico) só para as linhas que de fato serão importadas.
    type ParsedRow = { title: string; amount: number; type: "INCOME" | "EXPENSE"; date: Date };
    const parsedRows: ParsedRow[] = [];
    let duplicatesSkipped = 0;

    for (let i = 0; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);

      if (cols.length < 3) continue;

      const [dateStr, title, amountStr] = cols;

      // Parse data (suporta YYYY-MM-DD e DD/MM/YYYY). Linhas com data inválida
      // (provável cabeçalho) são puladas.
      const date = parseCsvDate(dateStr);
      if (!date) continue;

      const amount = parseFloat(amountStr.replace(",", "."));
      if (isNaN(amount)) continue;

      const type: "INCOME" | "EXPENSE" = amount >= 0 ? "INCOME" : "EXPENSE";

      const finalTitle = title || "Transação Importada";
      const finalAmount = roundMoney(Math.abs(amount));

      // A chave usa os mesmos valores que serão persistidos (título e valor finais).
      const key = dedupKey(accountId, date, finalAmount, finalTitle);
      if (seenKeys.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      seenKeys.add(key);

      parsedRows.push({ title: finalTitle, amount: finalAmount, type, date });
    }

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
