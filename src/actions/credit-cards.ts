"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { CreditCard } from "@/generated/prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney } from "@/lib/validation"
import { isSupportedCurrency } from "@/lib/currency"

type ActionResult<T> = { success: boolean; data?: T; error?: string };

const BRANDS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OTHER"];
const REWARD_TYPES = ["NONE", "CASHBACK", "POINTS", "MILES"];

/** Valida um dia do mês (1-31) vindo do formulário. */
function parseDayOfMonth(
  value: FormDataEntryValue | null,
  field: string
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${field} é obrigatório.` };
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    return { ok: false, error: `${field} deve ser um dia entre 1 e 31.` };
  }
  return { ok: true, value: n };
}

/** Lê os campos comuns do cartão a partir do FormData. */
async function readCardFields(formData: FormData): Promise<
  | { ok: true; value: Omit<CreditCard, "id" | "archived" | "createdAt" | "updatedAt"> }
  | { ok: false; error: string }
> {
  const nameRes = parseRequiredString(formData.get("name"), "Nome");
  if (!nameRes.ok) return { ok: false, error: nameRes.error };

  const closingRes = parseDayOfMonth(formData.get("closingDay"), "Dia de fechamento");
  if (!closingRes.ok) return { ok: false, error: closingRes.error };

  const dueRes = parseDayOfMonth(formData.get("dueDay"), "Dia de vencimento");
  if (!dueRes.ok) return { ok: false, error: dueRes.error };

  const limitRes = parseMoney(formData.get("creditLimit"), "Limite", { min: 0 });
  if (!limitRes.ok) return { ok: false, error: limitRes.error };

  const annualFeeRaw = formData.get("annualFee");
  let annualFee = 0;
  if (typeof annualFeeRaw === "string" && annualFeeRaw.trim().length > 0) {
    const feeRes = parseMoney(annualFeeRaw, "Anuidade", { min: 0 });
    if (!feeRes.ok) return { ok: false, error: feeRes.error };
    annualFee = feeRes.value;
  }

  const rewardRateRaw = formData.get("rewardRate");
  let rewardRate = 0;
  if (typeof rewardRateRaw === "string" && rewardRateRaw.trim().length > 0) {
    const rateRes = parseMoney(rewardRateRaw, "Taxa de recompensa", { min: 0, max: 1000 });
    if (!rateRes.ok) return { ok: false, error: rateRes.error };
    rewardRate = rateRes.value;
  }

  const brandRaw = formData.get("brand");
  const brand = typeof brandRaw === "string" && BRANDS.includes(brandRaw) ? brandRaw : null;

  const rewardTypeRaw = formData.get("rewardType");
  const rewardType =
    typeof rewardTypeRaw === "string" && REWARD_TYPES.includes(rewardTypeRaw)
      ? rewardTypeRaw
      : "NONE";

  const lastFourRaw = formData.get("lastFour");
  let lastFour: string | null = null;
  if (typeof lastFourRaw === "string" && lastFourRaw.trim().length > 0) {
    if (!/^\d{4}$/.test(lastFourRaw.trim())) {
      return { ok: false, error: "Os últimos dígitos devem ser exatamente 4 números." };
    }
    lastFour = lastFourRaw.trim();
  }

  const colorRaw = formData.get("color");
  const color = typeof colorRaw === "string" && colorRaw.trim().length > 0 ? colorRaw.trim() : null;

  const currencyRaw = formData.get("currency");
  const currency =
    typeof currencyRaw === "string" && isSupportedCurrency(currencyRaw) ? currencyRaw : "BRL";

  // paymentAccountId: opcional; valida existência quando informado (single-user).
  const payRaw = formData.get("paymentAccountId");
  let paymentAccountId: string | null = null;
  if (typeof payRaw === "string" && payRaw.trim().length > 0) {
    const account = await prisma.account.findUnique({ where: { id: payRaw.trim() } });
    if (!account) return { ok: false, error: "Conta de pagamento não encontrada." };
    paymentAccountId = account.id;
  }

  return {
    ok: true,
    value: {
      name: nameRes.value,
      brand,
      lastFour,
      color,
      creditLimit: limitRes.value,
      closingDay: closingRes.value,
      dueDay: dueRes.value,
      currency,
      paymentAccountId,
      rewardType,
      rewardRate,
      annualFee,
    },
  };
}

export async function createCard(formData: FormData): Promise<ActionResult<CreditCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const fields = await readCardFields(formData);
    if (!fields.ok) return { success: false, error: fields.error };

    const card = await prisma.creditCard.create({ data: fields.value });

    revalidatePath("/");
    revalidatePath("/cartoes");
    return { success: true, data: card };
  } catch (error) {
    console.error("Erro ao criar cartão:", error);
    return { success: false, error: "Erro interno ao criar cartão." };
  }
}

export async function updateCard(id: string, formData: FormData): Promise<ActionResult<CreditCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const fields = await readCardFields(formData);
    if (!fields.ok) return { success: false, error: fields.error };

    const card = await prisma.creditCard.update({ where: { id }, data: fields.value });

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${id}`);
    return { success: true, data: card };
  } catch (error) {
    console.error("Erro ao atualizar cartão:", error);
    return { success: false, error: "Erro interno ao atualizar cartão." };
  }
}

export async function archiveCard(id: string): Promise<ActionResult<CreditCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const card = await prisma.creditCard.update({
      where: { id },
      data: { archived: true },
    });

    revalidatePath("/");
    revalidatePath("/cartoes");
    return { success: true, data: card };
  } catch (error) {
    console.error("Erro ao arquivar cartão:", error);
    return { success: false, error: "Erro interno ao arquivar cartão." };
  }
}
