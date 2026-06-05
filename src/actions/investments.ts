"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation";
import { roundMoney } from "@/lib/money";

export async function getInvestments() {
  return await prisma.investment.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function createInvestment(formData: FormData) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const amountRes = parseMoney(formData.get("initialAmount"), "Valor inicial");
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const yieldRaw = formData.get("yieldRate");
    const yieldNum = typeof yieldRaw === "string" ? Number(yieldRaw) : NaN;
    if (!Number.isFinite(yieldNum)) {
      return { success: false, error: "Rentabilidade deve ser um número válido." };
    }
    const yieldRate = yieldNum / 100; // Convert % to decimal

    const startRes = parseDate(formData.get("startDate"), "Data inicial");
    if (!startRes.ok) return { success: false, error: startRes.error };

    const maturityRaw = formData.get("maturityDate");
    let maturityDate: Date | null = null;
    if (typeof maturityRaw === "string" && maturityRaw.trim() !== "") {
      const maturityRes = parseDate(maturityRaw, "Data de vencimento");
      if (!maturityRes.ok) return { success: false, error: maturityRes.error };
      maturityDate = maturityRes.value;
    }

    const investment = await prisma.investment.create({
      data: {
        name: nameRes.value,
        type: typeRes.value,
        initialAmount: roundMoney(amountRes.value),
        currentAmount: roundMoney(amountRes.value),
        yieldRate,
        startDate: startRes.value,
        maturityDate,
      }
    });

    revalidatePath("/investimentos");
    return { success: true, data: investment };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao criar investimento." };
  }
}

export async function updateInvestment(id: string, formData: FormData) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const initialRes = parseMoney(formData.get("initialAmount"), "Valor inicial");
    if (!initialRes.ok) return { success: false, error: initialRes.error };

    const currentRes = parseMoney(formData.get("currentAmount"), "Valor atual");
    if (!currentRes.ok) return { success: false, error: currentRes.error };

    const yieldRaw = formData.get("yieldRate");
    const yieldNum = typeof yieldRaw === "string" ? Number(yieldRaw) : NaN;
    if (!Number.isFinite(yieldNum)) {
      return { success: false, error: "Rentabilidade deve ser um número válido." };
    }
    const yieldRate = yieldNum / 100; // Convert % to decimal

    const startRes = parseDate(formData.get("startDate"), "Data inicial");
    if (!startRes.ok) return { success: false, error: startRes.error };

    const maturityRaw = formData.get("maturityDate");
    let maturityDate: Date | null = null;
    if (typeof maturityRaw === "string" && maturityRaw.trim() !== "") {
      const maturityRes = parseDate(maturityRaw, "Data de vencimento");
      if (!maturityRes.ok) return { success: false, error: maturityRes.error };
      maturityDate = maturityRes.value;
    }

    const investment = await prisma.investment.update({
      where: { id },
      data: {
        name: nameRes.value,
        type: typeRes.value,
        initialAmount: roundMoney(initialRes.value),
        currentAmount: roundMoney(currentRes.value),
        yieldRate,
        startDate: startRes.value,
        maturityDate,
      }
    });

    revalidatePath("/investimentos");
    return { success: true, data: investment };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao atualizar investimento." };
  }
}

export async function deleteInvestment(id: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    await prisma.investment.delete({ where: { id } });
    revalidatePath("/investimentos");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao excluir investimento." };
  }
}
