"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney } from "@/lib/validation"
import { roundMoney } from "@/lib/money"
import { getRewardBalance, recordReward } from "@/lib/credit-card-service"

type ActionResult = { success: boolean; error?: string };

/** Resgata pontos/cashback do cartão (debita do saldo do ledger). */
export async function redeemRewards(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardRes = parseRequiredString(formData.get("cardId"), "Cartão");
    if (!cardRes.ok) return { success: false, error: cardRes.error };

    const pointsRes = parseMoney(formData.get("points"), "Pontos", { min: 0.01 });
    if (!pointsRes.ok) return { success: false, error: pointsRes.error };

    const descRaw = formData.get("description");
    const description =
      typeof descRaw === "string" && descRaw.trim().length > 0 ? descRaw.trim().slice(0, 120) : "Resgate";

    const cardId = cardRes.value;
    const card = await prisma.creditCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    const points = roundMoney(pointsRes.value);

    await prisma.$transaction(async (tx) => {
      const balance = await getRewardBalance(tx, cardId);
      if (points > balance) throw new Error("INSUFFICIENT");
      await recordReward(tx, { cardId, type: "REDEEM", points: -points, description });
    });

    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${cardId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT") {
      return { success: false, error: "Saldo de pontos insuficiente." };
    }
    console.error("Erro ao resgatar recompensa:", error);
    return { success: false, error: "Erro interno ao resgatar a recompensa." };
  }
}

/** Ajuste manual de pontos (positivo credita, negativo debita). */
export async function adjustRewards(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardRes = parseRequiredString(formData.get("cardId"), "Cartão");
    if (!cardRes.ok) return { success: false, error: cardRes.error };

    const pointsRaw = formData.get("points");
    if (typeof pointsRaw !== "string" || pointsRaw.trim().length === 0) {
      return { success: false, error: "Pontos é obrigatório." };
    }
    const points = roundMoney(Number(pointsRaw));
    if (!Number.isFinite(points) || points === 0) {
      return { success: false, error: "Pontos deve ser um número diferente de zero." };
    }

    const descRaw = formData.get("description");
    const description =
      typeof descRaw === "string" && descRaw.trim().length > 0 ? descRaw.trim().slice(0, 120) : "Ajuste";

    const cardId = cardRes.value;
    const card = await prisma.creditCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    await prisma.$transaction(async (tx) => {
      await recordReward(tx, { cardId, type: "ADJUST", points, description });
    });

    revalidatePath(`/cartoes/${cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao ajustar recompensa:", error);
    return { success: false, error: "Erro interno ao ajustar a recompensa." };
  }
}
