import "server-only";
import { prisma } from "./prisma";
import { createNotification } from "./notifications";
import { computeCardSummary, computeRevolvingInterest } from "./credit-card";
import { closeInvoiceInternal, ensureInvoiceForDate } from "./credit-card-service";
import { detectSubscriptions } from "./subscriptions";

const currency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/** Cria a notificação só se ainda não houve uma com o mesmo título hoje. */
async function createIfNotToday(
  startOfToday: Date,
  input: { title: string; body: string; url?: string; type: "WARNING" | "DANGER" | "INFO" }
): Promise<number> {
  const existing = await prisma.notification.findFirst({
    where: { title: input.title, createdAt: { gte: startOfToday } },
    select: { id: true },
  });
  if (existing) return 0;
  await createNotification(input);
  return 1;
}

/** Cria a notificação só se NUNCA houve uma com o mesmo título (alerta único). */
async function createOnce(input: {
  title: string;
  body: string;
  url?: string;
  type: "WARNING" | "DANGER" | "INFO";
}): Promise<number> {
  const existing = await prisma.notification.findFirst({
    where: { title: input.title },
    select: { id: true },
  });
  if (existing) return 0;
  await createNotification(input);
  return 1;
}

/**
 * Rotinas diárias do cartão (chamadas pelo cron):
 *  - fecha faturas cujo fechamento já passou (snapshot + abre a próxima);
 *  - marca como OVERDUE faturas vencidas e não pagas (alerta DANGER);
 *  - alerta vencimento próximo (<= 3 dias) e utilização de limite > 80%.
 * Datas em horário local; dedupe diária por título evita spam.
 */
