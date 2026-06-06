import { roundMoney } from "./money";

/**
 * Helpers determinísticos do import de fatura por IA. A IA só transcreve as
 * linhas; aqui normalizamos/validamos (valor, tipo, data, parcela), montamos a
 * chave de deduplicação e a chave de origem (físico/virtual). Sem Prisma — base
 * dos testes.
 */

export type InvoiceLineType = "PURCHASE" | "REFUND" | "FEE" | "INTEREST";
const VALID_TYPES: InvoiceLineType[] = ["PURCHASE", "REFUND", "FEE", "INTEREST"];

/** Linha crua vinda da IA (campos podem faltar/ser inválidos). */
export type RawInvoiceLine = {
  date?: string;
  description?: string;
  categoryHint?: string;
  amount?: number;
  type?: string;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  isInternational?: boolean;
  fxCurrency?: string | null;
  fxAmount?: number | null;
  cardLastFour?: string | null;
  isVirtual?: boolean;
};

/** Linha já normalizada e válida. */
export type InvoiceLine = {
  date: string; // ISO (YYYY-MM-DD...)
  description: string;
  categoryHint: string | null;
  amount: number; // sempre positivo
  type: InvoiceLineType;
  installmentNumber: number | null;
  installmentTotal: number | null;
  fxCurrency: string | null;
  fxAmount: number | null;
  cardLastFour: string | null;
  isVirtual: boolean;
};

/** Extrai "NN/NN" (parcela) de um texto. Retorna null se não houver. */
export function parseInstallment(text: string): { number: number; total: number } | null {
  if (typeof text !== "string") return null;
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!m) return null;
  const number = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isInteger(number) || !Number.isInteger(total)) return null;
  if (number < 1 || total < 1 || number > total) return null;
  return { number, total };
}

/**
 * Normaliza/valida uma linha crua da IA. Retorna null quando inválida (sem data
 * utilizável, valor não-positivo, etc.). REFUND mantém amount positivo (o tipo
 * indica que abate). Se a IA não trouxe parcela, tenta extrair da descrição.
 */
export function sanitizeInvoiceLine(raw: RawInvoiceLine): InvoiceLine | null {
  if (!raw || typeof raw !== "object") return null;

  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length === 0) return null;

  const amount = roundMoney(Math.abs(Number(raw.amount)));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const dateStr = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr) || Number.isNaN(new Date(dateStr).getTime())) return null;

  const type: InvoiceLineType = VALID_TYPES.includes(raw.type as InvoiceLineType)
    ? (raw.type as InvoiceLineType)
    : "PURCHASE";

  // Parcela: usa a da IA se válida; senão tenta extrair da descrição.
  let installmentNumber: number | null = null;
  let installmentTotal: number | null = null;
  if (
    Number.isInteger(raw.installmentNumber) &&
    Number.isInteger(raw.installmentTotal) &&
    (raw.installmentTotal as number) > 1 &&
    (raw.installmentNumber as number) >= 1 &&
    (raw.installmentNumber as number) <= (raw.installmentTotal as number)
  ) {
    installmentNumber = raw.installmentNumber as number;
    installmentTotal = raw.installmentTotal as number;
  } else {
    const parsed = parseInstallment(description);
    if (parsed && parsed.total > 1) {
      installmentNumber = parsed.number;
      installmentTotal = parsed.total;
    }
  }

  const fxCurrency =
    typeof raw.fxCurrency === "string" && raw.fxCurrency.trim().length > 0
      ? raw.fxCurrency.trim().toUpperCase().slice(0, 3)
      : null;
  const fxAmountNum = Number(raw.fxAmount);
  const fxAmount = Number.isFinite(fxAmountNum) && fxAmountNum > 0 ? roundMoney(fxAmountNum) : null;

  const cardLastFour =
    typeof raw.cardLastFour === "string" && /^\d{4}$/.test(raw.cardLastFour.trim())
      ? raw.cardLastFour.trim()
      : null;

  const categoryHint =
    typeof raw.categoryHint === "string" && raw.categoryHint.trim().length > 0
      ? raw.categoryHint.trim().slice(0, 120)
      : null;

  return {
    date: dateStr,
    description: description.slice(0, 200),
    categoryHint,
    amount,
    type,
    installmentNumber,
    installmentTotal,
    fxCurrency,
    fxAmount,
    cardLastFour,
    isVirtual: raw.isVirtual === true,
  };
}

/**
 * Chave de deduplicação escopada ao cartão: mesma data (dia UTC), valor e título
 * no mesmo cartão = duplicada. Espelha o dedupKey do importador de CSV.
 */
export function dedupKeyCard(cardId: string, date: Date, amount: number, title: string): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${cardId}|${yyyy}-${mm}-${dd}|${roundMoney(amount)}|${title}`;
}

/**
 * Chave de origem da linha (para agrupar por cartão físico/virtual detectado):
 *  - "PHYSICAL" quando não é virtual e não há "final";
 *  - "vc:<lastFour>" quando virtual (e/ou tem "final");
 *  - "final:<lastFour>" quando tem "final" mas não é virtual.
 */
export function sourceKey(line: { isVirtual: boolean; cardLastFour: string | null }): string {
  if (line.isVirtual) return `vc:${line.cardLastFour ?? "?"}`;
  if (line.cardLastFour) return `final:${line.cardLastFour}`;
  return "PHYSICAL";
}
