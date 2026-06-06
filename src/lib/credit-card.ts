import { roundMoney } from "./money";

/**
 * Lógica pura do cartão de crédito — sem Prisma, sem IA. Tudo determinístico e
 * em UTC (as datas das transações são criadas como ISO/`new Date("YYYY-MM-DD")`,
 * que cai em meia-noite UTC). Toda decisão de competência/fechamento/vencimento
 * faz clamp de fim de mês (ex.: fechamento dia 31 em fevereiro).
 */

export type Competence = { month: number; year: number }; // month: 1-12

export type CardChargeType =
  | "PURCHASE"
  | "REFUND"
  | "FEE"
  | "INTEREST"
  | "ADJUSTMENT";

/** Número de dias do mês (monthIndex0 em 0-11), em UTC. */
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Limita `day` ao último dia do mês alvo (clamp de fim de mês). */
export function clampDay(year: number, monthIndex0: number, day: number): number {
  return Math.min(day, daysInMonth(year, monthIndex0));
}

/** Avança/retrocede `delta` meses sobre uma competência (1-12), normalizando o ano. */
export function shiftCompetence(comp: Competence, delta: number): Competence {
  // Trabalha em índice 0-based para a aritmética e volta para 1-12.
  const zeroBased = comp.month - 1 + delta;
  const year = comp.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  return { month, year };
}

/** Ordena competências de forma comparável: ano*12 + (mês-1). */
export function competenceIndex(comp: Competence): number {
  return comp.year * 12 + (comp.month - 1);
}

/**
 * Determina a competência (fatura) a que uma compra pertence.
 * Se o dia da compra <= dia de fechamento (com clamp), entra na fatura do
 * próprio mês; caso contrário, na do mês seguinte.
 */
export function getInvoiceCompetence(purchaseDate: Date, closingDay: number): Competence {
  const day = purchaseDate.getUTCDate();
  const monthIndex0 = purchaseDate.getUTCMonth();
  const year = purchaseDate.getUTCFullYear();

  const effectiveClosing = clampDay(year, monthIndex0, closingDay);
  const base: Competence = { month: monthIndex0 + 1, year };

  return day <= effectiveClosing ? base : shiftCompetence(base, 1);
}

/**
 * Datas de fechamento e vencimento de uma competência.
 * O fechamento cai no mês da competência. O vencimento cai no mesmo mês quando
 * `dueDay > closingDay`; senão, no mês seguinte (o vencimento é sempre depois do
 * fechamento). Ambos com clamp de fim de mês.
 */
export function getInvoiceDates(params: {
  competence: Competence;
  closingDay: number;
  dueDay: number;
}): { closingDate: Date; dueDate: Date } {
  const { competence, closingDay, dueDay } = params;
  const closingMonthIndex0 = competence.month - 1;

  const closingDate = new Date(
    Date.UTC(competence.year, closingMonthIndex0, clampDay(competence.year, closingMonthIndex0, closingDay))
  );

  const dueComp = dueDay > closingDay ? competence : shiftCompetence(competence, 1);
  const dueMonthIndex0 = dueComp.month - 1;
  const dueDate = new Date(
    Date.UTC(dueComp.year, dueMonthIndex0, clampDay(dueComp.year, dueMonthIndex0, dueDay))
  );

  return { closingDate, dueDate };
}

/**
 * Divide um total em N parcelas iguais (centavos), com a última parcela
 * absorvendo o resto para que a soma seja exatamente o total.
 */
export function installmentSplit(total: number, n: number): number[] {
  const rounded = roundMoney(total);
  if (n <= 1) return [rounded];

  const base = roundMoney(rounded / n);
  const parts = Array<number>(n - 1).fill(base);
  const last = roundMoney(rounded - base * (n - 1));
  parts.push(last);
  return parts;
}

/**
 * Melhor dia de compra: o dia seguinte ao fechamento maximiza o prazo até o
 * vencimento. Quando o fechamento é o último dia possível (31), rola para o 1.
 */
export function computeBestPurchaseDay(closingDay: number): number {
  return closingDay >= 31 ? 1 : closingDay + 1;
}

