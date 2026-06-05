import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";

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

/**
 * Busca a taxa de câmbio mais recente para converter de `base` para `quote`.
 *
 * - Se `base === quote`, retorna 1 (sem consultar o banco).
 * - Caso exista uma `ExchangeRate` direta (base→quote), usa a mais recente.
 * - Caso não exista a direta, tenta a inversa (quote→base) e devolve `1 / rate`.
 * - Se nada for encontrado, retorna `null` (o chamador decide o fallback).
 */
export async function getLatestRate(
  base: string,
  quote: string
): Promise<number | null> {
  if (base === quote) return 1;

  const direct = await prisma.exchangeRate.findFirst({
    where: { base, quote },
    orderBy: { date: "desc" },
  });

  if (direct && direct.rate > 0) {
    return direct.rate;
  }

  const inverse = await prisma.exchangeRate.findFirst({
    where: { base: quote, quote: base },
    orderBy: { date: "desc" },
  });

  if (inverse && inverse.rate > 0) {
    return 1 / inverse.rate;
  }

  return null;
}

/**
 * Converte um valor de `from` para `to` usando a taxa mais recente.
 *
 * Quando não há taxa cadastrada (`getLatestRate` retorna `null`), assume 1:1 e
 * devolve o valor original — cabe ao chamador sinalizar a ausência de cotação
 * ao usuário, se necessário. O resultado é sempre arredondado com `roundMoney`.
 */
export async function convert(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  const rate = await getLatestRate(from, to);
  if (rate === null) {
    return roundMoney(amount);
  }
  return roundMoney(amount * rate);
}
