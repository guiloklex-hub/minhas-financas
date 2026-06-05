"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { roundMoney } from "@/lib/money"

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

    // Valida ownership/existência da conta e categoria antes de importar.
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return { success: false, error: "Conta não encontrada." };
    }
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return { success: false, error: "Categoria não encontrada." };
    }

    const text = await file.text();
    let lines = text.split(/\r?\n/).filter(l => l.trim() !== "");

    let truncatedWarning = "";
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      truncatedWarning = ` O arquivo excedeu o limite de ${MAX_LINES} linhas; apenas as primeiras ${MAX_LINES} foram processadas.`;
    }

    const transactionsToCreate = [];

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

      const type = amount >= 0 ? "INCOME" : "EXPENSE";

      transactionsToCreate.push({
        title: title || "Transação Importada",
        amount: roundMoney(Math.abs(amount)),
        type,
        date,
        accountId,
        categoryId
      });
    }

    if (transactionsToCreate.length === 0) {
      return { success: false, error: "Nenhuma transação válida encontrada no CSV. Use o formato: Data,Título,Valor" };
    }

    await prisma.transaction.createMany({
      data: transactionsToCreate
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/insights");

    return {
      success: true,
      count: transactionsToCreate.length,
      message: `${transactionsToCreate.length} transação(ões) importada(s) com sucesso.${truncatedWarning}`,
    };

  } catch {
    console.error("Erro na importação de CSV.");
    return { success: false, error: "Erro ao processar o arquivo CSV." };
  }
}
