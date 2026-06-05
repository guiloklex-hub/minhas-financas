"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { RecurringRule } from "@/generated/prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"

type ActionResult<T> =
  | { success: true; data?: T }
  | { success: false; error: string };

const VALID_TYPES = ["INCOME", "EXPENSE"] as const;
const VALID_FREQUENCIES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;

type RuleType = (typeof VALID_TYPES)[number];
type RuleFrequency = (typeof VALID_FREQUENCIES)[number];

function isValidType(v: string): v is RuleType {
  return (VALID_TYPES as readonly string[]).includes(v);
}

function isValidFrequency(v: string): v is RuleFrequency {
  return (VALID_FREQUENCIES as readonly string[]).includes(v);
}

/**
 * Campos validados e normalizados de uma regra de recorrência, prontos para
 * serem persistidos. `dayOfMonth` é null para frequência WEEKLY.
 */
interface ParsedRuleInput {
  title: string;
  amount: number;
  type: RuleType;
  frequency: RuleFrequency;
  dayOfMonth: number | null;
  nextRunDate: Date;
  categoryId: string;
  accountId: string;
}

/**
 * Valida e normaliza os campos comuns de criação/edição de uma regra a partir
 * do FormData. A data inicial informada ("startDate") vira o primeiro
 * `nextRunDate`. Para MONTHLY/YEARLY exigimos `dayOfMonth` (1..31); para WEEKLY
 * ele é ignorado e gravado como null.
 */
function parseRuleInput(formData: FormData): ActionResult<ParsedRuleInput> {
  const titleRes = parseRequiredString(formData.get("title"), "Título");
  if (!titleRes.ok) return { success: false, error: titleRes.error };

  const amountRes = parseMoney(formData.get("amount"), "Valor");
  if (!amountRes.ok) return { success: false, error: amountRes.error };

  const typeRes = parseRequiredString(formData.get("type"), "Tipo");
  if (!typeRes.ok) return { success: false, error: typeRes.error };
  if (!isValidType(typeRes.value)) {
    return { success: false, error: "Tipo deve ser INCOME ou EXPENSE." };
  }

  const frequencyRes = parseRequiredString(formData.get("frequency"), "Frequência");
  if (!frequencyRes.ok) return { success: false, error: frequencyRes.error };
  if (!isValidFrequency(frequencyRes.value)) {
    return { success: false, error: "Frequência deve ser WEEKLY, MONTHLY ou YEARLY." };
  }

  const frequency = frequencyRes.value;

  // dayOfMonth só faz sentido (e é exigido) para MONTHLY/YEARLY.
  let dayOfMonth: number | null = null;
  if (frequency === "MONTHLY" || frequency === "YEARLY") {
    const dayRaw = formData.get("dayOfMonth");
    const day = typeof dayRaw === "string" ? Number(dayRaw) : NaN;
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return { success: false, error: "Dia do mês deve ser um inteiro entre 1 e 31." };
    }
    dayOfMonth = day;
  }

  const startRes = parseDate(formData.get("startDate"), "Data inicial");
  if (!startRes.ok) return { success: false, error: startRes.error };

  const categoryRes = parseRequiredString(formData.get("categoryId"), "Categoria");
  if (!categoryRes.ok) return { success: false, error: categoryRes.error };

  const accountRes = parseRequiredString(formData.get("accountId"), "Conta");
  if (!accountRes.ok) return { success: false, error: accountRes.error };

  return {
    success: true,
    data: {
      title: titleRes.value,
      amount: roundMoney(amountRes.value),
      type: typeRes.value,
      frequency,
      dayOfMonth,
      nextRunDate: startRes.value,
      categoryId: categoryRes.value,
      accountId: accountRes.value,
    },
  };
}

export async function createRecurringRule(
  formData: FormData
): Promise<ActionResult<RecurringRule>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const parsed = parseRuleInput(formData);
    if (!parsed.success) return parsed;
    const input = parsed.data!;

    const rule = await prisma.recurringRule.create({
      data: {
        title: input.title,
        amount: input.amount,
        type: input.type,
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth,
        nextRunDate: input.nextRunDate,
        categoryId: input.categoryId,
        accountId: input.accountId,
      },
    });

    revalidatePath("/recorrencias");

    return { success: true, data: rule };
  } catch (error) {
    console.error("Erro ao criar regra de recorrência:", error);
    return { success: false, error: "Erro interno ao criar regra de recorrência." };
  }
}

export async function updateRecurringRule(
  id: string,
  formData: FormData
): Promise<ActionResult<RecurringRule>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const parsed = parseRuleInput(formData);
    if (!parsed.success) return parsed;
    const input = parsed.data!;

    const rule = await prisma.recurringRule.update({
      where: { id },
      data: {
        title: input.title,
        amount: input.amount,
        type: input.type,
        frequency: input.frequency,
        dayOfMonth: input.dayOfMonth,
        nextRunDate: input.nextRunDate,
        categoryId: input.categoryId,
        accountId: input.accountId,
      },
    });

    revalidatePath("/recorrencias");

    return { success: true, data: rule };
  } catch (error) {
    console.error("Erro ao atualizar regra de recorrência:", error);
    return { success: false, error: "Erro interno ao atualizar regra de recorrência." };
  }
}

export async function deleteRecurringRule(
  id: string
): Promise<ActionResult<never>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    await prisma.recurringRule.delete({ where: { id } });

    revalidatePath("/recorrencias");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir regra de recorrência:", error);
    return { success: false, error: "Erro interno ao excluir regra de recorrência." };
  }
}

/**
 * Alterna o campo `isActive` da regra (pausar/retomar). Lê o estado atual e
 * grava o inverso.
 */
export async function toggleRecurringRule(
  id: string
): Promise<ActionResult<RecurringRule>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const existing = await prisma.recurringRule.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Regra de recorrência não encontrada." };
    }

    const rule = await prisma.recurringRule.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    revalidatePath("/recorrencias");

    return { success: true, data: rule };
  } catch (error) {
    console.error("Erro ao alternar regra de recorrência:", error);
    return { success: false, error: "Erro interno ao alternar regra de recorrência." };
  }
}

/**
 * Lista todas as regras de recorrência, ordenadas pela próxima execução.
 */
export async function getRecurringRules(): Promise<RecurringRule[]> {
  return await prisma.recurringRule.findMany({
    orderBy: { nextRunDate: "asc" },
  });
}
