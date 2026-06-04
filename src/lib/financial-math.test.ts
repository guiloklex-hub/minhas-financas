import { describe, it, expect } from "vitest";
import { calculateCompoundInterest, calculateBrazilianTaxes } from "./financial-math";

describe("financial-math.ts", () => {

  describe("calculateCompoundInterest", () => {
    it("deve calcular o montante final corretamente para 1 ano (12 meses)", () => {
      // 10.000 a 10.5% ao ano por 12 meses
      const result = calculateCompoundInterest(10000, 0.105, 12);
      expect(result).toBeCloseTo(11050, 2); // 10% seria 11000, 10.5% = 11050
    });

    it("deve retornar o principal se os meses forem zero ou negativo", () => {
      expect(calculateCompoundInterest(1000, 0.1, 0)).toBe(1000);
      expect(calculateCompoundInterest(1000, 0.1, -5)).toBe(1000);
    });

    it("deve calcular juros corretamente para prazos quebrados (ex: 6 meses)", () => {
      // 1000 a 10% a.a. em 6 meses
      const result = calculateCompoundInterest(1000, 0.10, 6);
      expect(result).toBeCloseTo(1048.81, 2); 
    });
  });

  describe("calculateBrazilianTaxes", () => {
    it("deve cobrar apenas IR (22.5%) para saques no dia 30", () => {
      const profit = 1000;
      const taxes = calculateBrazilianTaxes(profit, 30);
      // IOF = 0%
      // IR = 22.5% de 1000 = 225
      expect(taxes).toBeCloseTo(225, 2);
    });

    it("deve aplicar IR de 20% para prazos entre 181 e 360 dias", () => {
      const taxes = calculateBrazilianTaxes(1000, 200);
      expect(taxes).toBeCloseTo(200, 2);
    });

    it("deve aplicar IR de 17.5% para prazos entre 361 e 720 dias", () => {
      const taxes = calculateBrazilianTaxes(1000, 400);
      expect(taxes).toBeCloseTo(175, 2);
    });

    it("deve aplicar IR de 15% para prazos acima de 720 dias", () => {
      const taxes = calculateBrazilianTaxes(1000, 1000);
      expect(taxes).toBeCloseTo(150, 2);
    });

    it("deve aplicar punição alta de IOF + IR para saque em 1 dia", () => {
      const profit = 1000;
      const taxes = calculateBrazilianTaxes(profit, 1);
      // IOF aproximado: max(0, 1 - (1/30)) = 0.9666... (96.66% de 1000) = ~966.67
      // Sobra ~33.33. IR de 22.5% em cima de 33.33 = ~7.50
      // Total de imposto: 966.67 + 7.50 = 974.17
      expect(taxes).toBeCloseTo(974.17, 1);
    });
  });
});
