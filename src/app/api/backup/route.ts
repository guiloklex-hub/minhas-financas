import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * GET /api/backup
 *
 * Exporta um dump completo das tabelas de negócio em JSON e o devolve como
 * download. App single-user: protegido apenas por sessão (sem filtro por userId
 * no schema). Registra a exportação em AuditLog.
 *
 * Formato: { version, exportedAt, data: { accounts, categories, budgets,
 * transactions, investments, recurringRules, goals } }.
 */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const [
    accounts,
    categories,
    budgets,
    transactions,
    investments,
    recurringRules,
    goals,
  ] = await Promise.all([
    prisma.account.findMany(),
    prisma.category.findMany(),
    prisma.budget.findMany(),
    prisma.transaction.findMany(),
    prisma.investment.findMany(),
    prisma.recurringRule.findMany(),
    prisma.goal.findMany(),
  ]);

  const dump = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    data: {
      accounts,
      categories,
      budgets,
      transactions,
      investments,
      recurringRules,
      goals,
    },
  };

  await prisma.auditLog.create({
    data: { action: "BACKUP_EXPORT", entity: "Backup" },
  });

  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=backup.json",
    },
  });
}
