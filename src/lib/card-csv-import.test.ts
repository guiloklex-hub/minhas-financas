import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  parseCsvDateToIso,
  parseCsvAmount,
  detectDelimiter,
  detectCsvLayout,
  mapCsvRowToRawLine,
  type CsvLayout,
} from "./card-csv-import";

// Data de referência fixa para a inferência de ano em datas DD/MM.
const REF = new Date(Date.UTC(2026, 5, 9)); // 2026-06-09

const DEFAULT_LAYOUT: CsvLayout = {
  date: 0,
  description: 1,
  amount: 2,
  type: 3,
  installment: 4,
  card: 5,
};

describe("card-csv-import.ts", () => {
  describe("detectDelimiter", () => {
    it("detecta ; quando predominante e , como padrão", () => {
      expect(detectDelimiter("Data;Descrição;Valor;Tipo;Parcela;Cartão")).toBe(";");
      expect(detectDelimiter("2026-05-27,Mercado,150.50")).toBe(",");
    });
  });

  describe("parseCsvAmount", () => {
    it("entende formatos pt-BR e EN", () => {
      expect(parseCsvAmount("136,79")).toBe(136.79);
      expect(parseCsvAmount("1.234,56")).toBe(1234.56);
      expect(parseCsvAmount("1234.56")).toBe(1234.56);
      expect(parseCsvAmount("R$ 90,00")).toBe(90);
      expect(parseCsvAmount("-1,91")).toBe(-1.91);
    });
    it("retorna NaN para texto", () => {
      expect(Number.isNaN(parseCsvAmount("abc"))).toBe(true);
      expect(Number.isNaN(parseCsvAmount(""))).toBe(true);
    });
  });

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
    it("usa ; como separador quando informado (valor com vírgula decimal intacto)", () => {
      expect(parseCsvLine("06/06;Covabra itupeva loja 2;136,79;compra;;4642", ";")).toEqual([
        "06/06",
        "Covabra itupeva loja 2",
        "136,79",
        "compra",
        "",
        "4642",
      ]);
    });
  });

  describe("parseCsvDateToIso", () => {
    it("aceita ISO e DD/MM/YYYY", () => {
      expect(parseCsvDateToIso("2026-05-27")).toBe("2026-05-27");
      expect(parseCsvDateToIso("27/05/2026")).toBe("2026-05-27");
      expect(parseCsvDateToIso("7/5/2026")).toBe("2026-05-07");
    });
    it("infere o ano em DD/MM (passado mais recente, trata virada dez→jan)", () => {
      expect(parseCsvDateToIso("06/06", REF)).toBe("2026-06-06"); // já passou neste ano
      expect(parseCsvDateToIso("09/06", REF)).toBe("2026-06-09"); // hoje
      expect(parseCsvDateToIso("15/12", REF)).toBe("2025-12-15"); // futuro neste ano => ano anterior
    });
    it("rejeita datas inexistentes e formatos inválidos", () => {
      expect(parseCsvDateToIso("31/02/2026")).toBeNull();
      expect(parseCsvDateToIso("2026-13-01")).toBeNull();
      expect(parseCsvDateToIso("32/01", REF)).toBeNull();
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

    it("lê a parcela da coluna explícita sem poluir a descrição", () => {
      const raw = mapCsvRowToRawLine(["2026-05-27", "Loja", "100", "", "03/05"], DEFAULT_LAYOUT);
      expect(raw?.description).toBe("Loja");
      expect(raw?.installmentNumber).toBe(3);
      expect(raw?.installmentTotal).toBe(5);
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

  describe("integração: export pt-BR real (separador ;, DD/MM, valor com vírgula)", () => {
    const csv = [
      "Data;Descrição;Valor;Tipo;Parcela;Cartão",
      "06/06;Covabra itupeva loja 2;136,79;compra;;4642",
      "05/06;Estorno juros de financ;-1,91;estorno;;4642",
      "05/06;Granado pharmacias01/05;150,62;compra;01/03;4642",
      "04/06;Dm*spotify;23,90;compra;;@7725",
      "15/12;Kar brasil 07/10;234,60;compra;07/10;4642",
    ].join("\n");

    it("parseia o arquivo do começo ao fim", () => {
      const lines = csv.split("\n");
      const delimiter = detectDelimiter(lines[0]);
      expect(delimiter).toBe(";");

      const { layout, hasHeader } = detectCsvLayout(parseCsvLine(lines[0], delimiter));
      expect(hasHeader).toBe(true);

      const rows = lines
        .slice(1)
        .map((l) => mapCsvRowToRawLine(parseCsvLine(l, delimiter), layout, REF))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      expect(rows).toHaveLength(5);

      expect(rows[0]).toMatchObject({ date: "2026-06-06", description: "Covabra itupeva loja 2", amount: 136.79 });
      expect(rows[1]).toMatchObject({ description: "Estorno juros de financ", amount: 1.91, type: "REFUND" });
      expect(rows[2]).toMatchObject({ installmentNumber: 1, installmentTotal: 3, cardLastFour: "4642", isVirtual: false });
      expect(rows[3]).toMatchObject({ cardLastFour: "7725", isVirtual: true });
      expect(rows[4]).toMatchObject({ date: "2025-12-15", installmentNumber: 7, installmentTotal: 10 });
    });
  });
});
