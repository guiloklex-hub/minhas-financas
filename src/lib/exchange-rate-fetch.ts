import { prisma } from "./prisma";

/**
 * Busca cotações de uma fonte externa e grava em `ExchangeRate`.
 *
 * Configurado por `EXCHANGE_RATE_API_URL` — projetado para o endpoint `/last` da
 * AwesomeAPI (ex.: https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL),
 * que responde um objeto `{ "USDBRL": { code, codein, bid, ... }, ... }`.
 *
 * Best-effort: nunca lança. No-op (ok:false) se a URL não estiver configurada.
 * Idempotente por dia: usa a meia-noite UTC de `now` como chave de data, então
 * rodar várias vezes no mesmo dia atualiza a mesma linha.
 */

type AwesomeApiQuote = {
  code?: string;
  codein?: string;
  bid?: string;
};

export type RefreshRatesResult = {
  ok: boolean;
  updated: number;
  error?: string;
};

function isQuote(value: unknown): value is AwesomeApiQuote {
  return typeof value === "object" && value !== null;
}

export async function refreshExchangeRatesFromApi(
  now: Date = new Date()
): Promise<RefreshRatesResult> {
  const url = process.env.EXCHANGE_RATE_API_URL;
  if (!url) {
    return { ok: false, updated: 0, error: "EXCHANGE_RATE_API_URL não configurada." };
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, updated: 0, error: `Falha ao consultar a API de câmbio (HTTP ${res.status}).` };
    }

    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null) {
      return { ok: false, updated: 0, error: "Resposta inesperada da API de câmbio." };
    }

    // Chave de data estável (meia-noite UTC de hoje) para upsert idempotente diário.
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let updated = 0;
    for (const raw of Object.values(data as Record<string, unknown>)) {
      if (!isQuote(raw)) continue;
      const base = raw.code;
      const quote = raw.codein;
      const rate = typeof raw.bid === "string" ? Number(raw.bid) : NaN;
      if (typeof base !== "string" || typeof quote !== "string") continue;
      if (!Number.isFinite(rate) || rate <= 0) continue;

      await prisma.exchangeRate.upsert({
        where: { base_quote_date: { base, quote, date: day } },
        update: { rate },
        create: { base, quote, rate, date: day },
      });
      updated++;
    }

    return { ok: true, updated };
  } catch (e) {
    return {
      ok: false,
      updated: 0,
      error: e instanceof Error ? e.message : "Erro ao buscar cotações.",
    };
  }
}
