/**
 * Helpers de moeda PUROS (sem dependência de servidor/Prisma) — podem ser
 * importados tanto por Server quanto por Client Components.
 * A lógica que consulta o banco (taxas/conversão) vive em `currency-rates.ts`.
 */

/**
 * Moeda suportada pelo sistema. O `code` é o ISO-4217 usado em `Account.currency`
 * e nos campos `base`/`quote` de `ExchangeRate`.
 */
export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

/**
 * Catálogo de moedas suportadas. Mantido em ordem de relevância para o
 * usuário (BRL primeiro, por ser o padrão do sistema).
 */
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: "BRL", name: "Real Brasileiro", symbol: "R$" },
  { code: "USD", name: "Dólar Americano", symbol: "US$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "Libra Esterlina", symbol: "£" },
];

/**
 * Conjunto de códigos suportados para validação rápida.
 */
export const SUPPORTED_CURRENCY_CODES: string[] = SUPPORTED_CURRENCIES.map(
  (c) => c.code
);

/**
 * Indica se um código de moeda é suportado pelo sistema.
 */
export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCY_CODES.includes(code);
}

/**
 * Retorna o símbolo de uma moeda (ex.: "R$"). Se a moeda não for conhecida,
 * devolve o próprio código como fallback.
 */
export function getCurrencySymbol(currency: string): string {
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return found ? found.symbol : currency;
}

/**
 * Formata um valor monetário com o símbolo da moeda informada, sempre com 2
 * casas decimais no padrão pt-BR (ex.: formatMoney(1234.5, "USD") => "US$ 1.234,50").
 */
export function formatMoney(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${symbol} ${formatted}`;
}