/** Sinal contábil de cada tipo no valor devido: REFUND abate, o resto soma. */
function chargeSign(type: string): number {
  return type === "REFUND" ? -1 : 1;
}

// Taxa mensal padrão do crédito rotativo no Brasil (aprox.). Configurável por chamada.
export const DEFAULT_REVOLVING_MONTHLY_RATE = 0.15;

/**
 * Juros do rotativo sobre o saldo não pago de uma fatura vencida.
 * `outstanding` = total − pago. Retorna 0 se não houver saldo.
 */
export function computeRevolvingInterest(
  outstanding: number,
  monthlyRate: number = DEFAULT_REVOLVING_MONTHLY_RATE
): number {
  if (outstanding <= 0 || monthlyRate <= 0) return 0;
  return roundMoney(outstanding * monthlyRate);
}

export type CardSummary = {
  totalOwed: number;
  currentInvoiceTotal: number;
  committedFuture: number;
  availableLimit: number;
  usagePercent: number;
  nextClosingDate: Date;
  nextDueDate: Date;
};

/**
 * Resumo financeiro do cartão a partir dos lançamentos e do total já pago.
 *  - totalOwed: Σ(cargas) − Σ(REFUND) − pago
 *  - currentInvoiceTotal: cargas líquidas da competência aberta (a de "hoje")
 *  - committedFuture: cargas líquidas de competências futuras (parcelas já lançadas)
 *  - availableLimit / usagePercent: contra o limite total
 *  - nextClosingDate / nextDueDate: próximas datas a partir de `now`
 */
export function computeCardSummary(params: {
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  transactions: { type: string; amount: number; date: Date }[];
  paidTotal: number;
  now: Date;
}): CardSummary {
  const { creditLimit, closingDay, dueDay, transactions, paidTotal, now } = params;

  const owedFromTxns = transactions.reduce(
    (acc, t) => acc + chargeSign(t.type) * t.amount,
    0
  );
  const totalOwed = roundMoney(owedFromTxns - paidTotal);

  const currentComp = getInvoiceCompetence(now, closingDay);
  const currentIdx = competenceIndex(currentComp);

  let current = 0;
  let future = 0;
  for (const t of transactions) {
    const idx = competenceIndex(getInvoiceCompetence(t.date, closingDay));
    const signed = chargeSign(t.type) * t.amount;
    if (idx === currentIdx) current += signed;
    else if (idx > currentIdx) future += signed;
  }

  const { closingDate, dueDate } = getInvoiceDates({
    competence: currentComp,
    closingDay,
    dueDay,
  });

  return {
    totalOwed,
    currentInvoiceTotal: roundMoney(current),
    committedFuture: roundMoney(future),
    availableLimit: roundMoney(creditLimit - totalOwed),
    usagePercent: creditLimit > 0 ? roundMoney((totalOwed / creditLimit) * 100) : 0,
    nextClosingDate: closingDate,
    nextDueDate: dueDate,
  };
}

/**
 * Uso por cartão virtual: soma assinada das cargas (REFUND abate) por
 * `virtualCardId`, considerando apenas a fatura atual e as futuras
 * (competência ≥ a atual). Base da barra de sub-limite. Lançamentos sem
 * `virtualCardId` (compras no físico) são ignorados.
 */
export function computeVirtualCardUsage(params: {
  transactions: { type: string; amount: number; date: Date; virtualCardId: string | null }[];
  closingDay: number;
  now: Date;
}): Map<string, number> {
  const { transactions, closingDay, now } = params;
  const currentIdx = competenceIndex(getInvoiceCompetence(now, closingDay));

  const usage = new Map<string, number>();
  for (const t of transactions) {
    if (!t.virtualCardId) continue;
    const idx = competenceIndex(getInvoiceCompetence(t.date, closingDay));
    if (idx < currentIdx) continue;
    usage.set(t.virtualCardId, (usage.get(t.virtualCardId) ?? 0) + chargeSign(t.type) * t.amount);
  }

  for (const [id, value] of usage) usage.set(id, roundMoney(value));
  return usage;
}
