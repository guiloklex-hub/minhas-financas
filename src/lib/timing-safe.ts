import { timingSafeEqual } from "crypto";

/**
 * Comparação de strings em tempo constante (anti timing-attack).
 * Use para comparar segredos: Bearer de cron, tokens, etc. Nunca `===`.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
