import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>("./__mocks__/prisma");
  return { prisma: mod.prismaMock };
});

import { prismaMock } from "./__mocks__/prisma";
import { getCardSpendByCategory, getCardSpendTotal, getCardSpendForCategory } from "./card-spend";
import type { CreditCardTransaction } from "@/generated/prisma/client";

const START = new Date("2026-06-01T00:00:00.000Z");
const END = new Date("2026-07-01T00:00:00.000Z");

/** Constrói linhas parciais (apenas os campos selecionados) tipadas para o mock. */
function rows(items: Array<Partial<CreditCardTransaction>>): CreditCardTransaction[] {
  return items as unknown as CreditCardTransaction[];
}

beforeEach(() => {
  prismaMock.creditCardTransaction.findMany.mockResolvedValue([]);
});

describe("lib/card-spend.ts — getCardSpendTotal", () => {
  it("soma PURCHASE/FEE/INTEREST e abate REFUND", async () => {
    prismaMock.creditCardTransaction.findMany.mockResolvedValueOnce(
      rows([
        { type: "PURCHASE", amount: 100 },
        { type: "FEE", amount: 10 },
        { type: "INTEREST", amount: 5 },
        { type: "REFUND", amount: 30 },
      ])
    );
    // 100 + 10 + 5 - 30 = 85
    expect(await getCardSpendTotal(START, END)).toBe(85);
  });

  it("retorna 0 quando não há lançamentos", async () => {
    expect(await getCardSpendTotal(START, END)).toBe(0);
  });
});

describe("lib/card-spend.ts — getCardSpendByCategory", () => {
  it("agrupa por categoria, usa chave vazia para sem categoria e abate REFUND", async () => {
    prismaMock.creditCardTransaction.findMany.mockResolvedValueOnce(
      rows([
        { categoryId: "cat-1", type: "PURCHASE", amount: 100 },
        { categoryId: "cat-1", type: "REFUND", amount: 40 },
        { categoryId: null, type: "PURCHASE", amount: 25 },
      ])
    );

    const map = await getCardSpendByCategory(START, END);
    expect(map.get("cat-1")).toBe(60);
    expect(map.get("")).toBe(25);
  });
});

describe("lib/card-spend.ts — getCardSpendForCategory", () => {
  it("filtra pela categoria e soma com sinal", async () => {
    prismaMock.creditCardTransaction.findMany.mockResolvedValueOnce(
      rows([
        { type: "PURCHASE", amount: 200 },
        { type: "REFUND", amount: 50 },
      ])
    );
    expect(await getCardSpendForCategory("cat-1", START, END)).toBe(150);

    const arg = prismaMock.creditCardTransaction.findMany.mock.calls[0][0];
    expect(arg?.where?.categoryId).toBe("cat-1");
  });
});