export async function runCreditCardJobs(now: Date): Promise<{
  invoicesClosed: number;
  cardAlerts: number;
}> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inThreeDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 23, 59, 59, 999);

  let invoicesClosed = 0;
  let cardAlerts = 0;

  // 1) Fecha faturas OPEN cujo fechamento já passou.
  const toClose = await prisma.creditCardInvoice.findMany({
    where: { status: "OPEN", closingDate: { lte: now } },
    include: { card: { select: { name: true } } },
  });
  for (const inv of toClose) {
    const result = await closeInvoiceInternal(inv.id);
    if (result.ok) {
      invoicesClosed += 1;
      const monthLabel = `${String(inv.referenceMonth).padStart(2, "0")}/${inv.referenceYear}`;
      cardAlerts += await createIfNotToday(startOfToday, {
        title: `Fatura fechada: ${inv.card.name} (${monthLabel})`,
        body: `A fatura de ${inv.card.name} (${monthLabel}) fechou. Confira o valor e a data de vencimento.`,
        url: `/cartoes/${inv.cardId}`,
        type: "INFO",
      });
    }
  }

  // 2) Faturas vencidas e não pagas -> OVERDUE + DANGER + juros do rotativo (uma vez).
  const overdueCandidates = await prisma.creditCardInvoice.findMany({
    where: { status: { in: ["CLOSED", "PARTIAL"] }, dueDate: { lt: startOfToday } },
    include: { card: { select: { name: true, closingDay: true, dueDay: true } } },
  });
  for (const inv of overdueCandidates) {
    if (inv.paidAmount >= inv.totalAmount && inv.totalAmount > 0) continue;
    await prisma.creditCardInvoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
    const monthLabel = `${String(inv.referenceMonth).padStart(2, "0")}/${inv.referenceYear}`;
    const outstanding = Math.max(0, inv.totalAmount - inv.paidAmount);

    cardAlerts += await createIfNotToday(startOfToday, {
      title: `Fatura vencida: ${inv.card.name} (${monthLabel})`,
      body: `A fatura de ${inv.card.name} (${monthLabel}) está vencida. Saldo em aberto: ${currency(outstanding)}.`,
      url: `/cartoes/${inv.cardId}`,
      type: "DANGER",
    });

    // Juros do rotativo: lançados uma única vez sobre o saldo da fatura vencida,
    // na fatura aberta atual. Dedupe pelo título que referencia a competência.
    const interest = computeRevolvingInterest(outstanding);
    if (interest > 0) {
      const interestTitle = `Juros rotativo ${monthLabel}`;
      const already = await prisma.creditCardTransaction.findFirst({
        where: { cardId: inv.cardId, type: "INTEREST", title: interestTitle },
        select: { id: true },
      });
      if (!already) {
        const invoiceId = await ensureInvoiceForDate(
          prisma,
          { id: inv.cardId, closingDay: inv.card.closingDay, dueDay: inv.card.dueDay },
          now
        );
        await prisma.creditCardTransaction.create({
          data: { cardId: inv.cardId, title: interestTitle, amount: interest, date: now, type: "INTEREST", invoiceId },
        });
      }
    }
  }

  // 3) Vencimento próximo (<= 3 dias) para faturas não pagas.
  const dueSoon = await prisma.creditCardInvoice.findMany({
    where: {
      status: { in: ["CLOSED", "PARTIAL"] },
      dueDate: { gte: startOfToday, lte: inThreeDays },
    },
    include: { card: { select: { name: true } } },
  });
  for (const inv of dueSoon) {
    if (inv.paidAmount >= inv.totalAmount && inv.totalAmount > 0) continue;
    const monthLabel = `${String(inv.referenceMonth).padStart(2, "0")}/${inv.referenceYear}`;
    const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(inv.dueDate);
    cardAlerts += await createIfNotToday(startOfToday, {
      title: `Fatura a vencer: ${inv.card.name} (${monthLabel})`,
      body: `A fatura de ${inv.card.name} vence em ${dateLabel}. Valor: ${currency(
        Math.max(0, inv.totalAmount - inv.paidAmount)
      )}.`,
      url: `/cartoes/${inv.cardId}`,
      type: "WARNING",
    });
  }

  // 4) Cartões ativos: anuidade anual + utilização de limite > 80%.
  const cards = await prisma.creditCard.findMany({
    where: { archived: false },
    include: {
      transactions: { select: { type: true, amount: true, date: true, title: true } },
      invoices: { select: { paidAmount: true } },
    },
  });
  for (const card of cards) {
    // 4a) Anuidade: cobra uma vez por ano, no mês de aniversário do cadastro.
    if (card.annualFee > 0 && card.createdAt.getMonth() === now.getMonth()) {
      const feeTitle = `Anuidade ${now.getFullYear()}`;
      const already = await prisma.creditCardTransaction.findFirst({
        where: { cardId: card.id, type: "FEE", title: feeTitle },
        select: { id: true },
      });
      if (!already) {
        const invoiceId = await ensureInvoiceForDate(prisma, card, now);
        await prisma.creditCardTransaction.create({
          data: { cardId: card.id, title: feeTitle, amount: card.annualFee, date: now, type: "FEE", invoiceId },
        });
        cardAlerts += await createIfNotToday(startOfToday, {
          title: `Anuidade lançada: ${card.name}`,
          body: `A anuidade de ${currency(card.annualFee)} do cartão ${card.name} foi lançada na fatura.`,
          url: `/cartoes/${card.id}`,
          type: "INFO",
        });
      }
    }

    // 4b) Utilização de limite > 80%.
    if (card.creditLimit <= 0) continue;
    const paidTotal = card.invoices.reduce((acc, i) => acc + i.paidAmount, 0);
    const summary = computeCardSummary({
      creditLimit: card.creditLimit,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      transactions: card.transactions,
      paidTotal,
      now,
    });
    if (summary.usagePercent < 80) continue;
    cardAlerts += await createIfNotToday(startOfToday, {
      title: `Limite do cartão em ${summary.usagePercent.toFixed(0)}%: ${card.name}`,
      body: `Você já usou ${summary.usagePercent.toFixed(0)}% do limite de ${card.name}. Disponível: ${currency(
        summary.availableLimit
      )}.`,
      url: `/cartoes/${card.id}`,
      type: summary.usagePercent >= 100 ? "DANGER" : "WARNING",
    });
  }

  // 5) Assinaturas recém-detectadas (alerta único por assinatura/cartão).
  for (const card of cards) {
    const subs = detectSubscriptions(card.transactions);
    for (const sub of subs) {
      cardAlerts += await createOnce({
        title: `Assinatura detectada: ${sub.title} (${card.name})`,
        body: `Identificamos uma cobrança recorrente de ${currency(sub.averageAmount)}/mês (${sub.title}) no cartão ${card.name}. Revise se ainda usa.`,
        url: `/cartoes/${card.id}`,
        type: "INFO",
      });
    }
  }

  return { invoicesClosed, cardAlerts };
}
