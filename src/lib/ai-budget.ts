import { prisma } from "./prisma";

/**
 * Guardrails de custo de IA. O teto mensal vem de AI_MONTHLY_BUDGET_USD (USD).
 * Sem a variável (ou <= 0), não há limite.
 */
export function getAiMonthlyBudgetUsd(): number | null {
  const raw = process.env.AI_MONTHLY_BUDGET_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Soma o custo (USD) de chamadas de IA no mês corrente (via AiUsageLog). */
export async function getAiSpendThisMonthUsd(): Promise<number> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const agg = await prisma.aiUsageLog.aggregate({
    _sum: { costUsd: true },
    where: { createdAt: { gte: start } },
  });
  return agg._sum.costUsd ?? 0;
}

/** True se há teto configurado e o gasto do mês já o atingiu/ultrapassou. */
export async function isAiBudgetExceeded(): Promise<boolean> {
  const cap = getAiMonthlyBudgetUsd();
  if (cap === null) return false;
  const spent = await getAiSpendThisMonthUsd();
  return spent >= cap;
}
