import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** Corpo esperado de uma inscrição Web Push (subset do PushSubscription do browser). */
type SubscribeBody = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/** Type guard para validar o corpo recebido sem usar `any`. */
function isSubscribeBody(value: unknown): value is SubscribeBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.endpoint !== "string" || body.endpoint.length === 0) return false;
  if (typeof body.keys !== "object" || body.keys === null) return false;
  const keys = body.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || keys.p256dh.length === 0) return false;
  if (typeof keys.auth !== "string" || keys.auth.length === 0) return false;
  return true;
}

/**
 * POST /api/push/subscribe
 * Faz upsert (por `endpoint`) de uma inscrição Web Push para o dispositivo atual.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Corpo inválido", { status: 400 });
  }

  if (!isSubscribeBody(raw)) {
    return new Response("Inscrição inválida", { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: raw.endpoint },
    update: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
    create: {
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    },
  });

  return Response.json({ ok: true });
}
