"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"

export async function createTransfer(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const fromAccountId = formData.get("fromAccountId") as string;
    const toAccountId = formData.get("toAccountId") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const dateStr = formData.get("date") as string;
    const title = (formData.get("title") as string) || "Transferência";

    if (!fromAccountId || !toAccountId || isNaN(amount) || amount <= 0 || !dateStr) {
      return { success: false, error: "Dados inválidos." };
    }

    if (fromAccountId === toAccountId) {
      return { success: false, error: "A conta de origem e destino não podem ser as mesmas." };
    }

    // We need a category for the transfer. Let's find or create a default "Transferência" category.
    let transferCategory = await prisma.category.findFirst({
      where: { name: "Transferência" }
    });

    if (!transferCategory) {
      transferCategory = await prisma.category.create({
        data: {
          name: "Transferência",
          color: "#8b5cf6" // A nice purple for transfers
        }
      });
    }

    const transferGroupId = randomUUID();
    const parsedDate = new Date(dateStr);

    // Run in a transaction
    await prisma.$transaction([
      // Expense from source
      prisma.transaction.create({
        data: {
          title: `${title} (Saída)`,
          amount,
          type: "EXPENSE",
          date: parsedDate,
          accountId: fromAccountId,
          categoryId: transferCategory.id,
          isTransfer: true,
          transferGroupId
        }
      }),
      // Income to destination
      prisma.transaction.create({
        data: {
          title: `${title} (Entrada)`,
          amount,
          type: "INCOME",
          date: parsedDate,
          accountId: toAccountId,
          categoryId: transferCategory.id,
          isTransfer: true,
          transferGroupId
        }
      })
    ]);

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");

    return { success: true };
  } catch (error) {
    console.error("Erro ao criar transferência:", error);
    return { success: false, error: "Erro interno ao processar a transferência." };
  }
}
