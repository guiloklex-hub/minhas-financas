import { describe, it, expect } from "vitest";
import { aggregatePie, OTHERS_COLOR, type PieSlice } from "./chart-theme";

const slice = (name: string, value: number): PieSlice => ({ name, value, color: "#000" });

describe("aggregatePie", () => {
  it("mantém todas as fatias quando <= maxSlices", () => {
    const data = [slice("A", 10), slice("B", 5)];
    expect(aggregatePie(data, 6)).toHaveLength(2);
  });

  it("agrega as menores em 'Outros' quando excede maxSlices", () => {
    const data = [
      slice("A", 100), slice("B", 80), slice("C", 60),
      slice("D", 40), slice("E", 20), slice("F", 10), slice("G", 5),
    ];
    const result = aggregatePie(data, 6);
    expect(result).toHaveLength(6);
    const others = result[result.length - 1];
    expect(others.name).toBe("Outros");
    expect(others.value).toBe(15); // F(10) + G(5)
    expect(others.color).toBe(OTHERS_COLOR);
  });

  it("ordena por valor desc e ignora valores <= 0", () => {
    const data = [slice("A", 5), slice("B", 30), slice("C", 0), slice("D", -10)];
    const result = aggregatePie(data, 6);
    expect(result.map((s) => s.name)).toEqual(["B", "A"]);
  });
});
