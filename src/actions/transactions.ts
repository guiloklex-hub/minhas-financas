"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Transaction } from "@prisma/client"
import { randomUUID } from "crypto"

export async function createTransaction(formData: FormData): Promise<{ success: boolean; data?: Transaction | Transaction[]; error?: string }> {
  try {
    const title = formData.get("title") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const type = formData.get("type") as string;
    const dateStr = formData.get("date") as string;
    const categoryId = formData.get("categoryId") as string;
    const accountId = formData.get("accountId") as string;
    
    const isRecurring = formData.get("isRecurring") === "on";
    const recurrenceMonths = parseInt(formData.get("recurrenceMonths") as string) || 1;

    if (!title || isNaN(amount) || !type || !dateStr || !categoryId || !accountId) {
      return { success: false, error: "Todos os campos são obrigatórios ou inválidos." };
    }

    const date = new Date(dateStr);

    if (isRecurring && recurrenceMonths > 1) {
      const recurrenceGroupId = randomUUID();
      const transactionsToCreate = [];

      for (let i = 0; i < recurrenceMonths; i++) {
        // Handle month wrapping correctly
        const nextDate = new Date(date);
        nextDate.setMonth(nextDate.getMonth() + i);

        transactionsToCreate.push({
          title: i === 0 ? title : `${title} (${i + 1}/${recurrenceMonths})`,
          amount,
          type,
          date: nextDate,
          categoryId,
          accountId,
          recurrenceGroupId
        });
      }

      await prisma.$transaction(
        transactionsToCreate.map(tx => prisma.transaction.create({ data: tx }))
      );
      
      revalidatePath("/");
      revalidatePath("/transacoes");
      
      return { success: true };
    } else {
      const transaction = await prisma.transaction.create({
        data: {
          title,
          amount,
          type,
          date,
          categoryId,
          accountId,
        }
      });

      revalidatePath("/");
      revalidatePath("/transacoes");

      return { success: true, data: transaction };
    }
  } catch (error) {
    console.error("Erro ao criar transação:", error);
    return { success: false, error: "Erro interno ao salvar transação." };
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.transaction.delete({
      where: { id }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");

    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar transação:", error);
    return { success: false, error: "Erro interno ao deletar transação." };
  }
}
