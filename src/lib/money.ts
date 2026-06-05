/**
 * Arredonda um valor monetário para 2 casas decimais, corrigindo o erro
 * clássico de ponto flutuante (ex.: 1.005 -> 1.01) via Number.EPSILON.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Soma uma lista de valores monetários e arredonda o total com roundMoney.
 */
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((acc, v) => acc + v, 0));
}
