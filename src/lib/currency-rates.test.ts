import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>("./__mocks__/prisma");
  return { prisma: mod.prismaMock };
});

import { prismaMock } from "./__mocks__/prisma";
import { getLatestRate, convert } from "./currency-rates";
import type { ExchangeRate } from "@/generated/prisma/client";

function buildRate(overrides: Partial<ExchangeRate> = {}): ExchangeRate {
  return {
    id: "rate-1",
    base: "USD",
    quote: "BRL",
    rate: 5,
    date: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides,
  } as ExchangeRate;
}

beforeEach(() => {
  prismaMock.exchangeRate.findFirst.mockResolvedValue(null);
});

describe("lib/currency-rates.ts — getLatestRate", () => {
  it("retorna 1 para a mesma moeda sem consultar o banco", async () => {
    const rate = await getLatestRate("BRL", "BRL");
    expect(rate).toBe(1);
    expect(prismaMock.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it("usa a taxa direta quando existe", async () => {
    prismaMock.exchangeRate.findFirst.mockResolvedValueOnce(buildRate({ rate: 5 }));
    expect(await getLatestRate("USD", "BRL")).toBe(5);
  });

  it("cai para a inversa (1/rate) quando não há taxa direta", async () => {
    prismaMock.exchangeRate.findFirst
      .mockResolvedValueOnce(null) // direta USD->BRL
      .mockResolvedValueOnce(buildRate({ base: "BRL", quote: "USD", rate: 4 })); // inversa
    expect(await getLatestRate("USD", "BRL")).toBeCloseTo(0.25, 6);
  });

  it("retorna null quando não há cotação direta nem inversa", async () => {
    expect(await getLatestRate("USD", "EUR")).toBeNull();
  });
});

describe("lib/currency-rates.ts — convert", () => {
  it("converte e arredonda usando a taxa", async () => {
    prismaMock.exchangeRate.findFirst.mockResolvedValueOnce(buildRate({ rate: 5.1234 }));
    // 100 * 5.1234 = 512.34
    expect(await convert(100, "USD", "BRL")).toBeCloseTo(512.34, 2);
  });

  it("assume 1:1 (valor original arredondado) quando não há cotação", async () => {
    expect(await convert(123.456, "USD", "EUR")).toBeCloseTo(123.46, 2);
  });
});
