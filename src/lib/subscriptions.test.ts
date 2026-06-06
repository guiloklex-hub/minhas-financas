import { describe, it, expect } from "vitest";
import { detectSubscriptions, totalMonthlySubscriptions } from "./subscriptions";

function d(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function tx(title: string, amount: number, date: string, type = "PURCHASE") {
  return { title, amount, date: d(date), type };
}

describe("subscriptions.ts", () => {
  it("detecta cobrança mensal recorrente com valor similar", () => {
    const subs = detectSubscriptions([
      tx("Netflix", 39.9, "2026-01-10"),
      tx("Netflix", 39.9, "2026-02-10"),
      tx("Netflix", 44.9, "2026-03-10"),
    ]);
    expect(subs).toHaveLength(1);
    expect(subs[0].title).toBe("Netflix");
    expect(subs[0].months).toBe(3);
  });

  it("ignora grupos com menos de 3 meses", () => {
    const subs = detectSubscriptions([
      tx("Spotify", 21.9, "2026-01-05"),
      tx("Spotify", 21.9, "2026-02-05"),
    ]);
    expect(subs).toHaveLength(0);
  });

  it("ignora quando o valor varia demais (não é assinatura)", () => {
    const subs = detectSubscriptions([
      tx("Mercado", 100, "2026-01-05"),
      tx("Mercado", 300, "2026-02-05"),
      tx("Mercado", 250, "2026-03-05"),
    ]);
    expect(subs).toHaveLength(0);
  });

  it("ignora cadência não mensal (meses muito espaçados)", () => {
    const subs = detectSubscriptions([
      tx("Anuidade", 50, "2024-01-05"),
      tx("Anuidade", 50, "2025-01-05"),
      tx("Anuidade", 50, "2026-01-05"),
    ]);
    expect(subs).toHaveLength(0);
  });

  it("ignora estornos (REFUND)", () => {
    const subs = detectSubscriptions([
      tx("Netflix", 39.9, "2026-01-10", "REFUND"),
      tx("Netflix", 39.9, "2026-02-10", "REFUND"),
      tx("Netflix", 39.9, "2026-03-10", "REFUND"),
    ]);
    expect(subs).toHaveLength(0);
  });

  it("totalMonthlySubscriptions soma as estimativas", () => {
    const subs = detectSubscriptions([
      tx("Netflix", 40, "2026-01-10"),
      tx("Netflix", 40, "2026-02-10"),
      tx("Netflix", 40, "2026-03-10"),
      tx("Spotify", 20, "2026-01-15"),
      tx("Spotify", 20, "2026-02-15"),
      tx("Spotify", 20, "2026-03-15"),
    ]);
    expect(subs).toHaveLength(2);
    expect(totalMonthlySubscriptions(subs)).toBe(60);
  });
});
