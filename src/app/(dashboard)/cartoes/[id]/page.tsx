import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeCardSummary, computeVirtualCardUsage } from "@/lib/credit-card";
import { invoiceItemsTotal, getRewardBalance } from "@/lib/credit-card-service";
import { detectSubscriptions } from "@/lib/subscriptions";
import { forecastInvoices } from "@/lib/credit-card-forecast";
import CardDetailClient from "./CardDetailClient";

export const metadata = {
  title: "Detalhe do Cartão | Gerenciador de Finanças",
};

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();

  const card = await prisma.creditCard.findUnique({ where: { id } });
  if (!card || card.archived) notFound();

  const invoices = await prisma.creditCardInvoice.findMany({
    where: { cardId: id },
    orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
    include: {
      items: {
        orderBy: { date: "asc" },
        include: {
          category: { select: { name: true, color: true } },
          virtualCard: { select: { name: true, color: true } },
        },
      },
    },
  });

  const allTxns = await prisma.creditCardTransaction.findMany({
    where: { cardId: id },
    select: { type: true, amount: true, date: true, title: true, installmentNumber: true, virtualCardId: true },
  });

  const virtualCards = await prisma.virtualCard.findMany({
    where: { cardId: id, archived: false },
    orderBy: { createdAt: "asc" },
  });
  const vcUsage = computeVirtualCardUsage({ transactions: allTxns, closingDay: card.closingDay, now });
  const paidTotal = invoices.reduce((acc, i) => acc + i.paidAmount, 0);

  const summary = computeCardSummary({
    creditLimit: card.creditLimit,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    transactions: allTxns,
    paidTotal,
    now,
  });

  // Assinaturas detectadas e projeção das próximas faturas (determinístico).
  const subscriptions = detectSubscriptions(allTxns).map((s) => ({
    title: s.title,
    averageAmount: s.averageAmount,
    months: s.months,
    lastDate: s.lastDate.toISOString(),
  }));
  const forecast = forecastInvoices({
    now,
    closingDay: card.closingDay,
    transactions: allTxns,
    monthsAhead: 4,
  });

  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const invoicesForClient = invoices.map((inv) => {
    const computedTotal = inv.totalAmount > 0 ? inv.totalAmount : invoiceItemsTotal(inv.items);
    return {
      id: inv.id,
      referenceMonth: inv.referenceMonth,
      referenceYear: inv.referenceYear,
      status: inv.status,
      total: computedTotal,
      paidAmount: inv.paidAmount,
      outstanding: Math.max(0, computedTotal - inv.paidAmount),
      closingDate: inv.closingDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      items: inv.items.map((it) => ({
        id: it.id,
        title: it.title,
        amount: it.amount,
        date: it.date.toISOString(),
        type: it.type,
        installmentNumber: it.installmentNumber,
        installmentTotal: it.installmentTotal,
        categoryName: it.category?.name ?? null,
        categoryColor: it.category?.color ?? null,
        virtualCardId: it.virtualCardId,
        virtualCardName: it.virtualCard?.name ?? null,
        virtualCardColor: it.virtualCard?.color ?? null,
      })),
    };
  });

  const rewardBalance = await getRewardBalance(prisma, id);

  const virtualCardsForClient = virtualCards.map((vc) => ({
    id: vc.id,
    name: vc.name,
    lastFour: vc.lastFour,
    color: vc.color,
    spendingLimit: vc.spendingLimit,
    used: vcUsage.get(vc.id) ?? 0,
  }));

  const cardForClient = {
    id: card.id,
    name: card.name,
    brand: card.brand,
    lastFour: card.lastFour,
    color: card.color,
    currency: card.currency,
    creditLimit: card.creditLimit,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    paymentAccountId: card.paymentAccountId,
    rewardType: card.rewardType,
    rewardBalance,
  };

  const summaryForClient = {
    totalOwed: summary.totalOwed,
    currentInvoiceTotal: summary.currentInvoiceTotal,
    committedFuture: summary.committedFuture,
    availableLimit: summary.availableLimit,
    usagePercent: summary.usagePercent,
    nextClosingDate: summary.nextClosingDate.toISOString(),
    nextDueDate: summary.nextDueDate.toISOString(),
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <CardDetailClient
        card={cardForClient}
        summary={summaryForClient}
        invoices={invoicesForClient}
        accounts={accounts}
        categories={categories}
        subscriptions={subscriptions}
        forecast={forecast}
        virtualCards={virtualCardsForClient}
      />
    </div>
  );
}
