// @vitest-environment node
import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "./auth";

describe("Auth Lib (JWT)", () => {
  it("deve assinar e verificar um token com sucesso", async () => {
    const payload = { userId: "user_123", email: "test@example.com" };
    const token = await signJwt(payload);
    
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    
    const verified = await verifyJwt(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("user_123");
    expect(verified?.email).toBe("test@example.com");
  });

  it("deve retornar nulo ao verificar token inválido", async () => {
    const verified = await verifyJwt("invalid.token.here");
    expect(verified).toBeNull();
  });
});
