/**
 * Formatação de datas — fonte única de verdade.
 *
 * O app distingue dois tipos de data:
 *
 * 1. **Data civil** — escolhida pelo usuário ou derivada (data da transação,
 *    fechamento/vencimento de fatura, competência, vencimento de investimento,
 *    `nextRunDate` de recorrência). É SEMPRE persistida como meia-noite UTC
 *    (`Date.UTC(...)` / `new Date("YYYY-MM-DD")`). Logo, DEVE ser exibida em
 *    UTC: num fuso a oeste de Greenwich (ex.: America/Sao_Paulo, UTC-3) a
 *    meia-noite UTC "volta um dia" (10/06 00:00Z apareceria como 09/06).
 *    Use `formatCivilDate`.
 *
 * 2. **Timestamp de evento** — instante real em que algo aconteceu
 *    (`createdAt`, `updatedAt`). Deve ser exibido no fuso do usuário.
 *    Use `formatTimestamp`.
 *
 * Puro/client-safe (sem Prisma): pode ser importado por Server e Client
 * Components.
 */

const SAO_PAULO = "America/Sao_Paulo";

type DateInput = Date | string | number;

/**
 * Data civil em "DD/MM/AAAA" (pt-BR), interpretada em **UTC**.
 * Evita o off-by-one de fuso em vencimentos, datas de fatura e datas de
 * transação. Aceita opções extras do Intl (ex.: `{ dateStyle: "medium" }`).
 */
export function formatCivilDate(
  date: DateInput,
  opts?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opts }).format(
    new Date(date)
  );
}

/**
 * Converte uma data civil (meia-noite UTC) para o valor de um
 * `<input type="date">` ("AAAA-MM-DD"), **sem deslocar o dia**.
 *
 * NÃO aplicar ajuste de fuso aqui: como a data já é meia-noite UTC,
 * `toISOString()` devolve o dia civil correto. Compensar com
 * `getTimezoneOffset()` (como feito antes) fazia o dia "voltar um" em fusos
 * negativos (BRT). Retorna "" para datas inválidas/nulas.
 */
export function toDateInputValue(date: DateInput | null | undefined): string {
  if (date == null) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Timestamp de evento no fuso America/Sao_Paulo (data + hora por padrão).
 * Use para `createdAt`/`updatedAt`, nunca para datas civis.
 */
export function formatTimestamp(
  date: DateInput,
  opts?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO,
    dateStyle: "short",
    timeStyle: "short",
    ...opts,
  }).format(new Date(date));
}
