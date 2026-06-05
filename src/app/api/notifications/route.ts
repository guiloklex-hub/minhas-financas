import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/notifications
 * Retorna as 30 notificações mais recentes + a contagem de não-lidas.
 * App single-user: protegido apenas por sessão (sem filtro por userId no schema).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { read: false } }),
  ]);

  return Response.json({ notifications, unreadCount });
}

/**
 * PATCH /api/notifications
 * Marca todas as notificações não-lidas como lidas.
 */
export async function PATCH() {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { read: false },
    data: { read: true },
  });

  return Response.json({ updated: result.count });
}
