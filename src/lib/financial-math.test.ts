import { describe, it, expect } from "vitest";
import { calculateCompoundInterest, calculateBrazilianTaxes, iofRateForDay } from "./financial-math";

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

    it("deve aplicar IOF de 96% (tabela oficial) + IR para saque em 1 dia", () => {
      const profit = 1000;
      const taxes = calculateBrazilianTaxes(profit, 1);
      // IOF oficial dia 1 = 96% de 1000 = 960. Sobra 40.
      // IR de 22.5% sobre 40 = 9. Total = 969.
      expect(taxes).toBeCloseTo(969, 2);
    });

    it("deve aplicar IOF de 50% (tabela oficial) no dia 15", () => {
      const taxes = calculateBrazilianTaxes(1000, 15);
      // IOF dia 15 = 50% de 1000 = 500. Sobra 500. IR 22.5% = 112.5. Total 612.5.
      expect(taxes).toBeCloseTo(612.5, 2);
    });

    it("deve aplicar IOF de 3% (tabela oficial) no dia 29", () => {
      const taxes = calculateBrazilianTaxes(1000, 29);
      // IOF dia 29 = 3% de 1000 = 30. Sobra 970. IR 22.5% = 218.25. Total 248.25.
      expect(taxes).toBeCloseTo(248.25, 2);
    });
  });

  describe("iofRateForDay", () => {
    it("retorna a alíquota máxima (96%) no dia 1 e para frações/zero", () => {
      expect(iofRateForDay(1)).toBeCloseTo(0.96, 4);
      expect(iofRateForDay(0)).toBeCloseTo(0.96, 4);
      expect(iofRateForDay(0.5)).toBeCloseTo(0.96, 4);
    });

    it("segue a tabela regressiva oficial em dias intermediários", () => {
      expect(iofRateForDay(15)).toBeCloseTo(0.50, 4);
      expect(iofRateForDay(29)).toBeCloseTo(0.03, 4);
    });

    it("zera a partir do dia 30", () => {
      expect(iofRateForDay(30)).toBe(0);
      expect(iofRateForDay(45)).toBe(0);
    });
  });
});
