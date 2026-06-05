/**
 * Segredo de assinatura JWT (edge-safe).
 *
 * Este módulo NÃO importa next/headers nem qualquer API de servidor — pode ser
 * usado tanto no middleware (Edge Runtime) quanto em Server Actions/lib comum.
 */

const DEV_FALLBACK = "dev-only-insecure-secret-change-me";

const raw = process.env.JWT_SECRET;

if (!raw && process.env.NODE_ENV === "production") {
  throw new Error(
    "JWT_SECRET não definida: configure a variável de ambiente antes de iniciar em produção."
  );
}

if (!raw) {
  console.warn(
    "[jwt-secret] JWT_SECRET não definida. Usando segredo de desenvolvimento INSEGURO. Não use isso em produção."
  );
}

export const JWT_SECRET_KEY = new TextEncoder().encode(raw || DEV_FALLBACK);
