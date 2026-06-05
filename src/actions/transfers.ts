"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"

export async function createTransfer(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const fromRes = parseRequiredString(formData.get("fromAccountId"), "Conta de origem");
    if (!fromRes.ok) return { success: false, error: fromRes.error };

    const toRes = parseRequiredString(formData.get("toAccountId"), "Conta de destino");
    if (!toRes.ok) return { success: false, error: toRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const fromAccountId = fromRes.value;
    const toAccountId = toRes.value;
    const amount = roundMoney(amountRes.value);
    const parsedDate = dateRes.value;
    const title = (formData.get("title") as string) || "Transferência";

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
