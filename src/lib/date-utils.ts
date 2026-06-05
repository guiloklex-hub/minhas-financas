/**
 * Adiciona (ou subtrai, com months negativo) meses a uma data, com clamp de
 * fim de mês.
 *
 * Sem o clamp, somar 1 mês a 31/jan resultaria em 03/mar (overflow do JS).
 * Aqui detectamos quantos dias o mês alvo tem e usamos o menor entre o dia
 * original e o último dia do mês alvo. Ex.: 31/jan + 1 mês => 28 (ou 29) /fev.
 *
 * Hora, minuto, segundo e milissegundo do `date` original são preservados.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const originalDay = date.getDate();

  // Posiciona no dia 1 do mês alvo para evitar overflow ao trocar o mês.
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  // Quantos dias o mês alvo realmente tem (dia 0 do mês seguinte = último dia).
  const daysInTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();

  // Clamp do dia para não estourar o fim do mês.
  result.setDate(Math.min(originalDay, daysInTargetMonth));

  // Preserva o horário original.
  result.setHours(
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  );

  return result;
}
