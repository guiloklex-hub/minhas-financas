"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function importTransactionsFromCsv(formData: FormData): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const file = formData.get("file") as File;
    const accountId = formData.get("accountId") as string;
    const categoryId = formData.get("categoryId") as string;

    if (!file || !accountId || !categoryId) {
      return { success: false, error: "Arquivo, conta ou categoria ausentes." };
    }

    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim() !== "");
    
    const transactionsToCreate = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Ignorar aspas se houver
      const cleanLine = line.replace(/"/g, "");
      const cols = cleanLine.split(",").map(c => c.trim());
      
      if (cols.length < 3) continue;
      
      const [dateStr, title, amountStr] = cols;
      
      // Parse data (suporta YYYY-MM-DD e DD/MM/YYYY)
      let date = new Date(dateStr);
      if (isNaN(date.getTime()) && dateStr.includes("/")) {
        const [d, m, y] = dateStr.split("/");
        // Basic check
        if (d && m && y) {
          date = new Date(`${y}-${m}-${d}`);
        }
      }
      
      if (isNaN(date.getTime())) {
        // Provável cabeçalho
        continue;
      }
      
      const amount = parseFloat(amountStr);
      if (isNaN(amount)) continue;
      
      const type = amount >= 0 ? "INCOME" : "EXPENSE";

      transactionsToCreate.push({
        title: title || "Transação Importada",
        amount: Math.abs(amount),
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

    return { success: true, count: transactionsToCreate.length };

  } catch (error) {
    console.error("Erro na importação de CSV:", error);
    return { success: false, error: "Erro ao processar o arquivo CSV." };
  }
}
