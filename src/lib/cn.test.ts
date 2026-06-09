import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("combina classes condicionais", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
  it("resolve conflitos de utilitários Tailwind (último vence)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-foreground", "text-lg")).toBe("text-foreground text-lg");
  });
});
