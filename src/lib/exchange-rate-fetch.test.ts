import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>("./__mocks__/prisma");
  return { prisma: mod.prismaMock };
});

import { prismaMock } from "./__mocks__/prisma";
import { refreshExchangeRatesFromApi } from "./exchange-rate-fetch";

// Resposta real do endpoint /last da AwesomeAPI (recortada).
const SAMPLE = {
  USDBRL: { code: "USD", codein: "BRL", name: "Dólar Americano/Real Brasileiro", bid: "5.1555", ask: "5.1585" },
  EURBRL: { code: "EUR", codein: "BRL", name: "Euro/Real Brasileiro", bid: "5.93824", ask: "5.95238" },
  GBPBRL: { code: "GBP", codein: "BRL", name: "Libra Esterlina/Real Brasileiro", bid: "6.88368", ask: "6.88769" },
};

const URL_OK = "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL";

function mockFetch(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({})),
  }));
}

describe("lib/exchange-rate-fetch.ts", () => {
  beforeEach(() => {
    prismaMock.exchangeRate.upsert.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("faz upsert de cada par com base/quote/bid e data UTC do dia", async () => {
    vi.stubEnv("EXCHANGE_RATE_API_URL", URL_OK);
    mockFetch({ ok: true, json: async () => SAMPLE });

    const now = new Date("2026-06-05T17:30:00.000Z");
    const result = await refreshExchangeRatesFromApi(now);

    expect(result).toEqual({ ok: true, updated: 3 });
    expect(prismaMock.exchangeRate.upsert).toHaveBeenCalledTimes(3);

    const day = new Date(Date.UTC(2026, 5, 5));
    expect(prismaMock.exchangeRate.upsert).toHaveBeenCalledWith({
      where: { base_quote_date: { base: "USD", quote: "BRL", date: day } },
      update: { rate: 5.1555 },
      create: { base: "USD", quote: "BRL", rate: 5.1555, date: day },
    });
    expect(prismaMock.exchangeRate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ base: "EUR", rate: 5.93824 }) })
    );
    expect(prismaMock.exchangeRate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ base: "GBP", rate: 6.88368 }) })
    );
  });

  it("é no-op quando EXCHANGE_RATE_API_URL não está configurada", async () => {
    vi.stubEnv("EXCHANGE_RATE_API_URL", "");
    const result = await refreshExchangeRatesFromApi();
    expect(result.ok).toBe(false);
    expect(prismaMock.exchangeRate.upsert).not.toHaveBeenCalled();
  });

  it("retorna erro em falha HTTP", async () => {
    vi.stubEnv("EXCHANGE_RATE_API_URL", URL_OK);
    mockFetch({ ok: false, status: 503 });
    const result = await refreshExchangeRatesFromApi();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
    expect(prismaMock.exchangeRate.upsert).not.toHaveBeenCalled();
  });

  it("ignora entradas com bid inválido", async () => {
    vi.stubEnv("EXCHANGE_RATE_API_URL", URL_OK);
    mockFetch({
      ok: true,
      json: async () => ({
        USDBRL: { code: "USD", codein: "BRL", bid: "5.15" },
        BADBRL: { code: "BAD", codein: "BRL", bid: "abc" },
      }),
    });
    const result = await refreshExchangeRatesFromApi();
    expect(result).toEqual({ ok: true, updated: 1 });
    expect(prismaMock.exchangeRate.upsert).toHaveBeenCalledTimes(1);
  });
});
