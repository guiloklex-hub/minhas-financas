"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { VirtualCard } from "@/generated/prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney } from "@/lib/validation"

type ActionResult<T> = { success: boolean; data?: T; error?: string };

/** Lê e valida os campos comuns do cartão virtual a partir do FormData. */
function readVirtualCardFields(
  formData: FormData
):
  | { ok: true; value: { name: string; lastFour: string | null; color: string | null; spendingLimit: number | null } }
  | { ok: false; error: string } {
  const nameRes = parseRequiredString(formData.get("name"), "Nome");
  if (!nameRes.ok) return { ok: false, error: nameRes.error };

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

  const limitRaw = formData.get("spendingLimit");
  let spendingLimit: number | null = null;
  if (typeof limitRaw === "string" && limitRaw.trim().length > 0) {
    const r = parseMoney(limitRaw, "Sub-limite", { min: 0 });
    if (!r.ok) return { ok: false, error: r.error };
    spendingLimit = r.value;
  }

  return { ok: true, value: { name: nameRes.value, lastFour, color, spendingLimit } };
}

export async function createVirtualCard(formData: FormData): Promise<ActionResult<VirtualCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardRes = parseRequiredString(formData.get("cardId"), "Cartão");
    if (!cardRes.ok) return { success: false, error: cardRes.error };

    const card = await prisma.creditCard.findUnique({ where: { id: cardRes.value }, select: { id: true } });
    if (!card) return { success: false, error: "Cartão físico não encontrado." };

    const fields = readVirtualCardFields(formData);
    if (!fields.ok) return { success: false, error: fields.error };

    const virtualCard = await prisma.virtualCard.create({
      data: { cardId: card.id, ...fields.value },
    });

    revalidatePath(`/cartoes/${card.id}`);
    return { success: true, data: virtualCard };
  } catch (error) {
    console.error("Erro ao criar cartão virtual:", error);
    return { success: false, error: "Erro interno ao criar cartão virtual." };
  }
}

export async function updateVirtualCard(id: string, formData: FormData): Promise<ActionResult<VirtualCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const existing = await prisma.virtualCard.findUnique({ where: { id }, select: { id: true, cardId: true } });
    if (!existing) return { success: false, error: "Cartão virtual não encontrado." };

    const fields = readVirtualCardFields(formData);
    if (!fields.ok) return { success: false, error: fields.error };

    const virtualCard = await prisma.virtualCard.update({ where: { id }, data: fields.value });

    revalidatePath(`/cartoes/${existing.cardId}`);
    return { success: true, data: virtualCard };
  } catch (error) {
    console.error("Erro ao atualizar cartão virtual:", error);
    return { success: false, error: "Erro interno ao atualizar cartão virtual." };
  }
}

export async function archiveVirtualCard(id: string): Promise<ActionResult<VirtualCard>> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const existing = await prisma.virtualCard.findUnique({ where: { id }, select: { id: true, cardId: true } });
    if (!existing) return { success: false, error: "Cartão virtual não encontrado." };

    const virtualCard = await prisma.virtualCard.update({ where: { id }, data: { archived: true } });

    revalidatePath(`/cartoes/${existing.cardId}`);
    return { success: true, data: virtualCard };
  } catch (error) {
    console.error("Erro ao arquivar cartão virtual:", error);
    return { success: false, error: "Erro interno ao arquivar cartão virtual." };
  }
}
