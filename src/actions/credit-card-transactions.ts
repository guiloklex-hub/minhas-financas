"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"
import { addMonthsClamped } from "@/lib/date-utils"
import { getInvoiceCompetence, installmentSplit } from "@/lib/credit-card"
import { ensureInvoice, recordReward } from "@/lib/credit-card-service"

type ActionResult = { success: boolean; error?: string };

/** Normaliza tags "a, b, a" -> "a,b". */
function normalizeTags(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const tags = Array.from(
    new Set(
      raw
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );
  return tags.length > 0 ? tags.join(",") : null;
}

/**
 * Cria uma compra no cartão. Se `installments` > 1, gera uma CreditCardTransaction
 * por parcela, cada uma datada na sua competência (addMonthsClamped) e ligada à
 * fatura correspondente (materializada se necessário). Tudo atômico.
 */
export async function createCardPurchase(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardRes = parseRequiredString(formData.get("cardId"), "Cartão");
    if (!cardRes.ok) return { success: false, error: cardRes.error };

    const titleRes = parseRequiredString(formData.get("title"), "Descrição");
    if (!titleRes.ok) return { success: false, error: titleRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const installmentsRaw = formData.get("installments");
    let installments = 1;
    if (typeof installmentsRaw === "string" && installmentsRaw.trim().length > 0) {
      const n = Number(installmentsRaw);
      if (!Number.isInteger(n) || n < 1 || n > 72) {
        return { success: false, error: "Parcelas deve ser um número entre 1 e 72." };
      }
      installments = n;
    }

    const categoryRaw = formData.get("categoryId");
    const categoryId =
      typeof categoryRaw === "string" && categoryRaw.trim().length > 0 ? categoryRaw.trim() : null;

    const notesRaw = formData.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim().length > 0
        ? notesRaw.trim().slice(0, 2000)
        : null;
    const tags = normalizeTags(formData.get("tags"));

    // Internacional (opcional, snapshot).
    const fxCurrencyRaw = formData.get("fxCurrency");
    const fxCurrency =
      typeof fxCurrencyRaw === "string" && fxCurrencyRaw.trim().length > 0
        ? fxCurrencyRaw.trim().toUpperCase().slice(0, 3)
        : null;
    let fxAmount: number | null = null;
    const fxAmountRaw = formData.get("fxAmount");
    if (typeof fxAmountRaw === "string" && fxAmountRaw.trim().length > 0) {
      const r = parseMoney(fxAmountRaw, "Valor em moeda estrangeira", { min: 0 });
      if (!r.ok) return { success: false, error: r.error };
      fxAmount = r.value;
    }
    let iofAmount: number | null = null;
    const iofRaw = formData.get("iofAmount");
    if (typeof iofRaw === "string" && iofRaw.trim().length > 0) {
      const r = parseMoney(iofRaw, "IOF", { min: 0 });
      if (!r.ok) return { success: false, error: r.error };
      iofAmount = r.value;
    }

    const cardId = cardRes.value;
    const purchaseDate = dateRes.value;

    const card = await prisma.creditCard.findUnique({
      where: { id: cardId },
      select: { id: true, closingDay: true, dueDay: true, rewardType: true, rewardRate: true },
    });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) return { success: false, error: "Categoria não encontrada." };
    }

    const parts = installmentSplit(amountRes.value, installments);
    const installmentGroupId = installments > 1 ? randomUUID() : null;

    // Recompensa: ganha uma vez sobre o total da compra (não por parcela).
    const rewardPoints =
      card.rewardType !== "NONE" && card.rewardRate > 0
        ? roundMoney(amountRes.value * card.rewardRate)
        : 0;

    await prisma.$transaction(async (tx) => {
      let firstTxnId: string | null = null;
      for (let i = 0; i < parts.length; i++) {
        const date = addMonthsClamped(purchaseDate, i);
        const competence = getInvoiceCompetence(date, card.closingDay);
        const invoiceId = await ensureInvoice(tx, card, competence);

        const title =
          installments > 1
            ? `${titleRes.value} (${i + 1}/${installments})`
            : titleRes.value;

        const created = await tx.creditCardTransaction.create({
          data: {
            cardId,
            title,
            amount: parts[i],
            date,
            type: "PURCHASE",
            categoryId,
            notes,
            tags,
            installmentGroupId,
            installmentNumber: installments > 1 ? i + 1 : null,
            installmentTotal: installments > 1 ? installments : null,
            invoiceId,
            // Snapshot internacional e pontos só na primeira parcela (a compra em si).
            fxCurrency: i === 0 ? fxCurrency : null,
            fxAmount: i === 0 ? fxAmount : null,
            iofAmount: i === 0 ? iofAmount : null,
            rewardPoints: i === 0 ? rewardPoints : 0,
          },
          select: { id: true },
        });
        if (i === 0) firstTxnId = created.id;
      }

      if (rewardPoints > 0 && firstTxnId) {
        await recordReward(tx, {
          cardId,
          type: "EARN",
          points: rewardPoints,
          description: titleRes.value,
          transactionId: firstTxnId,
        });
      }
    });

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao criar compra no cartão:", error);
    return { success: false, error: "Erro interno ao criar a compra." };
  }
}

