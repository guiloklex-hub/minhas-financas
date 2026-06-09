"use server"

import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";
import { getSession } from "@/lib/session";

/** Um ponto mensal do fluxo de caixa. `cumulative` acumula `net` ao longo do intervalo. */
export type CashFlowPoint = {
  month: string; // "MM/AAAA"
  income: number;
  expense: number;
  net: number;
  cumulative: number;
};

/** Comparação mês a mês entre dois anos (ano informado vs. ano anterior). */
export type YearComparisonPoint = {
  month: string; // "MM/AAAA" (referente ao ano corrente da comparação)
  currentYear: { income: number; expense: number };
  previousYear: { income: number; expense: number };
};

/** Total de despesas de uma categoria em um intervalo. */
export type CategoryBreakdownItem = {
  categoryId: string;
  name: string;
  color: string | null;
  amount: number;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

// Tipos de lançamento do cartão que contam como gasto. REFUND abate o total.
const CARD_SPEND_TYPES = ["PURCHASE", "FEE", "INTEREST", "ADJUSTMENT", "REFUND"];
const cardSign = (type: string): number => (type === "REFUND" ? -1 : 1);
// Intervalo máximo aceito em consultas por data (em milissegundos). ~5 anos.
const MAX_RANGE_MS = 5 * 366 * 24 * 60 * 60 * 1000;

/**
 * Valida um par de datas ISO (from/to) e devolve as `Date` correspondentes.
 * Lança erro se alguma data for inválida, se `from > to` ou se o intervalo
 * exceder o limite de ~5 anos.
 */
function parseDateRange(fromISO: string, toISO: string): { from: Date; to: Date } {
  const from = new Date(fromISO);
  const to = new Date(toISO);

  if (Number.isNaN(from.getTime())) {
    throw new Error("Data inicial inválida.");
  }
  if (Number.isNaN(to.getTime())) {
    throw new Error("Data final inválida.");
  }
  if (from.getTime() > to.getTime()) {
    throw new Error("A data inicial deve ser anterior ou igual à data final.");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new Error("O intervalo não pode exceder 5 anos.");
  }

  return { from, to };
}

/**
 * Chave canônica de bucket mensal "MM/AAAA" a partir de uma data, em UTC.
 *
 * Usamos UTC de ponta a ponta porque datas ISO no formato "YYYY-MM-DD" são
 * interpretadas pelo JS como meia-noite UTC; usar getters locais deslocaria os
 * extremos do intervalo para o mês adjacente em fusos atrás de UTC (ex.: BRT).
 */
function monthKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${month}/${date.getUTCFullYear()}`;
}

/**
 * Gera a lista ordenada de chaves "MM/AAAA" cobrindo o intervalo [from, to],
 * mês a mês (inclusive os extremos), garantindo buckets vazios quando não há
 * transações em um determinado mês. Calculado em UTC (ver `monthKey`).
 */
function monthKeysInRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth(); // 0-based
  const endYear = to.getUTCFullYear();
  const endMonth = to.getUTCMonth();

  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${String(month + 1).padStart(2, "0")}/${year}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

/**
 * Fluxo de caixa mensal no intervalo informado.
 *
 * Retorna um ponto por mês (inclusive meses sem movimento) com receitas,
 * despesas, saldo do mês (`net`) e saldo acumulado (`cumulative`). Considera
 * apenas transações que NÃO são transferências (`isTransfer: false`), pois
 * transferências não representam receita/despesa.
 */
export async function getCashFlow(fromISO: string, toISO: string): Promise<CashFlowPoint[]> {
  const session = await getSession();
  if (!session) throw new Error("Não autorizado.");
  const { from, to } = parseDateRange(fromISO, toISO);

  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const transactions = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      date: { gte: from, lte: end },
    },
    select: { amount: true, type: true, date: true },
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const key of monthKeysInRange(from, to)) {
    buckets.set(key, { income: 0, expense: 0 });
  }

  for (const tx of transactions) {
    const key = monthKey(tx.date);
    const bucket = buckets.get(key);
    if (!bucket) continue; // fora do range esperado (defensivo)
    if (tx.type === "INCOME") bucket.income += tx.amount;
    else if (tx.type === "EXPENSE") bucket.expense += tx.amount;
  }

  // Soma o gasto do cartão como despesa (compras vivem fora de Transaction).
  const cardTxns = await prisma.creditCardTransaction.findMany({
    where: { type: { in: CARD_SPEND_TYPES }, date: { gte: from, lte: end } },
    select: { amount: true, type: true, date: true },
  });
  for (const c of cardTxns) {
    const bucket = buckets.get(monthKey(c.date));
    if (!bucket) continue;
    bucket.expense += cardSign(c.type) * c.amount;
  }

  let cumulative = 0;
  const result: CashFlowPoint[] = [];
  for (const [month, bucket] of buckets) {
    const income = roundMoney(bucket.income);
    const expense = roundMoney(bucket.expense);
    const net = roundMoney(income - expense);
    cumulative = roundMoney(cumulative + net);
    result.push({ month, income, expense, net, cumulative });
  }

  return result;
}

/**
 * Comparativo ano-a-ano (YoY): para cada um dos 12 meses, devolve receitas e
 * despesas do `year` informado e do `year - 1`. Sempre retorna 12 entradas
 * (jan..dez), mesmo que algum mês não tenha movimento.
 *
 * Ignora transferências (`isTransfer: false`).
 */
export async function getYearComparison(year: number): Promise<YearComparisonPoint[]> {
  const session = await getSession();
  if (!session) throw new Error("Não autorizado.");

  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`Ano deve ser um inteiro entre ${MIN_YEAR} e ${MAX_YEAR}.`);
  }

  const previousYear = year - 1;
  // Intervalo total: 01/jan do ano anterior até 31/dez do ano corrente, em UTC
  // (consistente com o bucketing UTC usado em todo o módulo).
  const start = new Date(Date.UTC(previousYear, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const transactions = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      date: { gte: start, lte: end },
    },
    select: { amount: true, type: true, date: true },
  });

  // 12 buckets por ano (índice 0..11 = jan..dez).
  const current = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  const previous = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));

  for (const tx of transactions) {
    const txYear = tx.date.getUTCFullYear();
    const monthIndex = tx.date.getUTCMonth();
    const target = txYear === year ? current : txYear === previousYear ? previous : null;
    if (!target) continue;
    const bucket = target[monthIndex];
    if (tx.type === "INCOME") bucket.income += tx.amount;
    else if (tx.type === "EXPENSE") bucket.expense += tx.amount;
  }

  // Soma o gasto do cartão como despesa nos buckets de cada ano.
  const cardTxns = await prisma.creditCardTransaction.findMany({
    where: { type: { in: CARD_SPEND_TYPES }, date: { gte: start, lte: end } },
    select: { amount: true, type: true, date: true },
  });
  for (const c of cardTxns) {
    const cYear = c.date.getUTCFullYear();
    const target = cYear === year ? current : cYear === previousYear ? previous : null;
    if (!target) continue;
    target[c.date.getUTCMonth()].expense += cardSign(c.type) * c.amount;
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: `${String(i + 1).padStart(2, "0")}/${year}`,
    currentYear: {
      income: roundMoney(current[i].income),
      expense: roundMoney(current[i].expense),
    },
    previousYear: {
      income: roundMoney(previous[i].income),
      expense: roundMoney(previous[i].expense),
    },
  }));
}

/**
 * Despesas agrupadas por categoria no intervalo, ordenadas do maior para o
 * menor valor. Considera apenas transações de despesa que não são
 * transferências (`isTransfer: false`). Transações sem categoria carregada
 * são ignoradas.
 */
export async function getCategoryBreakdown(
  fromISO: string,
  toISO: string
): Promise<CategoryBreakdownItem[]> {
  const session = await getSession();
  if (!session) throw new Error("Não autorizado.");
  const { from, to } = parseDateRange(fromISO, toISO);

  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const transactions = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      isTransfer: false,
      date: { gte: from, lte: end },
    },
    include: { category: true },
  });

  const totals = new Map<string, { name: string; color: string | null; amount: number }>();
  for (const tx of transactions) {
    if (!tx.category) continue;
    const existing = totals.get(tx.categoryId);
    if (existing) {
      existing.amount += tx.amount;
    } else {
      totals.set(tx.categoryId, {
        name: tx.category.name,
        color: tx.category.color,
        amount: tx.amount,
      });
    }
  }

  // Soma o gasto do cartão por categoria (compras vivem fora de Transaction).
  const cardTxns = await prisma.creditCardTransaction.findMany({
    where: { type: { in: CARD_SPEND_TYPES }, date: { gte: from, lte: end }, categoryId: { not: null } },
    include: { category: true },
  });
  for (const c of cardTxns) {
    if (!c.category || !c.categoryId) continue;
    const existing = totals.get(c.categoryId);
    const delta = cardSign(c.type) * c.amount;
    if (existing) {
      existing.amount += delta;
    } else {
      totals.set(c.categoryId, { name: c.category.name, color: c.category.color, amount: delta });
    }
  }

  return Array.from(totals.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      color: data.color,
      amount: roundMoney(data.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}
