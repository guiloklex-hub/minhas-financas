import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";

/**
 * Projeção de caixa para um mês futuro.
 */
export type ForecastPoint = {
  /** Rótulo do mês no formato MM/YYYY. */
  month: string;
  /** Receita esperada (regras recorrentes + média histórica de receitas). */
  projectedIncome: number;
  /** Despesa esperada (regras recorrentes + média histórica de despesas). */
  projectedExpense: number;
  /** projectedIncome - projectedExpense. */
  projectedNet: number;
};

/** Quantidade de meses de histórico usados para a média. */
const LOOKBACK_MONTHS = 3;
/** Semanas médias por mês (52 / 12) para anualizar regras semanais. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Converte o valor de uma RecurringRule em seu equivalente mensal esperado.
 *
 * - MONTHLY: o próprio valor.
 * - WEEKLY: valor * (52/12) — média de semanas por mês.
 * - YEARLY: valor / 12.
 * - Frequência desconhecida: 0 (não projeta o que não sabe avançar).
 */
function monthlyEquivalent(amount: number, frequency: string): number {
  if (frequency === "MONTHLY") return amount;
  if (frequency === "WEEKLY") return amount * WEEKS_PER_MONTH;
  if (frequency === "YEARLY") return amount / 12;
  return 0;
}

/**
 * Projeta o fluxo de caixa dos próximos {@link monthsAhead} meses de forma
 * determinística (sem IA): para cada mês futuro soma
 *
 *   (receita/despesa mensal esperada das RecurringRule ativas)
 *   +
 *   (média mensal de receitas/despesas dos últimos {@link LOOKBACK_MONTHS} meses,
 *    excluindo transferências).
 *
 * A média histórica captura gastos avulsos que não viram regra; as regras
 * recorrentes garantem que compromissos fixos entrem mesmo sem histórico.
 *
 * O valor projetado é constante mês a mês (mesma base recorrente + mesma média),
 * variando apenas o rótulo do mês.
 */
export async function forecastCashFlow(
  monthsAhead: number = 3,
  now: Date = new Date()
): Promise<ForecastPoint[]> {
  const safeMonths = Math.max(0, Math.floor(monthsAhead));

  const year = now.getFullYear();
  const month = now.getMonth();

  // Histórico: dos LOOKBACK_MONTHS meses anteriores até o fim do mês anterior.
  const historyStart = new Date(year, month - LOOKBACK_MONTHS, 1, 0, 0, 0, 0);
  const historyEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const [rules, history] = await Promise.all([
    prisma.recurringRule.findMany({ where: { isActive: true } }),
    prisma.transaction.findMany({
      where: {
        isTransfer: false,
        date: { gte: historyStart, lte: historyEnd },
      },
    }),
  ]);

  // Base recorrente mensal por tipo.
  let recurringIncome = 0;
  let recurringExpense = 0;
  for (const rule of rules) {
    const monthly = monthlyEquivalent(rule.amount, rule.frequency);
    if (rule.type === "INCOME") recurringIncome += monthly;
    else if (rule.type === "EXPENSE") recurringExpense += monthly;
  }

  // Média histórica mensal por tipo.
  let historyIncomeSum = 0;
  let historyExpenseSum = 0;
  for (const tx of history) {
    if (tx.type === "INCOME") historyIncomeSum += tx.amount;
    else if (tx.type === "EXPENSE") historyExpenseSum += tx.amount;
  }
  const avgIncome = historyIncomeSum / LOOKBACK_MONTHS;
  const avgExpense = historyExpenseSum / LOOKBACK_MONTHS;

  const projectedIncome = roundMoney(recurringIncome + avgIncome);
  const projectedExpense = roundMoney(recurringExpense + avgExpense);
  const projectedNet = roundMoney(projectedIncome - projectedExpense);

  const points: ForecastPoint[] = [];
  for (let i = 1; i <= safeMonths; i++) {
    const target = new Date(year, month + i, 1);
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const label = `${mm}/${target.getFullYear()}`;

    points.push({
      month: label,
      projectedIncome,
      projectedExpense,
      projectedNet,
    });
  }

  return points;
}
