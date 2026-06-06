import { describe, it, expect } from "vitest";
import { parseInstallment, sanitizeInvoiceLine, dedupKeyCard, sourceKey } from "./invoice-import";

describe("invoice-import.ts", () => {
  describe("parseInstallment", () => {
    it("extrai NN/NN", () => {
      expect(parseInstallment("LUCAR FUNILARIA 03/03")).toEqual({ number: 3, total: 3 });
      expect(parseInstallment("POLO WEAR MAXI 01/02")).toEqual({ number: 1, total: 2 });
    });
    it("retorna null sem parcela ou inválido", () => {
      expect(parseInstallment("MERCADO LIVRE")).toBeNull();
      expect(parseInstallment("FOO 05/03")).toBeNull(); // number > total
    });
  });

  describe("sanitizeInvoiceLine", () => {
    it("normaliza uma linha válida e extrai parcela da descrição", () => {
      const line = sanitizeInvoiceLine({
        date: "2026-05-27",
        description: "LUCAR FUNILARIA E 03/03",
        amount: 564.25,
        type: "PURCHASE",
      });
      expect(line).not.toBeNull();
      expect(line?.amount).toBe(564.25);
      expect(line?.installmentNumber).toBe(3);
      expect(line?.installmentTotal).toBe(3);
    });

    it("REFUND mantém amount positivo mesmo com valor negativo", () => {
      const line = sanitizeInvoiceLine({ date: "2026-06-03", description: "ESTORNO IOF", amount: -3.18, type: "REFUND" });
      expect(line?.type).toBe("REFUND");
      expect(line?.amount).toBe(3.18);
    });

    it("descarta linha sem descrição, sem valor ou sem data válida", () => {
      expect(sanitizeInvoiceLine({ date: "2026-06-03", description: "", amount: 10 })).toBeNull();
      expect(sanitizeInvoiceLine({ date: "2026-06-03", description: "X", amount: 0 })).toBeNull();
      expect(sanitizeInvoiceLine({ date: "xx", description: "X", amount: 10 })).toBeNull();
    });

    it("tipo desconhecido vira PURCHASE; captura fx e lastFour", () => {
      const line = sanitizeInvoiceLine({
        date: "2026-06-12",
        description: "PAYPAL MERCURYSHIN",
        amount: 206.72,
        type: "WAT",
        isInternational: true,
        fxCurrency: "usd",
        fxAmount: 39.83,
        cardLastFour: "7725",
        isVirtual: true,
      });
      expect(line?.type).toBe("PURCHASE");
      expect(line?.fxCurrency).toBe("USD");
      expect(line?.fxAmount).toBe(39.83);
      expect(line?.cardLastFour).toBe("7725");
      expect(line?.isVirtual).toBe(true);
    });
  });

  describe("dedupKeyCard", () => {
    it("monta a chave por cartão/dia/valor/título", () => {
      const key = dedupKeyCard("card-1", new Date("2026-06-05T00:00:00.000Z"), 50, "Mercado");
      expect(key).toBe("card-1|2026-06-05|50|Mercado");
    });
  });

  describe("sourceKey", () => {
    it("classifica físico, virtual e final", () => {
      expect(sourceKey({ isVirtual: false, cardLastFour: null })).toBe("PHYSICAL");
      expect(sourceKey({ isVirtual: true, cardLastFour: "7725" })).toBe("vc:7725");
      expect(sourceKey({ isVirtual: false, cardLastFour: "4642" })).toBe("final:4642");
    });
  });
});
