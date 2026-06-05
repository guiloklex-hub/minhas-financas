import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";

/**
 * Conversão de moeda que consulta `ExchangeRate` no banco. Server-only (importa
 * Prisma) — NÃO importar em Client Components. Os helpers puros (símbolo,
 * formatação, catálogo) ficam em `currency.ts`.
 */

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
