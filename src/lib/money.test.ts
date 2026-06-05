import { describe, it, expect } from "vitest";
import { roundMoney, sumMoney } from "./money";

describe("money.ts", () => {
  describe("roundMoney", () => {
    it("deve corrigir o erro clássico de ponto flutuante (0.1 + 0.2 === 0.3)", () => {
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it("deve arredondar para 2 casas decimais", () => {
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(2.675)).toBe(2.68);
      expect(roundMoney(1.234)).toBe(1.23);
      expect(roundMoney(1.235)).toBe(1.24);
    });

    it("deve manter valores que já têm 2 casas decimais inalterados", () => {
      expect(roundMoney(10.5)).toBe(10.5);
      expect(roundMoney(99.99)).toBe(99.99);
      expect(roundMoney(0)).toBe(0);
    });

    it("deve arredondar inteiros sem alterar o valor", () => {
      expect(roundMoney(100)).toBe(100);
      expect(roundMoney(1)).toBe(1);
    });

    it("deve lidar com valores negativos", () => {
      expect(roundMoney(-1.005)).toBe(-1);
      expect(roundMoney(-0.1 - 0.2)).toBe(-0.3);
      expect(roundMoney(-50.555)).toBe(-50.55);
    });
  });

  describe("sumMoney", () => {
    it("deve somar valores com casas decimais de forma estável (0.1 + 0.2 + 0.3)", () => {
      expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    });

    it("deve retornar 0 para lista vazia", () => {
      expect(sumMoney([])).toBe(0);
    });

    it("deve retornar o próprio valor para lista de um único item", () => {
      expect(sumMoney([42.42])).toBe(42.42);
    });

    it("deve somar valores positivos e negativos (entradas e saídas)", () => {
      expect(sumMoney([100, -30.5, -20.25])).toBe(49.25);
    });

    it("deve arredondar o total final para 2 casas decimais", () => {
      expect(sumMoney([0.01, 0.02, 0.005])).toBe(0.04);
    });

    it("deve somar apenas valores negativos", () => {
      expect(sumMoney([-0.1, -0.2])).toBe(-0.3);
    });
  });
});
