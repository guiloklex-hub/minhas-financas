import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLatestRate, convert, formatMoney, getCurrencySymbol } from "./currency";
import { prismaMock } from "./__mocks__/prisma";
import type { ExchangeRate } from "@prisma/client";

// Substitui o Prisma importado em currency.ts pelo nosso mock.
vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>(
    "./__mocks__/prisma"
  );
  return { prisma: mod.prismaMock };
});

function makeRate(base: string, quote: string, rate: number): ExchangeRate {
  return {
    id: `${base}-${quote}`,
    base,
    quote,
    rate,
    date: new Date("2026-06-01T00:00:00.000Z"),
  };
}

describe("currency.ts", () => {
  beforeEach(() => {
    // Por padrão, nenhuma cotação encontrada (cada teste configura o que precisa).
    prismaMock.exchangeRate.findFirst.mockResolvedValue(null);
  });

  describe("getLatestRate", () => {
    it("retorna 1 quando base e quote são a mesma moeda (sem consultar o banco)", async () => {
      const rate = await getLatestRate("BRL", "BRL");
      expect(rate).toBe(1);
      expect(prismaMock.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it("usa a taxa direta (base→quote) mais recente quando existe", async () => {
      prismaMock.exchangeRate.findFirst.mockResolvedValueOnce(
        makeRate("USD", "BRL", 5.42)
      );

      const rate = await getLatestRate("USD", "BRL");
      expect(rate).toBe(5.42);
      expect(prismaMock.exchangeRate.findFirst).toHaveBeenCalledWith({
        where: { base: "USD", quote: "BRL" },
        orderBy: { date: "desc" },
      });
    });

    it("usa o inverso (1/rate) quando só existe a cotação contrária", async () => {
      // Primeira chamada (direta USD→BRL) => null; segunda (inversa BRL→USD) => 5.
      prismaMock.exchangeRate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeRate("BRL", "USD", 5));

      const rate = await getLatestRate("USD", "BRL");
      expect(rate).toBe(1 / 5);
    });

    it("retorna null quando não há cotação direta nem inversa", async () => {
      // beforeEach já deixa findFirst retornando null para ambas as chamadas.
      const rate = await getLatestRate("USD", "GBP");
      expect(rate).toBeNull();
      expect(prismaMock.exchangeRate.findFirst).toHaveBeenCalledTimes(2);
    });

    it("ignora taxa zero/negativa na direta e cai para o inverso", async () => {
      prismaMock.exchangeRate.findFirst
        .mockResolvedValueOnce(makeRate("USD", "BRL", 0))
        .mockResolvedValueOnce(makeRate("BRL", "USD", 4));

      const rate = await getLatestRate("USD", "BRL");
      expect(rate).toBe(1 / 4);
    });
  });

  describe("convert", () => {
    it("converte usando a taxa direta encontrada", async () => {
      prismaMock.exchangeRate.findFirst.mockResolvedValueOnce(
        makeRate("USD", "BRL", 5)
      );

      const result = await convert(10, "USD", "BRL");
      expect(result).toBe(50);
    });

    it("retorna o valor original (1:1) quando não há taxa cadastrada", async () => {
      // findFirst => null em ambas as chamadas (default do beforeEach).
      const result = await convert(123.45, "USD", "GBP");
      expect(result).toBe(123.45);
    });

    it("aplica roundMoney ao resultado convertido", async () => {
      // 10 * 0.3333 = 3.333 -> roundMoney -> 3.33
      prismaMock.exchangeRate.findFirst.mockResolvedValueOnce(
        makeRate("USD", "EUR", 0.3333)
      );

      const result = await convert(10, "USD", "EUR");
      expect(result).toBe(3.33);
    });

    it("retorna o mesmo valor quando from e to são iguais", async () => {
      const result = await convert(99.99, "BRL", "BRL");
      expect(result).toBe(99.99);
      expect(prismaMock.exchangeRate.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("formatMoney / getCurrencySymbol", () => {
    it("formata com símbolo e 2 casas decimais (pt-BR)", () => {
      //   é o espaço não-quebrável que o Intl insere como separador de milhar.
      expect(formatMoney(1234.5, "USD")).toBe("US$ 1.234,50");
      expect(formatMoney(0, "BRL")).toBe("R$ 0,00");
    });

    it("usa o código como fallback para moeda desconhecida", () => {
      expect(getCurrencySymbol("JPY")).toBe("JPY");
      expect(formatMoney(10, "JPY")).toBe("JPY 10,00");
    });
  });
});
