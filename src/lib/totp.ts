import { generateSecret, generateURI, verifySync } from "otplib";

/**
 * Wrapper fino sobre o otplib (v13, API funcional) para 2FA via TOTP.
 *
 * - Os segredos são Base32 (compatíveis com Google Authenticator/Authy).
 * - A verificação usa `verifySync` (o plugin crypto padrão — Noble — é síncrono)
 *   e comparação em tempo constante interna do otplib.
 */

const ISSUER = "Minhas Finanças";

/** Janela de tolerância (segundos) para compensar relógio do dispositivo. */
const EPOCH_TOLERANCE = 30;

/**
 * Gera um novo segredo TOTP em Base32. NÃO ativa o 2FA — apenas cria o segredo.
 */
export function generateSecret2FA(): string {
  return generateSecret();
}

/**
 * Monta a URI `otpauth://` usada para gerar o QR Code de cadastro no app
 * autenticador. `label` normalmente é o e-mail do usuário.
 */
export function otpauthURL(secret: string, label: string): string {
  return generateURI({ issuer: ISSUER, label, secret });
}

/**
 * Valida um token TOTP contra o segredo. Normaliza o token para 6 dígitos
 * (remove espaços/separadores) e exige exatamente 6 dígitos numéricos.
 * Retorna boolean — nunca lança.
 */
export function verifyToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;

  const normalized = token.replace(/\D/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  try {
    const result = verifySync({
      token: normalized,
      secret,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}
