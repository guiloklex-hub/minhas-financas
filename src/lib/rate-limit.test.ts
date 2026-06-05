// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, resetRateLimit, clearRateLimitStore } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  it("permite até o máximo de tentativas dentro da janela", () => {
    const now = 1_000;
    for (let i = 0; i < 5; i++) {
      const result = rateLimit("k", 5, 60_000, now);
      expect(result.ok).toBe(true);
    }
  });

  it("bloqueia a tentativa que excede o máximo e informa retryAfterMs", () => {
    const now = 1_000;
    for (let i = 0; i < 5; i++) {
      rateLimit("k", 5, 60_000, now);
    }
    const blocked = rateLimit("k", 5, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it("o retryAfterMs diminui conforme o tempo passa dentro da janela", () => {
    const start = 1_000;
    for (let i = 0; i < 5; i++) {
      rateLimit("k", 5, 60_000, start);
    }
    const blocked = rateLimit("k", 5, 60_000, start + 20_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(40_000);
  });

  it("reseta e volta a permitir após o fim da janela", () => {
    const start = 1_000;
    for (let i = 0; i < 5; i++) {
      rateLimit("k", 5, 60_000, start);
    }
    // Logo após o reset (resetAt = start + 60_000) deve permitir de novo.
    const afterWindow = rateLimit("k", 5, 60_000, start + 60_000);
    expect(afterWindow.ok).toBe(true);
  });

  it("isola contadores por chave distinta", () => {
    const now = 1_000;
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000, now);

    // "a" esgotou, mas "b" ainda tem cota cheia.
    expect(rateLimit("a", 5, 60_000, now).ok).toBe(false);
    expect(rateLimit("b", 5, 60_000, now).ok).toBe(true);
  });

  it("resetRateLimit zera o contador de uma chave", () => {
    const now = 1_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, now);
    expect(rateLimit("k", 5, 60_000, now).ok).toBe(false);

    resetRateLimit("k");
    expect(rateLimit("k", 5, 60_000, now).ok).toBe(true);
  });
});
