import { parseInstallment, type RawInvoiceLine } from "./invoice-import";

/**
 * Helpers determinísticos do import de lançamentos do cartão por CSV. Sem Prisma
 * — base dos testes. O parse converte cada linha do CSV num `RawInvoiceLine`
 * (consumido por `sanitizeInvoiceLine` de invoice-import.ts), reaproveitando toda
 * a normalização/validação já existente do import por IA.
 */

export type CsvDelimiter = "," | ";";

/**
 * Detecta o separador de campos a partir de uma amostra (1ª linha). Exports
 * pt-BR de banco/cartão usam ";" para liberar a vírgula como separador decimal
 * (ex.: "136,79"). Escolhe o caractere mais frequente; padrão ",".
 */
export function detectDelimiter(sample: string): CsvDelimiter {
  const semis = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/**
 * Parser de linha CSV que respeita campos entre aspas com o separador interno e
 * aspas duplas escapadas (""). O `delimiter` é configurável (padrão ",", usado
 * também pelo importador de transações).
 */
export function parseCsvLine(line: string, delimiter: CsvDelimiter = ","): string[] {
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
      } else if (char === delimiter) {
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
 * Converte um valor monetário em texto (formatos pt-BR/EN) para número.
 * - "136,79" => 136.79 (vírgula decimal)
 * - "1.234,56" => 1234.56 (ponto milhar + vírgula decimal)
 * - "1234.56" => 1234.56 (ponto decimal)
 * Retorna NaN quando não é numérico.
 */
export function parseCsvAmount(raw: string): number {
  if (typeof raw !== "string") return NaN;
  let s = raw.trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (s.length === 0) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Assume "." como milhar e "," como decimal (padrão pt-BR).
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  return Number(s);
}

/**
 * Converte uma string de data em YYYY-MM-DD, validando que a data realmente
 * existe (rejeita 31/02). Aceita `YYYY-MM-DD`, `DD/MM/YYYY` e `DD/MM` (sem ano).
 * Em `DD/MM` o ano é inferido como a ocorrência passada mais recente em relação
 * a `referenceDate` (faturas só têm lançamentos no passado; trata a virada
 * dez→jan). Retorna null se inválida (provável cabeçalho). Devolve string ISO
 * porque `sanitizeInvoiceLine` espera o formato `^\d{4}-\d{2}-\d{2}`.
 */
export function parseCsvDateToIso(dateStr: string, referenceDate: Date = new Date()): string | null {
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
  } else if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
    const [dd, mm] = trimmed.split("/");
    d = Number(dd);
    m = Number(mm);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    // Ano de referência; se a data cair no futuro, usa o ano anterior.
    const refY = referenceDate.getUTCFullYear();
    const sameYear = new Date(Date.UTC(refY, m - 1, d));
    y = sameYear.getTime() > referenceDate.getTime() ? refY - 1 : refY;
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
export function mapCsvRowToRawLine(
  cols: string[],
  layout: CsvLayout,
  referenceDate: Date = new Date()
): RawInvoiceLine | null {
  const dateRaw = cols[layout.date] ?? "";
  const date = parseCsvDateToIso(dateRaw, referenceDate);
  if (!date) return null;

  const description = (cols[layout.description] ?? "").trim();
  if (description.length === 0) return null;

  const amountNum = parseCsvAmount(cols[layout.amount] ?? "");
  if (!Number.isFinite(amountNum) || amountNum === 0) return null;

  const explicitType = layout.type !== null ? normalizeType(cols[layout.type]) : undefined;
  // Sem tipo explícito + valor negativo => estorno; senão PURCHASE (default no sanitize).
  const type = explicitType ?? (amountNum < 0 ? "REFUND" : undefined);

  // Parcela: usa a coluna explícita (NN/NN) quando válida; senão deixa o
  // sanitizeInvoiceLine tentar extrair da própria descrição.
  let installmentNumber: number | null = null;
  let installmentTotal: number | null = null;
  if (layout.installment !== null) {
    const parsed = parseInstallment(cols[layout.installment] ?? "");
    if (parsed) {
      installmentNumber = parsed.number;
      installmentTotal = parsed.total;
    }
  }

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
    description,
    amount: Math.abs(amountNum),
    type,
    installmentNumber,
    installmentTotal,
    cardLastFour,
    isVirtual,
  };
}
