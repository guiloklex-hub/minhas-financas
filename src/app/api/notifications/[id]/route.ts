import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/notifications/[id]
 * Marca uma notificação específica como lida.
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const { id } = await params;

  const result = await prisma.notification.updateMany({
    where: { id },
    data: { read: true },
  });

  if (result.count === 0) {
    return new Response("Notificação não encontrada", { status: 404 });
  }

  return Response.json({ ok: true });
}

/**
 * DELETE /api/notifications/[id]
 * Remove uma notificação específica.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const { id } = await params;

  const result = await prisma.notification.deleteMany({
    where: { id },
  });

  if (result.count === 0) {
    return new Response("Notificação não encontrada", { status: 404 });
  }

  return Response.json({ ok: true });
}
