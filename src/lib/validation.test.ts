import { describe, it, expect } from "vitest";
import {
  parseRequiredString,
  parseMoney,
  parseDate,
} from "./validation";

describe("validation.ts", () => {
  describe("parseRequiredString", () => {
    it("deve aceitar uma string válida e aplicar trim", () => {
      const result = parseRequiredString("  Olá  ", "Nome");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("Olá");
      }
    });

    it("deve falhar para string vazia", () => {
      const result = parseRequiredString("", "Nome");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Nome é obrigatório.");
      }
    });

    it("deve falhar para string só com espaços (whitespace)", () => {
      const result = parseRequiredString("     ", "Nome");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Nome é obrigatório.");
      }
    });

    it("deve falhar para valor null", () => {
      const result = parseRequiredString(null, "Nome");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Nome é obrigatório.");
      }
    });

    it("deve falhar quando o tamanho excede o máximo padrão (120)", () => {
      const result = parseRequiredString("a".repeat(121), "Nome");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Nome deve ter no máximo 120 caracteres.");
      }
    });

    it("deve aceitar exatamente o tamanho máximo padrão (120)", () => {
      const result = parseRequiredString("a".repeat(120), "Nome");
      expect(result.ok).toBe(true);
    });

    it("deve respeitar um máximo customizado", () => {
      const result = parseRequiredString("abcdef", "Código", 5);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Código deve ter no máximo 5 caracteres.");
      }
    });

    it("deve medir o tamanho após o trim", () => {
      const result = parseRequiredString("  ab  ", "Código", 2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("ab");
      }
    });
  });

  describe("parseMoney", () => {
    it("deve aceitar um número válido em string", () => {
      const result = parseMoney("123.45", "Valor");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(123.45);
      }
    });

    it("deve aceitar zero (limite inferior padrão)", () => {
      const result = parseMoney("0", "Valor");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });

    it("deve falhar para string vazia", () => {
      const result = parseMoney("", "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor é obrigatório.");
      }
    });

    it("deve falhar para valor null", () => {
      const result = parseMoney(null, "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor é obrigatório.");
      }
    });

    it("deve falhar para texto não numérico (NaN)", () => {
      const result = parseMoney("abc", "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser um número válido.");
      }
    });

    it("deve falhar para valor infinito", () => {
      const result = parseMoney("Infinity", "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser um número válido.");
      }
    });

    it("deve falhar para valor abaixo do mínimo padrão (negativo)", () => {
      const result = parseMoney("-1", "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser maior ou igual a 0.");
      }
    });

    it("deve falhar para valor acima do máximo padrão (1 bilhão)", () => {
      const result = parseMoney("1000000001", "Valor");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser menor ou igual a 1000000000.");
      }
    });

    it("deve respeitar min customizado", () => {
      const result = parseMoney("5", "Valor", { min: 10 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser maior ou igual a 10.");
      }
    });

    it("deve respeitar max customizado", () => {
      const result = parseMoney("50", "Valor", { max: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Valor deve ser menor ou igual a 20.");
      }
    });

    it("deve aceitar valor negativo quando min permitir", () => {
      const result = parseMoney("-50", "Valor", { min: -100 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(-50);
      }
    });
  });

  describe("parseDate", () => {
    it("deve aceitar uma data ISO válida", () => {
      const result = parseDate("2025-06-05", "Data");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Date);
        expect(Number.isNaN(result.value.getTime())).toBe(false);
      }
    });

    it("deve aceitar uma data ISO completa com horário", () => {
      const result = parseDate("2025-06-05T13:45:00.000Z", "Data");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.getTime()).toBe(
          new Date("2025-06-05T13:45:00.000Z").getTime()
        );
      }
    });

    it("deve falhar para string vazia", () => {
      const result = parseDate("", "Data");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Data é obrigatório.");
      }
    });

    it("deve falhar para valor null", () => {
      const result = parseDate(null, "Data");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Data é obrigatório.");
      }
    });

    it("deve falhar para data inválida", () => {
      const result = parseDate("não é uma data", "Data");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Data deve ser uma data válida.");
      }
    });

    it("deve falhar para string só com espaços (whitespace)", () => {
      const result = parseDate("   ", "Data");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("Data é obrigatório.");
      }
    });
  });
});
