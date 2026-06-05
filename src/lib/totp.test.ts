// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateSync } from "otplib";
import { generateSecret2FA, otpauthURL, verifyToken } from "./totp";

describe("totp", () => {
  it("generateSecret2FA gera um segredo Base32 não-vazio", () => {
    const secret = generateSecret2FA();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
    // Base32 (RFC 4648, alfabeto A-Z 2-7), possivelmente com padding "=".
    expect(secret).toMatch(/^[A-Z2-7=]+$/);
  });

  it("otpauthURL monta uma URI otpauth:// válida com issuer e label", () => {
    const secret = generateSecret2FA();
    const uri = otpauthURL(secret, "user@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=");
    expect(decodeURIComponent(uri)).toContain("user@example.com");
  });

  it("verifyToken aceita um token gerado a partir do mesmo segredo", () => {
    const secret = generateSecret2FA();
    const token = generateSync({ secret });
    expect(verifyToken(token, secret)).toBe(true);
  });

  it("verifyToken normaliza tokens com espaços/separadores", () => {
    const secret = generateSecret2FA();
    const token = generateSync({ secret }); // 6 dígitos
    const spaced = `${token.slice(0, 3)} ${token.slice(3)}`;
    expect(verifyToken(spaced, secret)).toBe(true);
  });

  it("verifyToken rejeita um token inválido", () => {
    const secret = generateSecret2FA();
    const valid = generateSync({ secret });
    // Garante um token diferente do válido, ainda com 6 dígitos.
    const wrong = valid === "000000" ? "111111" : "000000";
    expect(verifyToken(wrong, secret)).toBe(false);
  });

  it("verifyToken rejeita entradas malformadas e vazias", () => {
    const secret = generateSecret2FA();
    expect(verifyToken("", secret)).toBe(false);
    expect(verifyToken("123", secret)).toBe(false); // poucos dígitos
    expect(verifyToken("abcdef", secret)).toBe(false); // não numérico
    expect(verifyToken("1234567", secret)).toBe(false); // dígitos demais
    expect(verifyToken("123456", "")).toBe(false); // segredo vazio
  });

  it("verifyToken rejeita um token válido contra outro segredo", () => {
    const secretA = generateSecret2FA();
    const secretB = generateSecret2FA();
    const tokenA = generateSync({ secret: secretA });
    expect(verifyToken(tokenA, secretB)).toBe(false);
  });
});
