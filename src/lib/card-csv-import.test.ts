import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  parseCsvDateToIso,
  detectCsvLayout,
  mapCsvRowToRawLine,
  type CsvLayout,
} from "./card-csv-import";

const DEFAULT_LAYOUT: CsvLayout = {
  date: 0,
  description: 1,
  amount: 2,
  type: 3,
  installment: 4,
  card: 5,
};

describe("card-csv-import.ts", () => {
  describe("parseCsvLine", () => {
    it("separa colunas simples", () => {
      expect(parseCsvLine("2026-01-10,Mercado,150.50")).toEqual(["2026-01-10", "Mercado", "150.50"]);
    });
    it("respeita aspas com vírgula interna e aspas escapadas", () => {
      expect(parseCsvLine('2026-01-10,"Mercado, feira",-150.50')).toEqual([
        "2026-01-10",
        "Mercado, feira",
        "-150.50",
      ]);
      expect(parseCsvLine('"Diz ""oi""",x')).toEqual(['Diz "oi"', "x"]);
    });
  });

  describe("parseCsvDateToIso", () => {
    it("aceita ISO e DD/MM/YYYY", () => {
      expect(parseCsvDateToIso("2026-05-27")).toBe("2026-05-27");
      expect(parseCsvDateToIso("27/05/2026")).toBe("2026-05-27");
      expect(parseCsvDateToIso("7/5/2026")).toBe("2026-05-07");
    });
    it("rejeita datas inexistentes e formatos inválidos", () => {
      expect(parseCsvDateToIso("31/02/2026")).toBeNull();
      expect(parseCsvDateToIso("2026-13-01")).toBeNull();
      expect(parseCsvDateToIso("Data")).toBeNull();
      expect(parseCsvDateToIso("")).toBeNull();
    });
  });

  describe("detectCsvLayout", () => {
    it("usa posicional quando a 1ª linha já é dado (sem cabeçalho)", () => {
      const { layout, hasHeader } = detectCsvLayout(["2026-05-27", "Mercado", "150"]);
      expect(hasHeader).toBe(false);
      expect(layout).toEqual(DEFAULT_LAYOUT);
    });
    it("mapeia colunas por nome quando há cabeçalho (ordem arbitrária)", () => {
      const { layout, hasHeader } = detectCsvLayout(["Valor", "Data", "Histórico", "Tipo", "Parcela", "Final"]);
      expect(hasHeader).toBe(true);
      expect(layout.amount).toBe(0);
      expect(layout.date).toBe(1);
      expect(layout.description).toBe(2);
      expect(layout.type).toBe(3);
      expect(layout.installment).toBe(4);
      expect(layout.card).toBe(5);
    });
    it("cai no posicional quando o cabeçalho não tem colunas obrigatórias reconhecíveis", () => {
      const { layout, hasHeader } = detectCsvLayout(["col1", "col2", "col3"]);
      expect(hasHeader).toBe(true);
      expect(layout).toEqual(DEFAULT_LAYOUT);
    });
  });

  describe("mapCsvRowToRawLine", () => {
    it("mapeia linha simples (PURCHASE) com valor em vírgula", () => {
      const raw = mapCsvRowToRawLine(["27/05/2026", "Mercado", "150,50"], DEFAULT_LAYOUT);
      expect(raw).not.toBeNull();
      expect(raw?.date).toBe("2026-05-27");
      expect(raw?.description).toBe("Mercado");
      expect(raw?.amount).toBe(150.5);
      expect(raw?.type).toBeUndefined();
    });

    it("valor negativo sem tipo explícito vira REFUND", () => {
      const raw = mapCsvRowToRawLine(["2026-05-27", "Estorno loja", "-90"], DEFAULT_LAYOUT);
      expect(raw?.type).toBe("REFUND");
      expect(raw?.amount).toBe(90);
    });

    it("normaliza tipo em PT/EN", () => {
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "10", "estorno"], DEFAULT_LAYOUT)?.type).toBe("REFUND");
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "10", "Taxa"], DEFAULT_LAYOUT)?.type).toBe("FEE");
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "10", "JUROS"], DEFAULT_LAYOUT)?.type).toBe("INTEREST");
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "10", "compra"], DEFAULT_LAYOUT)?.type).toBe("PURCHASE");
    });

    it("tipo explícito tem prioridade sobre sinal do valor", () => {
      const raw = mapCsvRowToRawLine(["2026-05-27", "X", "-10", "compra"], DEFAULT_LAYOUT);
      expect(raw?.type).toBe("PURCHASE");
      expect(raw?.amount).toBe(10);
    });

    it("anexa parcela da coluna à descrição", () => {
      const raw = mapCsvRowToRawLine(["2026-05-27", "Loja", "100", "", "03/05"], DEFAULT_LAYOUT);
      expect(raw?.description).toBe("Loja 03/05");
    });

    it("detecta cartão virtual (@) e final na coluna de cartão", () => {
      const virtual = mapCsvRowToRawLine(["2026-05-27", "X", "10", "", "", "@1234"], DEFAULT_LAYOUT);
      expect(virtual?.isVirtual).toBe(true);
      expect(virtual?.cardLastFour).toBe("1234");

      const fisico = mapCsvRowToRawLine(["2026-05-27", "X", "10", "", "", "final 5678"], DEFAULT_LAYOUT);
      expect(fisico?.isVirtual).toBe(false);
      expect(fisico?.cardLastFour).toBe("5678");
    });

    it("retorna null para data inválida (cabeçalho), descrição vazia ou valor zero", () => {
      expect(mapCsvRowToRawLine(["Data", "Mercado", "10"], DEFAULT_LAYOUT)).toBeNull();
      expect(mapCsvRowToRawLine(["2026-05-27", "  ", "10"], DEFAULT_LAYOUT)).toBeNull();
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "0"], DEFAULT_LAYOUT)).toBeNull();
      expect(mapCsvRowToRawLine(["2026-05-27", "X", "abc"], DEFAULT_LAYOUT)).toBeNull();
    });
  });
});
