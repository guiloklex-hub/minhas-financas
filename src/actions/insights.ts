"use server"

import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";
import { getSession } from "@/lib/session";
import { getCardSpendByCategory, getCardSpendTotal } from "@/lib/card-spend";

export type InsightsPayload = {
  mom: {
    variationPercentage: number;
    direction: "UP" | "DOWN" | "FLAT";
    previousMonthTotal: number;
    currentMonthTotal: number;
    text: string;
  };
  topExpenses: Array<{
    categoryId: string;
    categoryName: string;
    color: string | null;
    amount: number;
  }>;
  forecast: {
    currentSpend: number;
    estimatedEndOfMonth: number;
    dailyAverage: number;
    text: string;
  };
  budgetAlerts: Array<{
    categoryId: string;
    categoryName: string;
    limit: number;
    spent: number;
    usagePercentage: number;
  }>;
};

export async function getInsightsData(): Promise<InsightsPayload> {
  const session = await getSession();
  if (!session) throw new Error("Não autorizado.");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Bordas de mês em UTC para casar com as datas das transações (meia-noite
  // UTC) e evitar off-by-one nas viradas de mês em fusos negativos (ex.: BRT).
  const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth, 1));
  const currentMonthEnd = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59));

  const previousMonthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59));

  // 1. Fetch current month expenses
  const currentExpenses = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      isTransfer: false,
      date: { gte: currentMonthStart, lte: currentMonthEnd }
    },
    include: { category: true }
  });

  // 2. Fetch previous month expenses
  const previousExpenses = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      isTransfer: false,
      date: { gte: previousMonthStart, lte: previousMonthEnd }
    }
  });

  // Limites exclusivos (início do próximo mês) para somar o gasto do cartão.
  const currentNextMonthStart = new Date(Date.UTC(currentYear, currentMonth + 1, 1));

  // Gasto do cartão (compras vivem fora da tabela Transaction). O pagamento da
  // fatura é uma Transaction isTransfer e fica fora — evita dupla contagem.
  const currentCardByCat = await getCardSpendByCategory(currentMonthStart, currentNextMonthStart);
  const currentCardTotal = await getCardSpendTotal(currentMonthStart, currentNextMonthStart);
  const previousCardTotal = await getCardSpendTotal(previousMonthStart, currentMonthStart);

  // Mapa de categorias para resolver nome/cor de gastos que vieram só do cartão.
  const categories = await prisma.category.findMany({ select: { id: true, name: true, color: true } });
  const categoryInfo = new Map(categories.map((c) => [c.id, { name: c.name, color: c.color }]));

  const currentTotal = roundMoney(
    currentExpenses.reduce((acc, t) => acc + t.amount, 0) + currentCardTotal
  );
  const previousTotal = roundMoney(
    previousExpenses.reduce((acc, t) => acc + t.amount, 0) + previousCardTotal
  );

  // 3. MoM Calculation
  let variation = 0;
  if (previousTotal > 0) {
    variation = ((currentTotal - previousTotal) / previousTotal) * 100;
  } else if (currentTotal > 0) {
    variation = 100;
  }

  const direction = variation > 0 ? "UP" : variation < 0 ? "DOWN" : "FLAT";
  const absVariation = Math.abs(variation).toFixed(1);
  
  let momText = "Seus gastos se mantiveram estáveis em relação ao mês anterior.";
  if (direction === "UP") {
    momText = `Atenção: seus gastos subiram ${absVariation}% em relação ao mês passado.`;
  } else if (direction === "DOWN") {
    momText = `Ótima notícia! Seus gastos caíram ${absVariation}% em relação ao mês passado.`;
  }

  // 4. Top 3 Expenses (Grouped by Category)
  const categoryTotals: Record<string, { amount: number, name: string, color: string | null }> = {};
  for (const t of currentExpenses) {
    if (t.category) {
      if (!categoryTotals[t.categoryId]) {
        categoryTotals[t.categoryId] = { amount: 0, name: t.category.name, color: t.category.color };
      }
      categoryTotals[t.categoryId].amount += t.amount;
    }
  }

  // Soma o gasto do cartão por categoria (ignora lançamentos sem categoria: "").
  for (const [categoryId, amount] of currentCardByCat) {
    if (!categoryId) continue;
    const info = categoryInfo.get(categoryId);
    if (!categoryTotals[categoryId]) {
      categoryTotals[categoryId] = {
        amount: 0,
        name: info?.name ?? "Sem categoria",
        color: info?.color ?? null,
      };
    }
    categoryTotals[categoryId].amount += amount;
  }

  const topExpenses = Object.entries(categoryTotals)
    .map(([id, data]) => ({
      categoryId: id,
      categoryName: data.name,
      color: data.color,
      amount: roundMoney(data.amount)
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // 5. Forecast Calculation
  const daysPassed = Math.max(1, currentDay);
  const dailyAverage = roundMoney(currentTotal / daysPassed);
  const estimatedEndOfMonth = roundMoney(dailyAverage * daysInMonth);
  
  const formatCompact = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const forecastText = `Com base na sua média de gastos diária (${formatCompact(dailyAverage)}/dia), a projeção é que você encerre o mês com um total de ${formatCompact(estimatedEndOfMonth)}.`;

  // 6. Budget Alerts (> 80% usage)
  // O Month no orcamentos/BudgetForm.tsx usa (now.getMonth() + 1).
  const budgets = await prisma.budget.findMany({
    where: {
      month: currentMonth + 1,
      year: currentYear
    },
    include: { category: true }
  });

  const budgetAlerts = [];
  for (const budget of budgets) {
    const spentInCategory = roundMoney(categoryTotals[budget.categoryId]?.amount || 0);
    const usagePercentage = (spentInCategory / budget.amountLimit) * 100;

    if (usagePercentage >= 80) {
      budgetAlerts.push({
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        limit: budget.amountLimit,
        spent: spentInCategory,
        usagePercentage
      });
    }
  }

  return {
    mom: {
      variationPercentage: variation,
      direction,
      previousMonthTotal: previousTotal,
      currentMonthTotal: currentTotal,
      text: momText
    },
    topExpenses,
    forecast: {
      currentSpend: currentTotal,
      estimatedEndOfMonth,
      dailyAverage,
      text: forecastText
    },
    budgetAlerts
  };
}
