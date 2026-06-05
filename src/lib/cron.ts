import { timingSafeEquals } from "./timing-safe";

/**
 * Valida que a requisição de cron traz `Authorization: Bearer ${CRON_SECRET}`.
 * Retorna false (nega) se `CRON_SECRET` não estiver configurado.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return timingSafeEquals(header, `Bearer ${secret}`);
}
