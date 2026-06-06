import { roundMoney } from "./money";
import {
  type Competence,
  getInvoiceCompetence,
  competenceIndex,
  shiftCompetence,
} from "./credit-card";

/**
 * Projeção de faturas futuras — determinística (sem IA). Cada fatura futura =
 * parcelas já comprometidas (lançadas naquela competência) + média histórica de
 * gasto avulso (não parcelado) dos últimos meses. A IA, se usada, apenas narra.
 */

export type ForecastTxn = {
  amount: number;
  date: Date;
  type: string;
  installmentNumber: number | null;
};

export type ForecastInvoicePoint = {
  month: number;
  year: number;
  committed: number; // já lançado naquela competência (parcelas)
  projected: number; // committed + média histórica avulsa
};

const LOOKBACK_MONTHS = 3;

/** REFUND abate; o resto soma. */
function sign(type: string): number {
  return type === "REFUND" ? -1 : 1;
}

/**
 * Média mensal de gasto AVULSO (não parcelado) nos últimos `LOOKBACK_MONTHS`
 * meses anteriores à competência atual. Parcelas são excluídas porque já entram
 * como "committed" nas competências futuras.
 */
function historicalAvulsoAverage(
  transactions: ForecastTxn[],
  closingDay: number,
  currentIdx: number
): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.installmentNumber !== null) continue; // ignora parcelas
    const idx = competenceIndex(getInvoiceCompetence(t.date, closingDay));
    if (idx < currentIdx - LOOKBACK_MONTHS || idx >= currentIdx) continue;
    sum += sign(t.type) * t.amount;
  }
  return roundMoney(Math.max(0, sum) / LOOKBACK_MONTHS);
}

/**
 * Projeta as próximas `monthsAhead` faturas a partir da competência seguinte à
 * atual (definida por `now` + `closingDay`).
 */
export function forecastInvoices(params: {
  now: Date;
  closingDay: number;
  transactions: ForecastTxn[];
  monthsAhead: number;
}): ForecastInvoicePoint[] {
  const { now, closingDay, transactions, monthsAhead } = params;

  const currentComp = getInvoiceCompetence(now, closingDay);
  const currentIdx = competenceIndex(currentComp);
  const avulsoAvg = historicalAvulsoAverage(transactions, closingDay, currentIdx);

  // Pré-agrega cargas por competência.
  const byCompetence = new Map<number, number>();
  for (const t of transactions) {
    const idx = competenceIndex(getInvoiceCompetence(t.date, closingDay));
    byCompetence.set(idx, (byCompetence.get(idx) ?? 0) + sign(t.type) * t.amount);
  }

  const points: ForecastInvoicePoint[] = [];
  for (let k = 1; k <= monthsAhead; k++) {
    const comp: Competence = shiftCompetence(currentComp, k);
    const committed = roundMoney(Math.max(0, byCompetence.get(competenceIndex(comp)) ?? 0));
    points.push({
      month: comp.month,
      year: comp.year,
      committed,
      projected: roundMoney(committed + avulsoAvg),
    });
  }

  return points;
}
