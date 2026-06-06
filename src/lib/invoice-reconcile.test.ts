import { describe, it, expect } from "vitest";
import { reconcileInvoice } from "./invoice-reconcile";

describe("invoice-reconcile.ts", () => {
  it("casa linhas por valor e título", () => {
    const result = reconcileInvoice(
      [
        { description: "Netflix", amount: 39.9 },
        { description: "Uber", amount: 25 },
      ],
      [
        { id: "a", title: "Netflix mensal", amount: 39.9 },
        { id: "b", title: "Uber trip", amount: 25 },
      ]
    );
    expect(result.matched).toHaveLength(2);
    expect(result.missingInApp).toHaveLength(0);
    expect(result.extraInApp).toHaveLength(0);
  });

  it("aponta cobrança da fatura física não lançada no app", () => {
    const result = reconcileInvoice(
      [{ description: "Cobrança desconhecida", amount: 99.9 }],
      []
    );
    expect(result.missingInApp).toHaveLength(1);
    expect(result.missingInApp[0].amount).toBe(99.9);
  });

  it("aponta lançamento do app ausente na fatura física", () => {
    const result = reconcileInvoice(
      [],
      [{ id: "x", title: "Compra manual", amount: 50 }]
    );
    expect(result.extraInApp).toHaveLength(1);
    expect(result.extraInApp[0].id).toBe("x");
  });

  it("não reusa o mesmo lançamento para duas linhas", () => {
    const result = reconcileInvoice(
      [
        { description: "Café", amount: 10 },
        { description: "Café", amount: 10 },
      ],
      [{ id: "a", title: "Café", amount: 10 }]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.missingInApp).toHaveLength(1);
  });
});
