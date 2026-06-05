"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Transaction } from "@prisma/client"
import { randomUUID } from "crypto"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"
import { addMonthsClamped } from "@/lib/date-utils"

export async function createTransaction(formData: FormData): Promise<{ success: boolean; data?: Transaction | Transaction[]; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const titleRes = parseRequiredString(formData.get("title"), "Título");
    if (!titleRes.ok) return { success: false, error: titleRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor");
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const categoryRes = parseRequiredString(formData.get("categoryId"), "Categoria");
    if (!categoryRes.ok) return { success: false, error: categoryRes.error };

    const accountRes = parseRequiredString(formData.get("accountId"), "Conta");
    if (!accountRes.ok) return { success: false, error: accountRes.error };

    const title = titleRes.value;
    const amount = roundMoney(amountRes.value);
    const type = typeRes.value;
    const date = dateRes.value;
    const categoryId = categoryRes.value;
    const accountId = accountRes.value;

    const isRecurring = formData.get("isRecurring") === "on";
    const recurrenceMonths = parseInt(formData.get("recurrenceMonths") as string) || 1;

    if (isRecurring && recurrenceMonths > 1) {
      const recurrenceGroupId = randomUUID();
      const transactionsToCreate = [];

      for (let i = 0; i < recurrenceMonths; i++) {
        // Clamp de fim de mês evita overflow (ex.: 31/jan + 1 mês => 28/29 fev).
        const nextDate = addMonthsClamped(date, i);

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
      revalidatePath("/contas");

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
      revalidatePath("/contas");

      return { success: true, data: transaction };
    }
  } catch (error) {
    console.error("Erro ao criar transação:", error);
    return { success: false, error: "Erro interno ao salvar transação." };
  }
}

export async function deleteTransaction(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      return { success: false, error: "Transação não encontrada." };
    }

    if (tx.transferGroupId) {
      // Remove ambas as pernas da transferência.
      await prisma.transaction.deleteMany({
        where: { transferGroupId: tx.transferGroupId }
      });
    } else {
      await prisma.transaction.delete({ where: { id } });
    }

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/contas");

    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar transação:", error);
    return { success: false, error: "Erro interno ao deletar transação." };
  }
}

export async function updateTransaction(id: string, formData: FormData): Promise<{ success: boolean; data?: Transaction; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      return { success: false, error: "Transação não encontrada." };
    }

    if (tx.transferGroupId) {
      return { success: false, error: "Transferências não podem ser editadas individualmente. Exclua e recrie a transferência." };
    }

    const titleRes = parseRequiredString(formData.get("title"), "Título");
    if (!titleRes.ok) return { success: false, error: titleRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor");
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const categoryRes = parseRequiredString(formData.get("categoryId"), "Categoria");
    if (!categoryRes.ok) return { success: false, error: categoryRes.error };

    const accountRes = parseRequiredString(formData.get("accountId"), "Conta");
    if (!accountRes.ok) return { success: false, error: accountRes.error };

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        title: titleRes.value,
        amount: roundMoney(amountRes.value),
        type: typeRes.value,
        date: dateRes.value,
        categoryId: categoryRes.value,
        accountId: accountRes.value,
      }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/contas");

    return { success: true, data: transaction };
  } catch (error) {
    console.error("Erro ao atualizar transação:", error);
    return { success: false, error: "Erro interno ao atualizar transação." };
  }
}

export async function deleteRecurrenceSeries(recurrenceGroupId: string): Promise<{ success: boolean; count?: number; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    if (!recurrenceGroupId) {
      return { success: false, error: "Grupo de recorrência inválido." };
    }

    const result = await prisma.transaction.deleteMany({
      where: { recurrenceGroupId }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    revalidatePath("/contas");

    return { success: true, count: result.count };
  } catch (error) {
    console.error("Erro ao deletar série de recorrência:", error);
    return { success: false, error: "Erro interno ao deletar série de recorrência." };
  }
}
