import { describe, it, expect } from "vitest";
import { forecastInvoices } from "./credit-card-forecast";

function d(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

describe("credit-card-forecast.ts", () => {
  const closingDay = 15;
  const now = d("2026-06-10"); // competência atual: 06/2026

  it("projeta parcelas comprometidas nas competências futuras", () => {
    const points = forecastInvoices({
      now,
      closingDay,
      monthsAhead: 3,
      transactions: [
        // Parcela em julho/2026 (competência futura).
        { amount: 100, date: d("2026-07-05"), type: "PURCHASE", installmentNumber: 2 },
        // Parcela em agosto/2026.
        { amount: 100, date: d("2026-08-05"), type: "PURCHASE", installmentNumber: 3 },
      ],
    });
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ month: 7, year: 2026, committed: 100 });
    expect(points[1]).toMatchObject({ month: 8, year: 2026, committed: 100 });
    expect(points[2]).toMatchObject({ month: 9, year: 2026, committed: 0 });
  });

  it("soma a média histórica de gasto avulso na projeção", () => {
    const points = forecastInvoices({
      now,
      closingDay,
      monthsAhead: 1,
      transactions: [
        // 3 meses anteriores (03,04,05/2026) com gasto avulso de 300 cada => média 300.
        { amount: 300, date: d("2026-03-05"), type: "PURCHASE", installmentNumber: null },
        { amount: 300, date: d("2026-04-05"), type: "PURCHASE", installmentNumber: null },
        { amount: 300, date: d("2026-05-05"), type: "PURCHASE", installmentNumber: null },
        // Parcela futura em julho.
        { amount: 150, date: d("2026-07-05"), type: "PURCHASE", installmentNumber: 2 },
      ],
    });
    expect(points[0].committed).toBe(150);
    expect(points[0].projected).toBe(450); // 150 comprometido + 300 média avulsa
  });

  it("vira o ano nas competências futuras", () => {
    const points = forecastInvoices({
      now: d("2026-12-10"),
      closingDay,
      monthsAhead: 2,
      transactions: [],
    });
    expect(points[0]).toMatchObject({ month: 1, year: 2027 });
    expect(points[1]).toMatchObject({ month: 2, year: 2027 });
  });
});
