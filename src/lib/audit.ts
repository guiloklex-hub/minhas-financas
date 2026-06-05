import { prisma } from "@/lib/prisma";

export type AuditLogInput = {
  action: string;
  entity?: string;
  entityId?: string;
  ipAddress?: string;
};

/**
 * Registra uma entrada na trilha de auditoria (`AuditLog`).
 *
 * Best-effort: nunca lança. Falhas de persistência são apenas logadas para não
 * interromper o fluxo principal (login, reset de senha, 2FA, etc.).
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("Falha ao registrar AuditLog:", error);
  }
}
