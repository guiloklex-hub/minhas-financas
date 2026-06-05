import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";
import { addMonthsClamped } from "@/lib/date-utils";
import type { RecurringRule } from "@/generated/prisma/client";

/**
 * Limite de iterações por regra em um único processamento. Evita laço infinito
 * caso o avanço da data não progrida (ex.: data corrompida) e limita o volume
 * de transações geradas de uma vez quando uma regra está muito atrasada.
 */
const MAX_ITERATIONS_PER_RULE = 60;

/**
 * Avança a próxima data de execução de acordo com a frequência da regra.
 *
 * - WEEKLY: soma 7 dias em UTC (Date.UTC explícito evita bugs de horário de
 *   verão / fuso, que poderiam fazer o dia "andar" para trás).
 * - MONTHLY: soma 1 mês com clamp de fim de mês (31/jan -> 28/29 fev).
 * - YEARLY: soma 12 meses com o mesmo clamp.
 */
function advanceDate(date: Date, frequency: string): Date {
  if (frequency === "WEEKLY") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 7,
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
      )
    );
  }

  if (frequency === "MONTHLY") {
    return addMonthsClamped(date, 1);
  }

  if (frequency === "YEARLY") {
    return addMonthsClamped(date, 12);
  }

  // Frequência desconhecida: não conseguimos avançar com segurança.
  // Sinaliza para o chamador parar o laço desta regra.
  return date;
}

/**
 * Processa uma única regra de recorrência: enquanto `nextRunDate <= now`, cria
 * a Transaction correspondente (com a data = nextRunDate) e avança a próxima
 * execução. Persiste o avanço (nextRunDate/lastRunDate) ao final.
 *
 * Retorna quantas transações foram criadas para esta regra.
 *
 * Toda a operação roda dentro de uma transação Prisma para que, em caso de
 * falha, não fique estado parcial (transações criadas sem o avanço persistido,
 * o que geraria duplicatas no próximo processamento).
 */
async function processRule(rule: RecurringRule, now: Date): Promise<number> {
  let nextRunDate = rule.nextRunDate;
  let lastRunDate = rule.lastRunDate;
  let created = 0;

  const txToCreate: Array<{
    title: string;
    amount: number;
    type: string;
    date: Date;
    categoryId: string;
    accountId: string;
  }> = [];

  for (let i = 0; i < MAX_ITERATIONS_PER_RULE; i++) {
    if (nextRunDate.getTime() > now.getTime()) break;

    txToCreate.push({
      title: rule.title,
      amount: roundMoney(rule.amount),
      type: rule.type,
      date: nextRunDate,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
    });

    lastRunDate = nextRunDate;
    const advanced = advanceDate(nextRunDate, rule.frequency);

    // Proteção contra laço infinito: se a data não progrediu (frequência
    // inválida ou bug de cálculo), interrompe esta regra.
    if (advanced.getTime() <= nextRunDate.getTime()) break;

    nextRunDate = advanced;
  }

  if (txToCreate.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const data of txToCreate) {
      await tx.transaction.create({ data });
      created++;
    }

    await tx.recurringRule.update({
      where: { id: rule.id },
      data: { nextRunDate, lastRunDate },
    });
  });

  return created;
}

/**
 * Materializa as regras de recorrência vencidas em Transactions.
 *
 * Para cada regra ativa cujo `nextRunDate <= now`, gera as transações pendentes
 * (uma por ocorrência atrasada, com cap por regra) e avança a próxima execução.
 *
 * É defensivo por regra: uma regra com dados ruins (categoria/conta inexistente,
 * etc.) é registrada e ignorada, sem derrubar o lote inteiro. Pensado para ser
 * chamado por um cron diário.
 */
export async function runRecurringRules(
  now: Date = new Date()
): Promise<{ created: number }> {
  let created = 0;

  let rules: RecurringRule[];
  try {
    rules = await prisma.recurringRule.findMany({
      where: { isActive: true, nextRunDate: { lte: now } },
      orderBy: { nextRunDate: "asc" },
    });
  } catch (error) {
    console.error("Erro ao carregar regras de recorrência:", error);
    return { created: 0 };
  }

  for (const rule of rules) {
    try {
      created += await processRule(rule, now);
    } catch (error) {
      // Não derruba o lote inteiro por causa de uma regra ruim.
      console.error(`Erro ao processar regra de recorrência ${rule.id}:`, error);
    }
  }

  return { created };
}
