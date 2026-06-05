import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('./__mocks__/prisma')>('./__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

import { prismaMock } from './__mocks__/prisma';
import type { RecurringRule, Transaction } from '@/generated/prisma/client';
import { forecastCashFlow } from './forecast';

function buildRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    title: 'Salário',
    amount: 5000,
    type: 'INCOME',
    frequency: 'MONTHLY',
    dayOfMonth: 5,
    nextRunDate: new Date('2024-05-05T00:00:00.000Z'),
    lastRunDate: null,
    isActive: true,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    title: 'Gasto',
    amount: 100,
    type: 'EXPENSE',
    date: new Date('2024-03-10T12:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: false,
    transferGroupId: null,
    recurrenceGroupId: null,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2024-03-10T12:00:00.000Z'),
    updatedAt: new Date('2024-03-10T12:00:00.000Z'),
    ...overrides,
  };
}

function mockRules(rows: RecurringRule[]) {
  prismaMock.recurringRule.findMany.mockResolvedValue(rows as unknown as RecurringRule[]);
}

function mockHistory(rows: Transaction[]) {
  prismaMock.transaction.findMany.mockResolvedValue(rows as unknown as Transaction[]);
}

// Mês corrente fixo: abril/2024. Histórico = jan/fev/mar; projeção = mai/jun/jul.
const NOW = new Date(2024, 3, 15, 12, 0, 0);

describe('lib/forecast.ts — forecastCashFlow', () => {
  it('projeta regras mensais + média histórica e rotula os próximos meses', async () => {
    mockRules([
      buildRule({ id: 'r-inc', type: 'INCOME', amount: 5000, frequency: 'MONTHLY' }),
      buildRule({ id: 'r-exp', type: 'EXPENSE', amount: 1200, frequency: 'MONTHLY', title: 'Aluguel' }),
    ]);
    mockHistory([
      // Receita histórica: 3000 total / 3 meses => média 1000.
      buildTx({ id: 'h-inc', type: 'INCOME', amount: 3000, date: new Date('2024-02-10T12:00:00.000Z') }),
      // Despesa histórica: 900 total / 3 meses => média 300.
      buildTx({ id: 'h-exp', type: 'EXPENSE', amount: 900, date: new Date('2024-03-10T12:00:00.000Z') }),
    ]);

    const result = await forecastCashFlow(3, NOW);

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.month)).toEqual(['05/2024', '06/2024', '07/2024']);

    // Receita prevista = 5000 (regra) + 1000 (média) = 6000.
    // Despesa prevista = 1200 (regra) + 300 (média) = 1500.
    // Líquido = 4500. Constante mês a mês.
    for (const point of result) {
      expect(point.projectedIncome).toBe(6000);
      expect(point.projectedExpense).toBe(1500);
      expect(point.projectedNet).toBe(4500);
    }
  });

  it('anualiza regras WEEKLY (x52/12) e YEARLY (/12)', async () => {
    mockRules([
      // WEEKLY 100 => 100 * 52/12 ≈ 433.33 de despesa/mês.
      buildRule({ id: 'r-week', type: 'EXPENSE', amount: 100, frequency: 'WEEKLY', title: 'Feira' }),
      // YEARLY 1200 => 100 de receita/mês.
      buildRule({ id: 'r-year', type: 'INCOME', amount: 1200, frequency: 'YEARLY', title: 'Bônus' }),
    ]);
    mockHistory([]); // sem histórico => médias 0.

    const result = await forecastCashFlow(1, NOW);

    expect(result).toHaveLength(1);
    expect(result[0].projectedExpense).toBeCloseTo(433.33, 2);
    expect(result[0].projectedIncome).toBeCloseTo(100, 2);
    expect(result[0].projectedNet).toBeCloseTo(-333.33, 2);
  });

  it('ignora regras inativas filtrando isActive:true na consulta', async () => {
    mockRules([]);
    mockHistory([]);

    await forecastCashFlow(3, NOW);

    expect(prismaMock.recurringRule.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.recurringRule.findMany.mock.calls[0][0];
    expect(arg?.where?.isActive).toBe(true);
  });

  it('consulta o histórico excluindo transferências (isTransfer:false)', async () => {
    mockRules([]);
    mockHistory([]);

    await forecastCashFlow(3, NOW);

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(arg?.where?.isTransfer).toBe(false);
  });

  it('retorna lista vazia quando monthsAhead é 0', async () => {
    mockRules([buildRule()]);
    mockHistory([]);

    const result = await forecastCashFlow(0, NOW);

    expect(result).toEqual([]);
  });

  it('projeta apenas com média histórica quando não há regras ativas', async () => {
    mockRules([]);
    mockHistory([
      buildTx({ id: 'h-inc', type: 'INCOME', amount: 6000, date: new Date('2024-02-10T12:00:00.000Z') }),
      buildTx({ id: 'h-exp', type: 'EXPENSE', amount: 3000, date: new Date('2024-03-10T12:00:00.000Z') }),
    ]);

    const result = await forecastCashFlow(2, NOW);

    expect(result).toHaveLength(2);
    // Média: receita 6000/3=2000; despesa 3000/3=1000; líquido 1000.
    for (const point of result) {
      expect(point.projectedIncome).toBe(2000);
      expect(point.projectedExpense).toBe(1000);
      expect(point.projectedNet).toBe(1000);
    }
  });
});
