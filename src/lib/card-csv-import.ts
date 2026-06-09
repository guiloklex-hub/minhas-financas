import type { RawInvoiceLine } from "./invoice-import";

/**
 * Helpers determinísticos do import de lançamentos do cartão por CSV. Sem Prisma
 * — base dos testes. O parse converte cada linha do CSV num `RawInvoiceLine`
 * (consumido por `sanitizeInvoiceLine` de invoice-import.ts), reaproveitando toda
 * a normalização/validação já existente do import por IA.
 */

/**
 * Parser de linha CSV que respeita campos entre aspas com vírgulas internas e
 * aspas duplas escapadas (""). Compartilhado com o importador de transações.
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          // Aspas duplas escapadas
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result.map((c) => c.trim());
}

/**
 * Converte uma string de data (YYYY-MM-DD ou DD/MM/YYYY) em YYYY-MM-DD,
 * validando que a data realmente existe (rejeita 31/02). Retorna null se
 * inválida (provável cabeçalho). Devolve string ISO porque `sanitizeInvoiceLine`
 * espera o formato `^\d{4}-\d{2}-\d{2}`.
 */
export function parseCsvDateToIso(dateStr: string): string | null {
  if (typeof dateStr !== "string") return null;
  let y: number, m: number, d: number;

  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [yy, mm, dd] = trimmed.split("-");
    y = Number(yy);
    m = Number(mm);
    d = Number(dd);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yy] = trimmed.split("/");
    d = Number(dd);
    m = Number(mm);
    y = Number(yy);
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Tipos de lançamento aceitos no CSV (PT/EN), normalizados para InvoiceLineType. */
const TYPE_ALIASES: Record<string, string> = {
  purchase: "PURCHASE",
  compra: "PURCHASE",
  refund: "REFUND",
  estorno: "REFUND",
  devolucao: "REFUND",
  fee: "FEE",
  taxa: "FEE",
  tarifa: "FEE",
  iof: "FEE",
  interest: "INTEREST",
  juros: "INTEREST",
};

/** Normaliza o texto da coluna Tipo. Retorna undefined se ausente/desconhecido. */
function normalizeType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return TYPE_ALIASES[key];
}

/**
 * Layout das colunas do CSV: índice de cada campo (ou null quando ausente).
 * `date`, `description` e `amount` são obrigatórios; o resto é opcional.
 */
export type CsvLayout = {
  date: number;
  description: number;
  amount: number;
  type: number | null;
  installment: number | null;
  card: number | null;
};

const DEFAULT_LAYOUT: CsvLayout = {
  date: 0,
  description: 1,
  amount: 2,
  type: 3,
  installment: 4,
  card: 5,
};

/** Remove acentos e baixa caixa para casar nomes de cabeçalho. */
function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Detecta o layout das colunas a partir da 1ª linha. Se ela NÃO parsear como
 * data válida na 1ª coluna, é tratada como CABEÇALHO e os campos são mapeados
 * por nome conhecido. Caso contrário (sem cabeçalho), usa a ordem posicional
 * padrão `[Data, Descrição, Valor, Tipo?, Parcela?, Cartão?]`.
 */
export function detectCsvLayout(firstCols: string[]): { layout: CsvLayout; hasHeader: boolean } {
  const looksLikeData = parseCsvDateToIso(firstCols[0] ?? "") !== null;
  if (looksLikeData) {
    return { layout: DEFAULT_LAYOUT, hasHeader: false };
  }

  const find = (...names: string[]): number | null => {
    const idx = firstCols.findIndex((c) => names.includes(normalizeHeader(c)));
    return idx >= 0 ? idx : null;
  };

  const date = find("data", "date");
  const description = find("descricao", "descrição", "historico", "histórico", "description", "estabelecimento", "titulo", "título");
  const amount = find("valor", "amount", "value");

  // Sem colunas obrigatórias reconhecíveis no cabeçalho → posicional.
  if (date === null || description === null || amount === null) {
    return { layout: DEFAULT_LAYOUT, hasHeader: true };
  }

  return {
    layout: {
      date,
      description,
      amount,
      type: find("tipo", "type"),
      installment: find("parcela", "parcelas", "installment"),
      card: find("cartao", "cartão", "final", "card"),
    },
    hasHeader: true,
  };
}

/**
 * Converte as colunas de uma linha do CSV num `RawInvoiceLine`. Retorna null se
 * a data for inválida (linha de cabeçalho/lixo) ou colunas obrigatórias faltarem.
 * A normalização de valor/tipo/parcela final fica a cargo de `sanitizeInvoiceLine`.
 */
export function mapCsvRowToRawLine(cols: string[], layout: CsvLayout): RawInvoiceLine | null {
  const dateRaw = cols[layout.date] ?? "";
  const date = parseCsvDateToIso(dateRaw);
  if (!date) return null;

  const description = cols[layout.description] ?? "";
  if (description.trim().length === 0) return null;

  const amountRaw = (cols[layout.amount] ?? "").replace(/\s/g, "").replace(",", ".");
  const amountNum = Number(amountRaw);
  if (!Number.isFinite(amountNum) || amountNum === 0) return null;

  const explicitType = layout.type !== null ? normalizeType(cols[layout.type]) : undefined;
  // Sem tipo explícito + valor negativo => estorno; senão PURCHASE (default no sanitize).
  const type = explicitType ?? (amountNum < 0 ? "REFUND" : undefined);

  const installmentText = layout.installment !== null ? (cols[layout.installment] ?? "") : "";

  // Coluna de cartão: "@1234" => virtual; "final 1234" / "1234" => físico com final.
  let cardLastFour: string | null = null;
  let isVirtual = false;
  if (layout.card !== null) {
    const cardRaw = (cols[layout.card] ?? "").trim();
    if (cardRaw.length > 0) {
      isVirtual = cardRaw.includes("@");
      const m = cardRaw.match(/(\d{4})\s*$/);
      if (m) cardLastFour = m[1];
    }
  }

  return {
    date,
    // Anexa a parcela à descrição quando vier em coluna separada, para que
    // sanitizeInvoiceLine extraia NN/NN via parseInstallment.
    description: installmentText && /\d{1,2}\/\d{1,2}/.test(installmentText)
      ? `${description.trim()} ${installmentText.trim()}`
      : description.trim(),
    amount: Math.abs(amountNum),
    type,
    cardLastFour,
    isVirtual,
  };
}
