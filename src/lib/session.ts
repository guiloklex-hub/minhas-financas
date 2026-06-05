import { cookies } from "next/headers";
import { verifyJwt } from "./auth";
import { prisma } from "./prisma";

export type SessionPayload = { userId: string; email: string };

/**
 * Lê o cookie "session", valida o JWT e retorna o payload da sessão.
 * Retorna null se não houver cookie ou se o token for inválido/expirado.
 *
 * Usa next/headers — NÃO importar este módulo no middleware (Edge Runtime).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;

  const payload = await verifyJwt(sessionCookie);
  if (!payload || typeof payload.userId !== "string") return null;

  return {
    userId: payload.userId,
    email: typeof payload.email === "string" ? payload.email : "",
  };
}

/**
 * Retorna o usuário atual carregado do banco a partir da sessão.
 * Retorna null se não houver sessão válida ou se o usuário não existir.
 */
export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
} | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  return user;
}
