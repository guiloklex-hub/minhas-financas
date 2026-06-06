import { describe, it, expect } from "vitest";
import { sanitizeAiCategoryMap } from "./ai-categorize";

describe("ai-categorize.ts — sanitizeAiCategoryMap", () => {
  const validIds = new Set(["cat-food", "cat-transport"]);

  it("casa título pedido com sugestão válida (por título normalizado)", () => {
    const map = sanitizeAiCategoryMap(
      [{ title: "Pão de Açúcar", categoryId: "cat-food" }],
      validIds,
      ["pao de acucar #123"] // normaliza para o mesmo "pao de acucar"
    );
    expect(map.get("pao de acucar #123")).toBe("cat-food");
  });

  it("descarta categoryId que não existe (alucinação)", () => {
    const map = sanitizeAiCategoryMap(
      [{ title: "Uber", categoryId: "inexistente" }],
      validIds,
      ["Uber"]
    );
    expect(map.get("Uber")).toBeNull();
  });

  it("retorna null para título sem sugestão", () => {
    const map = sanitizeAiCategoryMap(
      [{ title: "Uber", categoryId: "cat-transport" }],
      validIds,
      ["Netflix"]
    );
    expect(map.get("Netflix")).toBeNull();
  });

  it("mapeia todos os títulos pedidos (mesmo sem retorno da IA)", () => {
    const map = sanitizeAiCategoryMap([], validIds, ["a", "b"]);
    expect(map.size).toBe(2);
    expect(map.get("a")).toBeNull();
    expect(map.get("b")).toBeNull();
  });

  it("ignora categoryId vazio", () => {
    const map = sanitizeAiCategoryMap(
      [{ title: "Uber", categoryId: "" }],
      validIds,
      ["Uber"]
    );
    expect(map.get("Uber")).toBeNull();
  });
});
