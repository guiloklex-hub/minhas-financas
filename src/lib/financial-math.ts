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
 * Calcula os impostos brasileiros sobre o lucro de um investimento (Renda Fixa).
 * Inclui a tabela regressiva do IR e a alíquota de IOF para resgates antes de 30 dias.
 * 
 * @param profit Lucro bruto do investimento (R$).
 * @param daysInvested Dias úteis/corridos em que o dinheiro ficou investido.
 * @returns O valor total do imposto a ser deduzido do lucro.
 */
export function calculateBrazilianTaxes(profit: number, daysInvested: number): number {
  if (profit <= 0) return 0;
  
  let iofRate = 0;
  // IOF regressivo de 96% (dia 1) a 0% (dia 30)
  if (daysInvested < 30) {
    // Tabela aproximada (na real a RFB tem alíquota exata, mas podemos usar uma fórmula decrescente agressiva)
    // Para simplificar: Dia 1 = 96%, cai aprox 3.3% ao dia.
    iofRate = Math.max(0, 1 - (daysInvested / 30));
  }
  
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
