import { isAuthorizedCron } from "@/lib/cron";
import { runRecurringRules } from "@/lib/recurring";
import { refreshExchangeRatesFromApi } from "@/lib/exchange-rate-fetch";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Cria a notificação apenas se ainda não existir uma com o mesmo título criada
 * hoje (a partir de `startOfToday`). Evita spam quando o cron roda mais de uma
 * vez por dia. Retorna 1 se criou, 0 se já existia.
 */
async function createIfNotToday(
  startOfToday: Date,
  input: { title: string; body: string; url?: string; type: "WARNING" | "DANGER" }
): Promise<number> {
  const existing = await prisma.notification.findFirst({
    where: { title: input.title, createdAt: { gte: startOfToday } },
    select: { id: true },
  });
  if (existing) return 0;

  await createNotification(input);
  return 1;
}

/**
 * GET /api/cron/daily
 *
 * Job diário (autenticado por Bearer CRON_SECRET):
 *  a) materializa regras de recorrência vencidas;
 *  b) gera alertas de orçamento do mês corrente (>= 80% WARNING, >= 100% DANGER);
 *  c) lembra de investimentos com vencimento nos próximos 7 dias.
 *
 * Datas em horário local (mesma convenção das telas de orçamento). Dedupe diária
 * por título evita reenvio quando o cron roda várias vezes no mesmo dia.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return new Response("Não autorizado", { status: 401 });
  }

  const now = new Date();

  // a) Recorrências vencidas viram transações.
  const { created: recurringCreated } = await runRecurringRules(now);

  // a.2) Atualiza cotações de câmbio (best-effort; no-op sem EXCHANGE_RATE_API_URL).
  const ratesResult = await refreshExchangeRatesFromApi(now);

  // Início do dia de hoje, base da dedupe diária por título.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const currency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // b) Alertas de orçamento do mês corrente.
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  const monthStart = new Date(currentYear, currentMonth - 1, 1);
  const nextMonthStart = new Date(currentYear, currentMonth, 1);

  const budgets = await prisma.budget.findMany({
    where: { month: currentMonth, year: currentYear },
    include: { category: { select: { name: true } } },
  });

  let budgetAlerts = 0;
  for (const budget of budgets) {
    if (budget.amountLimit <= 0) continue;

    const spentAgg = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        type: "EXPENSE",
        isTransfer: false,
        categoryId: budget.categoryId,
        date: { gte: monthStart, lt: nextMonthStart },
      },
    });

    const spent = spentAgg._sum.amount ?? 0;
    const usage = (spent / budget.amountLimit) * 100;
    if (usage < 80) continue;

    const categoryName = budget.category.name;
    const monthLabel = `${String(currentMonth).padStart(2, "0")}/${currentYear}`;

    if (usage >= 100) {
      budgetAlerts += await createIfNotToday(startOfToday, {
        title: `Orçamento estourado: ${categoryName}`,
        body: `Você gastou ${currency(spent)} de ${currency(budget.amountLimit)} (${usage.toFixed(0)}%) em ${categoryName} neste mês (${monthLabel}).`,
        url: "/orcamentos",
        type: "DANGER",
      });
    } else {
      budgetAlerts += await createIfNotToday(startOfToday, {
        title: `Orçamento quase no limite: ${categoryName}`,
        body: `Você já usou ${usage.toFixed(0)}% do orçamento de ${categoryName} (${currency(spent)} de ${currency(budget.amountLimit)}) neste mês (${monthLabel}).`,
        url: "/orcamentos",
        type: "WARNING",
      });
    }
  }

  // c) Lembretes de vencimento de investimentos (próximos 7 dias).
  const inSevenDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);

  const maturing = await prisma.investment.findMany({
    where: { maturityDate: { gte: startOfToday, lte: inSevenDays } },
    orderBy: { maturityDate: "asc" },
  });

  let maturityAlerts = 0;
  for (const investment of maturing) {
    if (!investment.maturityDate) continue;
    const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
      investment.maturityDate
    );
    maturityAlerts += await createIfNotToday(startOfToday, {
      title: `Investimento vencendo: ${investment.name}`,
      body: `O investimento "${investment.name}" vence em ${dateLabel}. Valor atual: ${currency(investment.currentAmount)}.`,
      url: "/investimentos",
      type: "WARNING",
    });
  }

  return Response.json({ recurringCreated, exchangeRatesUpdated: ratesResult.updated, budgetAlerts, maturityAlerts });
}
