"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Transaction } from "@prisma/client"

export async function createTransaction(formData: FormData): Promise<{ success: boolean; data?: Transaction; error?: string }> {
  try {
    const title = formData.get("title") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const type = formData.get("type") as string;
    const date = new Date(formData.get("date") as string);
    const categoryId = formData.get("categoryId") as string;
    const accountId = formData.get("accountId") as string;

    if (!title || isNaN(amount) || !type || !date || !categoryId || !accountId) {
      return { success: false, error: "Todos os campos são obrigatórios ou inválidos." };
    }

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
