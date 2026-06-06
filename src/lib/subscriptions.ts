import { roundMoney } from "./money";
import { normalizeTitle } from "./categorization";

/**
 * Detecção de assinaturas/cobranças recorrentes no cartão — 100% determinística
 * (sem IA). Agrupa lançamentos por título normalizado e identifica os que se
 * repetem mês a mês com valor parecido. Útil para flagar "assinaturas-fantasma"
 * (estilo Rocket Money/Truebill). A IA, se usada depois, só rotula/explica.
 */

export type SubscriptionTxn = {
  title: string;
  amount: number;
  date: Date;
  type: string;
};

export type DetectedSubscription = {
  key: string; // título normalizado (chave do grupo)
  title: string; // título representativo (o mais recente)
  averageAmount: number;
  occurrences: number;
  months: number; // meses distintos com cobrança
  lastDate: Date;
  monthlyEstimate: number;
};

// Parâmetros do detector (determinísticos).
const MIN_MONTHS = 3; // precisa aparecer em >= 3 meses distintos
const AMOUNT_TOLERANCE = 0.15; // amplitude relativa (max-min)/avg aceita
const MAX_AVG_GAP_MONTHS = 1.6; // cadência ~mensal entre meses distintos

/** Índice de mês comparável: ano*12 + mês (UTC). */
function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/**
 * Detecta assinaturas a partir dos lançamentos do cartão. Considera apenas
 * compras (PURCHASE) — estornos, juros e taxas não são assinaturas.
 */
export function detectSubscriptions(transactions: SubscriptionTxn[]): DetectedSubscription[] {
  const groups = new Map<string, SubscriptionTxn[]>();
  for (const t of transactions) {
    if (t.type !== "PURCHASE") continue;
    const key = normalizeTitle(t.title);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const result: DetectedSubscription[] = [];

  for (const [key, items] of groups) {
    const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Meses distintos com cobrança.
    const monthSet = Array.from(new Set(sorted.map((t) => monthIndex(t.date)))).sort((a, b) => a - b);
    if (monthSet.length < MIN_MONTHS) continue;

    // Cadência ~mensal: média dos gaps entre meses distintos consecutivos.
    let gapSum = 0;
    for (let i = 1; i < monthSet.length; i++) gapSum += monthSet[i] - monthSet[i - 1];
    const avgGap = gapSum / (monthSet.length - 1);
    if (avgGap > MAX_AVG_GAP_MONTHS) continue;

    // Similaridade de valor: amplitude relativa dentro da tolerância.
    const amounts = sorted.map((t) => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (avg <= 0) continue;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if ((max - min) / avg > AMOUNT_TOLERANCE) continue;

    const last = sorted[sorted.length - 1];
    result.push({
      key,
      title: last.title,
      averageAmount: roundMoney(avg),
      occurrences: sorted.length,
      months: monthSet.length,
      lastDate: last.date,
      monthlyEstimate: roundMoney(avg),
    });
  }

  return result.sort((a, b) => b.averageAmount - a.averageAmount);
}

/** Soma estimada mensal de todas as assinaturas detectadas. */
export function totalMonthlySubscriptions(subs: DetectedSubscription[]): number {
  return roundMoney(subs.reduce((acc, s) => acc + s.monthlyEstimate, 0));
}
