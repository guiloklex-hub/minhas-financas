import { describe, it, expect } from "vitest";
import {
  clampDay,
  shiftCompetence,
  competenceIndex,
  getInvoiceCompetence,
  getInvoiceDates,
  installmentSplit,
  computeBestPurchaseDay,
  computeCardSummary,
  computeRevolvingInterest,
} from "./credit-card";

/** Helper: data UTC a partir de YYYY-MM-DD. */
function d(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

describe("credit-card.ts", () => {
  describe("clampDay", () => {
    it("limita o dia 31 ao último dia de fevereiro (28 em ano comum)", () => {
      expect(clampDay(2026, 1, 31)).toBe(28);
    });
    it("limita o dia 31 a 29 em fevereiro bissexto", () => {
      expect(clampDay(2024, 1, 31)).toBe(29);
    });
    it("mantém o dia quando cabe no mês", () => {
      expect(clampDay(2026, 0, 15)).toBe(15);
    });
  });

  describe("shiftCompetence", () => {
    it("avança virando o ano (Dez -> Jan)", () => {
      expect(shiftCompetence({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 });
    });
    it("retrocede virando o ano (Jan -> Dez)", () => {
      expect(shiftCompetence({ month: 1, year: 2026 }, -1)).toEqual({ month: 12, year: 2025 });
    });
    it("avança vários meses", () => {
      expect(shiftCompetence({ month: 10, year: 2026 }, 5)).toEqual({ month: 3, year: 2027 });
    });
  });

  describe("competenceIndex", () => {
    it("ordena competências corretamente", () => {
      expect(competenceIndex({ month: 1, year: 2027 })).toBeGreaterThan(
        competenceIndex({ month: 12, year: 2026 })
      );
    });
  });

  describe("getInvoiceCompetence", () => {
    it("compra antes/no fechamento cai na fatura do mês", () => {
      expect(getInvoiceCompetence(d("2026-06-10"), 15)).toEqual({ month: 6, year: 2026 });
      expect(getInvoiceCompetence(d("2026-06-15"), 15)).toEqual({ month: 6, year: 2026 });
    });
    it("compra após o fechamento cai na fatura do mês seguinte", () => {
      expect(getInvoiceCompetence(d("2026-06-16"), 15)).toEqual({ month: 7, year: 2026 });
    });
    it("vira o ano quando a compra de dezembro passa do fechamento", () => {
      expect(getInvoiceCompetence(d("2026-12-20"), 15)).toEqual({ month: 1, year: 2027 });
    });
    it("usa clamp: fechamento 31 em fevereiro aceita até o dia 28", () => {
      expect(getInvoiceCompetence(d("2026-02-28"), 31)).toEqual({ month: 2, year: 2026 });
    });
  });

  describe("getInvoiceDates", () => {
    it("vencimento no mesmo mês quando dueDay > closingDay", () => {
      const { closingDate, dueDate } = getInvoiceDates({
        competence: { month: 6, year: 2026 },
        closingDay: 5,
        dueDay: 15,
      });
      expect(closingDate.toISOString()).toBe("2026-06-05T00:00:00.000Z");
      expect(dueDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    });
    it("vencimento no mês seguinte quando dueDay <= closingDay", () => {
      const { closingDate, dueDate } = getInvoiceDates({
        competence: { month: 6, year: 2026 },
        closingDay: 25,
        dueDay: 5,
      });
      expect(closingDate.toISOString()).toBe("2026-06-25T00:00:00.000Z");
      expect(dueDate.toISOString()).toBe("2026-07-05T00:00:00.000Z");
    });
    it("faz clamp do fechamento 31 em fevereiro", () => {
      const { closingDate } = getInvoiceDates({
        competence: { month: 2, year: 2026 },
        closingDay: 31,
        dueDay: 10,
      });
      expect(closingDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    });
  });

  describe("installmentSplit", () => {
    it("divide igualmente quando exato", () => {
      expect(installmentSplit(300, 3)).toEqual([100, 100, 100]);
    });
    it("a última parcela absorve o resto e a soma bate com o total", () => {
      const parts = installmentSplit(100, 3);
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(33.33);
      expect(parts[2]).toBe(33.34);
      expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
    });
    it("retorna o total em uma parcela quando n <= 1", () => {
      expect(installmentSplit(250.5, 1)).toEqual([250.5]);
    });
  });

  describe("computeRevolvingInterest", () => {
    it("aplica a taxa mensal sobre o saldo em aberto", () => {
      expect(computeRevolvingInterest(1000, 0.15)).toBe(150);
    });
    it("retorna 0 quando não há saldo", () => {
      expect(computeRevolvingInterest(0)).toBe(0);
      expect(computeRevolvingInterest(-50)).toBe(0);
    });
  });

  describe("computeBestPurchaseDay", () => {
    it("retorna o dia seguinte ao fechamento", () => {
      expect(computeBestPurchaseDay(10)).toBe(11);
    });
    it("rola para o dia 1 quando o fechamento é 31", () => {
      expect(computeBestPurchaseDay(31)).toBe(1);
    });
  });

  describe("computeCardSummary", () => {
    const base = {
      creditLimit: 1000,
      closingDay: 15,
      dueDay: 25,
      paidTotal: 0,
      now: d("2026-06-10"),
    };

    it("calcula devido, disponível e utilização", () => {
      const s = computeCardSummary({
        ...base,
        transactions: [
          { type: "PURCHASE", amount: 200, date: d("2026-06-05") },
          { type: "PURCHASE", amount: 100, date: d("2026-06-08") },
          { type: "REFUND", amount: 50, date: d("2026-06-09") },
        ],
      });
      expect(s.totalOwed).toBe(250);
      expect(s.availableLimit).toBe(750);
      expect(s.usagePercent).toBe(25);
    });

    it("abate pagamentos do total devido", () => {
      const s = computeCardSummary({
        ...base,
        paidTotal: 100,
        transactions: [{ type: "PURCHASE", amount: 300, date: d("2026-06-05") }],
      });
      expect(s.totalOwed).toBe(200);
    });

    it("separa fatura atual de parcelas futuras", () => {
      const s = computeCardSummary({
        ...base,
        transactions: [
          { type: "PURCHASE", amount: 100, date: d("2026-06-05") }, // competência 6 (atual)
          { type: "PURCHASE", amount: 100, date: d("2026-07-05") }, // competência 7 (futura)
        ],
      });
      expect(s.currentInvoiceTotal).toBe(100);
      expect(s.committedFuture).toBe(100);
    });

    it("usagePercent é 0 quando não há limite", () => {
      const s = computeCardSummary({
        ...base,
        creditLimit: 0,
        transactions: [{ type: "PURCHASE", amount: 100, date: d("2026-06-05") }],
      });
      expect(s.usagePercent).toBe(0);
    });

    it("expõe próximas datas de fechamento e vencimento a partir de now", () => {
      const s = computeCardSummary({ ...base, transactions: [] });
      expect(s.nextClosingDate.toISOString()).toBe("2026-06-15T00:00:00.000Z");
      expect(s.nextDueDate.toISOString()).toBe("2026-06-25T00:00:00.000Z");
    });
  });
});