/** Registra um estorno/reembolso (REFUND) que abate o valor devido. */
export async function createCardRefund(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardRes = parseRequiredString(formData.get("cardId"), "Cartão");
    if (!cardRes.ok) return { success: false, error: cardRes.error };

    const titleRes = parseRequiredString(formData.get("title"), "Descrição");
    if (!titleRes.ok) return { success: false, error: titleRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const cardId = cardRes.value;
    const card = await prisma.creditCard.findUnique({
      where: { id: cardId },
      select: { id: true, closingDay: true, dueDay: true },
    });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    const competence = getInvoiceCompetence(dateRes.value, card.closingDay);

    await prisma.$transaction(async (tx) => {
      const invoiceId = await ensureInvoice(tx, card, competence);
      await tx.creditCardTransaction.create({
        data: {
          cardId,
          title: titleRes.value,
          amount: roundMoney(amountRes.value),
          date: dateRes.value,
          type: "REFUND",
          invoiceId,
        },
      });
    });

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao registrar estorno:", error);
    return { success: false, error: "Erro interno ao registrar o estorno." };
  }
}

/**
 * Edita um lançamento individual do cartão. Bloqueado quando a fatura já está
 * fechada ou paga (snapshot imutável).
 */
export async function updateCardPurchase(id: string, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const existing = await prisma.creditCardTransaction.findUnique({
      where: { id },
      include: { invoice: { select: { status: true } } },
    });
    if (!existing) return { success: false, error: "Lançamento não encontrado." };

    if (existing.invoice && (existing.invoice.status === "PAID" || existing.invoice.status === "CLOSED")) {
      return { success: false, error: "Não é possível editar um lançamento de fatura fechada ou paga." };
    }

    const titleRes = parseRequiredString(formData.get("title"), "Descrição");
    if (!titleRes.ok) return { success: false, error: titleRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const categoryRaw = formData.get("categoryId");
    const categoryId =
      typeof categoryRaw === "string" && categoryRaw.trim().length > 0 ? categoryRaw.trim() : null;

    const notesRaw = formData.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim().length > 0
        ? notesRaw.trim().slice(0, 2000)
        : null;

    await prisma.creditCardTransaction.update({
      where: { id },
      data: {
        title: titleRes.value,
        amount: roundMoney(amountRes.value),
        categoryId,
        notes,
        tags: normalizeTags(formData.get("tags")),
      },
    });

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${existing.cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao editar lançamento do cartão:", error);
    return { success: false, error: "Erro interno ao editar o lançamento." };
  }
}

/**
 * Exclui um lançamento do cartão. Se for parte de um parcelamento, remove todo o
 * grupo de parcelas.
 */
export async function deleteCardPurchase(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const existing = await prisma.creditCardTransaction.findUnique({
      where: { id },
      select: { id: true, cardId: true, installmentGroupId: true },
    });
    if (!existing) return { success: false, error: "Lançamento não encontrado." };

    if (existing.installmentGroupId) {
      await prisma.creditCardTransaction.deleteMany({
        where: { installmentGroupId: existing.installmentGroupId },
      });
    } else {
      await prisma.creditCardTransaction.delete({ where: { id } });
    }

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${existing.cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir lançamento do cartão:", error);
    return { success: false, error: "Erro interno ao excluir o lançamento." };
  }
}
