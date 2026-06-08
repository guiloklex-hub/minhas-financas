import { describe, it, expect } from "vitest";
import { formatCivilDate, formatTimestamp, toDateInputValue } from "./format-date";

describe("formatCivilDate", () => {
  // O cerne do bug "voltou um dia": uma data gravada como meia-noite UTC deve
  // exibir o MESMO dia civil em qualquer fuso. Sem `timeZone: "UTC"`, num fuso
  // negativo (BRT, UTC-3) o dia 10 às 00:00Z apareceria como dia 09.
  it("preserva o dia civil de uma data em meia-noite UTC", () => {
    expect(formatCivilDate(new Date(Date.UTC(2026, 5, 10)))).toBe("10/06/2026");
  });

  it("formata string ISO YYYY-MM-DD (que cai em meia-noite UTC) sem off-by-one", () => {
    expect(formatCivilDate("2026-06-10")).toBe("10/06/2026");
  });

  it("preserva o dia mesmo com ISO completo terminado em Z", () => {
    expect(formatCivilDate("2026-06-10T00:00:00.000Z")).toBe("10/06/2026");
  });

  it("não vira o ano numa data de virada (31/12 meia-noite UTC)", () => {
    expect(formatCivilDate(new Date(Date.UTC(2025, 11, 31)))).toBe("31/12/2025");
  });

  it("aceita timestamp numérico (epoch ms em UTC)", () => {
    expect(formatCivilDate(Date.UTC(2026, 0, 1))).toBe("01/01/2026");
  });

  it("repassa opções do Intl (dateStyle medium)", () => {
    expect(
      formatCivilDate(new Date(Date.UTC(2026, 5, 10)), { dateStyle: "medium" })
    ).toBe("10 de jun. de 2026");
  });
});

describe("toDateInputValue", () => {
  // Espelha o bug dos modais de edição: o valor do input não pode voltar um dia.
  it("retorna AAAA-MM-DD de uma data civil (meia-noite UTC) sem off-by-one", () => {
    expect(toDateInputValue(new Date(Date.UTC(2026, 5, 10)))).toBe("2026-06-10");
  });

  it("aceita string ISO completa", () => {
    expect(toDateInputValue("2026-06-10T00:00:00.000Z")).toBe("2026-06-10");
  });

  it("retorna vazio para nulo/indefinido/ inválido", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("não é data")).toBe("");
  });
});

describe("formatTimestamp", () => {
  // 03:00Z corresponde a 00:00 em America/Sao_Paulo (UTC-3) — ainda no dia 10.
  it("exibe instante real no fuso America/Sao_Paulo", () => {
    expect(formatTimestamp("2026-06-10T03:00:00.000Z")).toBe("10/06/2026, 00:00");
  });
});
