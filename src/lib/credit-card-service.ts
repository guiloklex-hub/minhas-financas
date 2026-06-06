import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { roundMoney } from "./money";
import {
  type Competence,
  getInvoiceCompetence,
  getInvoiceDates,
  shiftCompetence,
} from "./credit-card";

/** Cliente Prisma ou transação interativa — ambos têm os mesmos delegates. */
type Db = Prisma.TransactionClient;

/**
 * Garante que exista a fatura (CreditCardInvoice) de uma competência para o
 * cartão e devolve seu id. Idempotente via unique [cardId, referenceMonth,
 * referenceYear]. As datas de fechamento/vencimento vêm da config do cartão.
 */
export async function ensureInvoice(
  db: Db,
  card: { id: string; closingDay: number; dueDay: number },
  competence: Competence
): Promise<string> {
  const { closingDate, dueDate } = getInvoiceDates({
    competence,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  });

  const invoice = await db.creditCardInvoice.upsert({
    where: {
      cardId_referenceMonth_referenceYear: {
        cardId: card.id,
        referenceMonth: competence.month,
        referenceYear: competence.year,
      },
    },
    create: {
      cardId: card.id,
      referenceMonth: competence.month,
      referenceYear: competence.year,
      closingDate,
      dueDate,
      status: "OPEN",
    },
    update: {},
    select: { id: true },
  });

  return invoice.id;
}

/** Conveniência: resolve a competência de uma data e garante a fatura. */
export async function ensureInvoiceForDate(
  db: Db,
  card: { id: string; closingDay: number; dueDay: number },
  date: Date
): Promise<string> {
  const competence = getInvoiceCompetence(date, card.closingDay);
  return ensureInvoice(db, card, competence);
}

/** Saldo de recompensas do cartão (soma assinada do ledger). */
export async function getRewardBalance(db: Db, cardId: string): Promise<number> {
  const agg = await db.cardRewardLedger.aggregate({
    _sum: { points: true },
    where: { cardId },
  });
  return roundMoney(agg._sum.points ?? 0);
}

/**
 * Credita/debita pontos no ledger de recompensas, calculando o balanceAfter.
 * `points` é assinado: EARN/ADJUST positivo, REDEEM/EXPIRE negativo.
 */
export async function recordReward(
  db: Db,
  params: {
    cardId: string;
    type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST";
    points: number;
    description?: string;
    transactionId?: string;
  }
): Promise<number> {
  const current = await getRewardBalance(db, params.cardId);
  const balanceAfter = roundMoney(current + params.points);
  await db.cardRewardLedger.create({
    data: {
      cardId: params.cardId,
      type: params.type,
      points: params.points,
      balanceAfter,
      description: params.description ?? null,
      transactionId: params.transactionId ?? null,
    },
  });
  return balanceAfter;
}

/** Soma líquida das cargas de uma fatura (REFUND abate; o resto soma). */
export function invoiceItemsTotal(items: { type: string; amount: number }[]): number {
  return roundMoney(
    items.reduce((acc, i) => acc + (i.type === "REFUND" ? -i.amount : i.amount), 0)
  );
}

/**
 * Fecha uma fatura: snapshot do total, define status (PAID se já quitada, senão
 * CLOSED) e materializa a fatura da próxima competência. Sem guarda de sessão —
 * use a action `closeInvoice` (que valida sessão) a partir da UI; o cron chama
 * esta função diretamente.
 */
export async function closeInvoiceInternal(
  invoiceId: string
): Promise<{ ok: true; cardId: string } | { ok: false; error: string }> {
  const invoice = await prisma.creditCardInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { select: { type: true, amount: true } },
      card: { select: { id: true, closingDay: true, dueDay: true } },
    },
  });
  if (!invoice) return { ok: false, error: "Fatura não encontrada." };

  const total = invoiceItemsTotal(invoice.items);
  const status = invoice.paidAmount >= total && total > 0 ? "PAID" : "CLOSED";

  await prisma.$transaction(async (tx) => {
    await tx.creditCardInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: total, status },
    });
    const next = shiftCompetence(
      { month: invoice.referenceMonth, year: invoice.referenceYear },
      1
    );
    await ensureInvoice(tx, invoice.card, next);
  });

  return { ok: true, cardId: invoice.cardId };
}
