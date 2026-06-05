import { prisma } from "./prisma";
import { sendPushToAll } from "./push";

export type NotificationType = "INFO" | "WARNING" | "SUCCESS" | "DANGER";

export type CreateNotificationInput = {
  title: string;
  body: string;
  url?: string;
  type?: NotificationType;
};

/**
 * Orquestrador único de notificações ao usuário: grava a notificação in-app
 * (sino) e dispara o Web Push best-effort. Nunca lança — falhas só são logadas,
 * para não travar a operação que originou a notificação.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        title: input.title,
        body: input.body,
        url: input.url ?? null,
        type: input.type ?? "INFO",
      },
    });
    await sendPushToAll({ title: input.title, body: input.body, url: input.url }).catch(
      () => undefined
    );
  } catch (e) {
    console.error("Falha ao criar notificação:", e);
  }
}
