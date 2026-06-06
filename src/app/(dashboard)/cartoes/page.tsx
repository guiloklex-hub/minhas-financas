import { prisma } from "@/lib/prisma";
import { computeCardSummary } from "@/lib/credit-card";
import CardsList from "./CardsList";

export const metadata = {
  title: "Cartões de Crédito | Gerenciador de Finanças",
};

export default async function CartoesPage() {
  const now = new Date();

  const cards = await prisma.creditCard.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    include: {
      transactions: { select: { type: true, amount: true, date: true } },
      invoices: { select: { paidAmount: true } },
    },
  });

  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const cardsForClient = cards.map((card) => {
    const paidTotal = card.invoices.reduce((acc, i) => acc + i.paidAmount, 0);
    const summary = computeCardSummary({
      creditLimit: card.creditLimit,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      transactions: card.transactions,
      paidTotal,
      now,
    });
    return {
      id: card.id,
      name: card.name,
      brand: card.brand,
      lastFour: card.lastFour,
      color: card.color,
      currency: card.currency,
      creditLimit: card.creditLimit,
      totalOwed: summary.totalOwed,
      currentInvoiceTotal: summary.currentInvoiceTotal,
      availableLimit: summary.availableLimit,
      usagePercent: summary.usagePercent,
      nextDueDate: summary.nextDueDate.toISOString(),
    };
  });

  return (
    <div className="max-w-5xl mx-auto py-6">
      <CardsList cards={cardsForClient} accounts={accounts} />
    </div>
  );
}
