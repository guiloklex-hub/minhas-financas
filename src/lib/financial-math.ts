/**
 * Calcula o montante projetado com juros compostos.
 * 
 * @param principal Valor inicial investido (R$).
 * @param annualRate Taxa de juros anual (ex: 0.105 para 10.5% a.a).
 * @param months Número de meses da projeção.
 * @returns O montante final bruto projetado.
 */
export function calculateCompoundInterest(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || annualRate < 0 || months <= 0) return principal;

  // Converter taxa anual para taxa mensal equivalente
  // (1 + i_anual)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  
  return principal * Math.pow(1 + monthlyRate, months);
}

/**
 * Tabela regressiva oficial de IOF sobre o rendimento (Receita Federal), por
 * dia corrido de aplicação. Índice 0 = dia 1 (96%), ..., índice 28 = dia 29
 * (3%). A partir do dia 30, a alíquota é 0%.
 *
 * Fonte: tabela de IOF regressivo para resgates em renda fixa (RFB).
 */
const IOF_REGRESSIVE_TABLE = [
  0.96, // dia 1
  0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70, 0.66, // dias 2–10
  0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36, 0.33, // dias 11–20
  0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03, // dias 21–29
];

/**
 * Alíquota de IOF (fração do rendimento) para um resgate no dia informado,
 * conforme a tabela regressiva oficial da RFB.
 */
export function iofRateForDay(daysInvested: number): number {
  if (daysInvested >= 30) return 0;
  // Resgates no 1º dia (ou frações) usam a alíquota máxima (dia 1).
  const day = Math.min(Math.max(Math.floor(daysInvested), 1), 29);
  return IOF_REGRESSIVE_TABLE[day - 1];
}

/**
 * Calcula os impostos brasileiros sobre o lucro de um investimento (Renda Fixa).
 * Inclui a tabela regressiva do IR e a tabela regressiva oficial de IOF para
 * resgates antes de 30 dias.
 *
 * @param profit Lucro bruto do investimento (R$).
 * @param daysInvested Dias úteis/corridos em que o dinheiro ficou investido.
 * @returns O valor total do imposto a ser deduzido do lucro.
 */
export function calculateBrazilianTaxes(profit: number, daysInvested: number): number {
  if (profit <= 0) return 0;

  const iofRate = iofRateForDay(daysInvested);

  const iofAmount = profit * iofRate;
  const profitAfterIof = profit - iofAmount;
  
  let irRate = 0;
  // Tabela Regressiva IR Renda Fixa Brasil
  if (daysInvested <= 180) {
    irRate = 0.225; // 22.5%
  } else if (daysInvested <= 360) {
    irRate = 0.20; // 20%
  } else if (daysInvested <= 720) {
    irRate = 0.175; // 17.5%
  } else {
    irRate = 0.15; // 15%
  }
  
  const irAmount = profitAfterIof * irRate;
  
  return iofAmount + irAmount;
}
