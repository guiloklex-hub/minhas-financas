import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";

/**
 * Uma categoria cujo gasto do mês corrente destoa da média recente.
 */
export type Anomaly = {
  categoryId: string;
  name: string;
  color: string | null;
  /** Total gasto (EXPENSE, isTransfer:false) na categoria no mês corrente. */
  currentAmount: number;
  /** Média mensal de gasto da categoria nos 3 meses anteriores. */
  average: number;
  /** Variação percentual do mês corrente sobre a média (ex.: 75 = +75%). */
  deltaPct: number;
};

/** Fator de corte: mês corrente precisa superar a média neste múltiplo. */
const SPIKE_FACTOR = 1.4;
/** Diferença mínima absoluta (R$) para evitar ruído em valores pequenos. */
const MIN_ABS_DELTA = 50;
/** Quantidade de meses anteriores usados na média. */
const LOOKBACK_MONTHS = 3;

/**
 * Detecta categorias com gasto anômalo no mês corrente comparando-o com a média
 * dos {@link LOOKBACK_MONTHS} meses anteriores.
 *
 * Regra (determinística): sinaliza quando
 *   currentAmount > média * {@link SPIKE_FACTOR}  E
 *   (currentAmount - média) >= {@link MIN_ABS_DELTA}.
 *
 * Considera apenas despesas (`type: "EXPENSE"`) que não sejam transferências
 * (`isTransfer: false`). Categorias sem histórico (média 0) nunca são flagadas,
 * pois o corte absoluto contra média 0 exigiria média positiva — evita falso
 * positivo de "primeira aparição".
 *
 * A IA NÃO participa deste cálculo: números são sempre derivados em código.
 */
export async function detectAnomalies(now: Date = new Date()): Promise<Anomaly[]> {
  const year = now.getFullYear();
  const month = now.getMonth();

  // Janela: início dos 3 meses anteriores .. fim do mês corrente.
  // UTC para casar com as datas das transações (meia-noite UTC).
  const windowStart = new Date(Date.UTC(year, month - LOOKBACK_MONTHS, 1, 0, 0, 0, 0));
  const currentMonthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const currentMonthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const transactions = await prisma.transaction.findMany({
    where: {
      type: "EXPENSE",
      isTransfer: false,
      date: { gte: windowStart, lte: currentMonthEnd },
    },
    include: { category: true },
  });

  // Acumula, por categoria, o gasto do mês corrente e o gasto histórico (somado
  // ao longo dos meses anteriores, depois dividido por LOOKBACK_MONTHS).
  const byCategory = new Map<
    string,
    { name: string; color: string | null; current: number; pastSum: number }
  >();

  for (const tx of transactions) {
    if (!tx.category) continue;

    const entry = byCategory.get(tx.categoryId) ?? {
      name: tx.category.name,
      color: tx.category.color,
      current: 0,
      pastSum: 0,
    };

    if (tx.date >= currentMonthStart) {
      entry.current += tx.amount;
    } else {
      entry.pastSum += tx.amount;
    }

    byCategory.set(tx.categoryId, entry);
  }

  const anomalies: Anomaly[] = [];

  for (const [categoryId, entry] of byCategory) {
    const currentAmount = roundMoney(entry.current);
    const average = roundMoney(entry.pastSum / LOOKBACK_MONTHS);

    if (average <= 0) continue;

    const exceedsFactor = currentAmount > average * SPIKE_FACTOR;
    const exceedsAbsolute = currentAmount - average >= MIN_ABS_DELTA;

    if (exceedsFactor && exceedsAbsolute) {
      const deltaPct = roundMoney(((currentAmount - average) / average) * 100);
      anomalies.push({
        categoryId,
        name: entry.name,
        color: entry.color,
        currentAmount,
        average,
        deltaPct,
      });
    }
  }

  // Maior desvio percentual primeiro.
  anomalies.sort((a, b) => b.deltaPct - a.deltaPct);

  return anomalies;
}
