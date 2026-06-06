import { describe, it, expect, vi, beforeEach } from 'vitest';

// Substitui o Prisma importado na lib pelo nosso mock.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('./__mocks__/prisma')>('./__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

import { prismaMock } from './__mocks__/prisma';
import { runRecurringRules } from './recurring';
import type { RecurringRule, Transaction } from '@/generated/prisma/client';

// Helper para montar uma RecurringRule completa com defaults sensatos.
function buildRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    title: 'Salário',
    amount: 5000,
    type: 'INCOME',
    frequency: 'MONTHLY',
    dayOfMonth: 5,
    nextRunDate: new Date('2026-01-05T00:00:00.000Z'),
    lastRunDate: null,
    isActive: true,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// Helper para montar uma Transaction completa (inclui notes, tags, reconciled).
function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    title: 'Salário',
    amount: 5000,
    type: 'INCOME',
    date: new Date('2026-01-05T00:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: false,
    transferGroupId: null,
    recurrenceGroupId: null,
    creditCardInvoiceId: null,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2026-01-05T00:00:00.000Z'),
    updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    ...overrides,
  };
}

describe('lib/recurring.ts — runRecurringRules', () => {
  beforeEach(() => {
    // Faz o $transaction interativo executar o callback com o próprio mock,
    // de modo que tx.transaction.create / tx.recurringRule.update sejam
    // os mesmos mocks que inspecionamos abaixo.
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (cb: any) => cb(prismaMock)) as unknown as typeof prismaMock.$transaction
    );
    prismaMock.transaction.create.mockResolvedValue(buildTransaction());
    prismaMock.recurringRule.update.mockResolvedValue(buildRule());
  });

  it('gera 1 transação e avança nextRunDate para uma regra MONTHLY vencida', async () => {
    // now = 5 de fevereiro; a regra vence em 5 de janeiro -> 1 ocorrência
    // (5/jan). A próxima (5/fev) é > now? Não: 5/fev == now (<= now), então
    // também gera. Para garantir exatamente 1, usamos now em 20/jan.
    const now = new Date('2026-01-20T00:00:00.000Z');
    const rule = buildRule({ nextRunDate: new Date('2026-01-05T00:00:00.000Z') });

    prismaMock.recurringRule.findMany.mockResolvedValue([rule]);

    const result = await runRecurringRules(now);

    expect(result.created).toBe(1);
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);

    // A transação criada usa a data do nextRunDate vencido (5/jan) e os campos da regra.
    const createArg = prismaMock.transaction.create.mock.calls[0][0] as {
      data: { title: string; amount: number; type: string; date: Date; categoryId: string; accountId: string };
    };
    expect(createArg.data.title).toBe('Salário');
    expect(createArg.data.amount).toBe(5000);
    expect(createArg.data.type).toBe('INCOME');
    expect(createArg.data.categoryId).toBe('cat-1');
    expect(createArg.data.accountId).toBe('acc-1');
    expect(createArg.data.date.toISOString()).toBe('2026-01-05T00:00:00.000Z');

    // A regra avança para o próximo mês (5/fev) e grava lastRunDate = 5/jan.
    expect(prismaMock.recurringRule.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.recurringRule.update.mock.calls[0][0] as {
      where: { id: string };
      data: { nextRunDate: Date; lastRunDate: Date };
    };
    expect(updateArg.where.id).toBe('rule-1');
    expect(updateArg.data.nextRunDate.toISOString()).toBe('2026-02-05T00:00:00.000Z');
    expect(updateArg.data.lastRunDate.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  it('gera várias transações quando a regra MONTHLY está muito atrasada', async () => {
    // Vencida em 5/jan, agora 20/mar -> ocorrências em jan, fev, mar = 3.
    const now = new Date('2026-03-20T00:00:00.000Z');
    const rule = buildRule({ nextRunDate: new Date('2026-01-05T00:00:00.000Z') });

    prismaMock.recurringRule.findMany.mockResolvedValue([rule]);

    const result = await runRecurringRules(now);

    expect(result.created).toBe(3);
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(3);

    // Avança para abril (próxima ocorrência após março).
    const updateArg = prismaMock.recurringRule.update.mock.calls[0][0] as {
      data: { nextRunDate: Date };
    };
    expect(updateArg.data.nextRunDate.toISOString()).toBe('2026-04-05T00:00:00.000Z');
  });

  it('não gera nada para uma regra com nextRunDate no futuro', async () => {
    // findMany já filtra por nextRunDate <= now; uma regra futura não vem na
    // query. Simulamos isso retornando lista vazia.
    prismaMock.recurringRule.findMany.mockResolvedValue([]);

    const result = await runRecurringRules(new Date('2026-01-01T00:00:00.000Z'));

    expect(result.created).toBe(0);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.recurringRule.update).not.toHaveBeenCalled();
  });

  it('avança +7 dias para regra WEEKLY vencida', async () => {
    const now = new Date('2026-01-08T00:00:00.000Z');
    const rule = buildRule({
      id: 'rule-weekly',
      frequency: 'WEEKLY',
      dayOfMonth: null,
      nextRunDate: new Date('2026-01-03T00:00:00.000Z'),
    });

    prismaMock.recurringRule.findMany.mockResolvedValue([rule]);

    const result = await runRecurringRules(now);

    // 3/jan vence; próxima seria 10/jan (> 8/jan) -> 1 ocorrência.
    expect(result.created).toBe(1);
    const updateArg = prismaMock.recurringRule.update.mock.calls[0][0] as {
      data: { nextRunDate: Date };
    };
    expect(updateArg.data.nextRunDate.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });

  it('é defensivo: uma regra que falha não derruba o lote', async () => {
    const ruleBad = buildRule({ id: 'rule-bad', nextRunDate: new Date('2026-01-05T00:00:00.000Z') });
    const ruleGood = buildRule({ id: 'rule-good', nextRunDate: new Date('2026-01-06T00:00:00.000Z') });

    prismaMock.recurringRule.findMany.mockResolvedValue([ruleBad, ruleGood]);

    // O $transaction falha apenas para a primeira regra processada.
    let call = 0;
    prismaMock.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (cb: any) => {
        call++;
        if (call === 1) throw new Error('db error');
        return cb(prismaMock);
      }) as unknown as typeof prismaMock.$transaction
    );

    const result = await runRecurringRules(new Date('2026-01-20T00:00:00.000Z'));

    // A regra ruim não conta; a boa gera sua transação normalmente.
    expect(result.created).toBe(1);
  });
});
