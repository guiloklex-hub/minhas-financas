import { describe, it, expect } from "vitest";
import { addMonthsClamped } from "./date-utils";

// Lembrete: new Date(ano, mes, dia) usa mês 0-indexed (0 = janeiro, 11 = dezembro).

describe("date-utils.ts", () => {
  describe("addMonthsClamped", () => {
    it("deve fazer clamp de 31/jan + 1 mês para o último dia de fevereiro (ano comum)", () => {
      const result = addMonthsClamped(new Date(2025, 0, 31), 1);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(1); // fevereiro
      expect(result.getDate()).toBe(28); // 2025 não é bissexto
    });

    it("deve fazer clamp para 29/fev em ano bissexto (31/jan/2024 + 1 mês)", () => {
      const result = addMonthsClamped(new Date(2024, 0, 31), 1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(1); // fevereiro
      expect(result.getDate()).toBe(29); // 2024 é bissexto
    });

    it("deve preservar o dia em um mês normal (15/mar + 2 meses => 15/mai)", () => {
      const result = addMonthsClamped(new Date(2025, 2, 15), 2);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(4); // maio
      expect(result.getDate()).toBe(15);
    });

    it("deve virar o ano (dez + 1 mês => jan do ano seguinte)", () => {
      const result = addMonthsClamped(new Date(2025, 11, 10), 1);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0); // janeiro
      expect(result.getDate()).toBe(10);
    });

    it("deve aceitar months negativo (subtração) com virada de ano", () => {
      const result = addMonthsClamped(new Date(2025, 0, 15), -1);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11); // dezembro
      expect(result.getDate()).toBe(15);
    });

    it("deve fazer clamp ao subtrair meses (31/mar - 1 mês => 28/29 fev)", () => {
      const result = addMonthsClamped(new Date(2025, 2, 31), -1);
      expect(result.getMonth()).toBe(1); // fevereiro
      expect(result.getDate()).toBe(28);
    });

    it("deve retornar a mesma data quando months for 0", () => {
      const result = addMonthsClamped(new Date(2025, 5, 20), 0);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5); // junho
      expect(result.getDate()).toBe(20);
    });

    it("deve preservar horas, minutos, segundos e milissegundos", () => {
      const original = new Date(2025, 0, 31, 13, 45, 30, 500);
      const result = addMonthsClamped(original, 1);
      expect(result.getHours()).toBe(13);
      expect(result.getMinutes()).toBe(45);
      expect(result.getSeconds()).toBe(30);
      expect(result.getMilliseconds()).toBe(500);
    });

    it("não deve mutar a data original", () => {
      const original = new Date(2025, 0, 31);
      addMonthsClamped(original, 1);
      expect(original.getMonth()).toBe(0); // janeiro
      expect(original.getDate()).toBe(31);
    });

    it("deve avançar mais de 12 meses corretamente (31/jan + 13 meses => fev do ano seguinte)", () => {
      const result = addMonthsClamped(new Date(2025, 0, 31), 13);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(1); // fevereiro
      expect(result.getDate()).toBe(28);
    });
  });
});
