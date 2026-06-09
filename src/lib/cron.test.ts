import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAuthorizedCron } from "./cron";

function reqWith(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://example.com/api/cron/daily", { headers });
}

describe("lib/cron.ts — isAuthorizedCron", () => {
  const original = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cr3t-token";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("aceita o Bearer correto", () => {
    expect(isAuthorizedCron(reqWith("Bearer s3cr3t-token"))).toBe(true);
  });

  it("rejeita Bearer incorreto", () => {
    expect(isAuthorizedCron(reqWith("Bearer errado"))).toBe(false);
  });

  it("rejeita header ausente", () => {
    expect(isAuthorizedCron(reqWith(undefined))).toBe(false);
  });

  it("rejeita quando o token está sem o prefixo Bearer", () => {
    expect(isAuthorizedCron(reqWith("s3cr3t-token"))).toBe(false);
  });

  it("nega quando CRON_SECRET não está configurado", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(reqWith("Bearer s3cr3t-token"))).toBe(false);
  });
});
