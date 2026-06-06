import "server-only";
import { prisma } from "./prisma";
import { roundMoney } from "./money";

/**
 * Integração do gasto do cartão com os relatórios/orçamentos do app.
 *
 * As compras do cartão vivem em CreditCardTransaction (fora da tabela
 * Transaction), então os relatórios de despesa precisam somá-las explicitamente.
 * O gasto real é Σ(PURCHASE+FEE+INTEREST) − Σ(REFUND). O pagamento da fatura NÃO
 * entra aqui (ele é uma Transaction isTransfer, fora das KPIs) — assim não há
 * dupla contagem.
 */

const SPEND_TYPES = ["PURCHASE", "FEE", "INTEREST", "ADJUSTMENT", "REFUND"];

/** Sinal contábil: REFUND abate, o resto soma. */
function sign(type: string): number {
  return type === "REFUND" ? -1 : 1;
}

/**
 * Gasto líquido do cartão por categoria no intervalo [start, end).
 * Lançamentos sem categoria ficam sob a chave "" (vazia).
 */
export async function getCardSpendByCategory(
  start: Date,
  end: Date
): Promise<Map<string, number>> {
  const rows = await prisma.creditCardTransaction.findMany({
    where: { type: { in: SPEND_TYPES }, date: { gte: start, lt: end } },
    select: { categoryId: true, type: true, amount: true },
  });

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    const key = r.categoryId ?? "";
    byCategory.set(key, (byCategory.get(key) ?? 0) + sign(r.type) * r.amount);
  }

  for (const [key, value] of byCategory) {
    byCategory.set(key, roundMoney(value));
  }
  return byCategory;
}

/** Gasto líquido total do cartão no intervalo [start, end). */
export async function getCardSpendTotal(start: Date, end: Date): Promise<number> {
  const rows = await prisma.creditCardTransaction.findMany({
    where: { type: { in: SPEND_TYPES }, date: { gte: start, lt: end } },
    select: { type: true, amount: true },
  });
  return roundMoney(rows.reduce((acc, r) => acc + sign(r.type) * r.amount, 0));
}

/** Gasto líquido do cartão de uma categoria específica no intervalo [start, end). */
export async function getCardSpendForCategory(
  categoryId: string,
  start: Date,
  end: Date
): Promise<number> {
  const rows = await prisma.creditCardTransaction.findMany({
    where: { categoryId, type: { in: SPEND_TYPES }, date: { gte: start, lt: end } },
    select: { type: true, amount: true },
  });
  return roundMoney(rows.reduce((acc, r) => acc + sign(r.type) * r.amount, 0));
}
