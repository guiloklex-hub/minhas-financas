"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Goal } from "@/generated/prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"

type GoalResult = { success: boolean; data?: Goal; error?: string; message?: string };

/**
 * Resolve o accountId opcional vindo do FormData.
 * Tratamos string vazia / "none" como "sem conta vinculada" (null).
 */
function parseOptionalAccountId(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed === "none") return null;
  return trimmed;
}

export async function createGoal(formData: FormData): Promise<GoalResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const targetRes = parseMoney(formData.get("targetAmount"), "Valor alvo", { min: 0.01 });
    if (!targetRes.ok) return { success: false, error: targetRes.error };

    // currentAmount é opcional na criação; default 0.
    let currentAmount = 0;
    const rawCurrent = formData.get("currentAmount");
    if (typeof rawCurrent === "string" && rawCurrent.trim().length > 0) {
      const currentRes = parseMoney(rawCurrent, "Valor atual", { min: 0 });
      if (!currentRes.ok) return { success: false, error: currentRes.error };
      currentAmount = roundMoney(currentRes.value);
    }

    // deadline é opcional.
    let deadline: Date | null = null;
    const rawDeadline = formData.get("deadline");
    if (typeof rawDeadline === "string" && rawDeadline.trim().length > 0) {
      const deadlineRes = parseDate(rawDeadline, "Prazo");
      if (!deadlineRes.ok) return { success: false, error: deadlineRes.error };
      deadline = deadlineRes.value;
    }

    const accountId = parseOptionalAccountId(formData.get("accountId"));

    const goal = await prisma.goal.create({
      data: {
        name: nameRes.value,
        targetAmount: roundMoney(targetRes.value),
        currentAmount,
        deadline,
        accountId,
      },
    });

    revalidatePath("/metas");
    revalidatePath("/");

    return { success: true, data: goal };
  } catch (error) {
    console.error("Erro ao criar meta:", error);
    return { success: false, error: "Erro interno ao criar meta." };
  }
}

export async function updateGoal(id: string, formData: FormData): Promise<GoalResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const targetRes = parseMoney(formData.get("targetAmount"), "Valor alvo", { min: 0.01 });
    if (!targetRes.ok) return { success: false, error: targetRes.error };

    const currentRes = parseMoney(formData.get("currentAmount"), "Valor atual", { min: 0 });
    if (!currentRes.ok) return { success: false, error: currentRes.error };

    // deadline é opcional — string vazia limpa o prazo.
    let deadline: Date | null = null;
    const rawDeadline = formData.get("deadline");
    if (typeof rawDeadline === "string" && rawDeadline.trim().length > 0) {
      const deadlineRes = parseDate(rawDeadline, "Prazo");
      if (!deadlineRes.ok) return { success: false, error: deadlineRes.error };
      deadline = deadlineRes.value;
    }

    const accountId = parseOptionalAccountId(formData.get("accountId"));

    const goal = await prisma.goal.update({
      where: { id },
      data: {
        name: nameRes.value,
        targetAmount: roundMoney(targetRes.value),
        currentAmount: roundMoney(currentRes.value),
        deadline,
        accountId,
      },
    });

    revalidatePath("/metas");
    revalidatePath("/");

    return { success: true, data: goal };
  } catch (error) {
    console.error("Erro ao atualizar meta:", error);
    return { success: false, error: "Erro interno ao atualizar meta." };
  }
}

export async function addToGoal(id: string, formData: FormData): Promise<GoalResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const amountRes = parseMoney(formData.get("amount"), "Valor do aporte", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    // Read-modify-write arredondado: garante que currentAmount permaneça um
    // valor monetário limpo. O `increment` atômico somaria floats crus e, após
    // muitos aportes, acumularia drift de ponto flutuante no campo Float do
    // SQLite. App single-user → sem corrida relevante; a transação mantém a
    // leitura+escrita coerentes.
    const goal = await prisma.$transaction(async (tx) => {
      const existing = await tx.goal.findUnique({
        where: { id },
        select: { currentAmount: true },
      });
      if (!existing) return null;
      const nextAmount = roundMoney(existing.currentAmount + amountRes.value);
      return tx.goal.update({ where: { id }, data: { currentAmount: nextAmount } });
    });

    if (!goal) return { success: false, error: "Meta não encontrada." };

    revalidatePath("/metas");
    revalidatePath("/");

    return { success: true, data: goal };
  } catch (error) {
    console.error("Erro ao adicionar aporte à meta:", error);
    return { success: false, error: "Erro interno ao adicionar aporte." };
  }
}

export async function deleteGoal(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    await prisma.goal.delete({ where: { id } });

    revalidatePath("/metas");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir meta:", error);
    return { success: false, error: "Erro interno ao excluir meta." };
  }
}

export async function getGoals(): Promise<{ success: boolean; data?: Goal[]; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const goals = await prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
      include: { account: true },
    });

    return { success: true, data: goals };
  } catch (error) {
    console.error("Erro ao buscar metas:", error);
    return { success: false, error: "Erro interno ao buscar metas." };
  }
}
