import { describe, it, expect, vi, beforeEach } from 'vitest';

// Substitui o Prisma importado na action pelo nosso mock.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

// Sessão SEMPRE autenticada (as funções de leitura chamam getSession).
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import type { Transaction } from '@/generated/prisma/client';
import { getCashFlow, getYearComparison, getCategoryBreakdown } from './reports';

const getSessionMock = vi.mocked(getSession);

// Helper para montar um Transaction completo com defaults sensatos
// (inclui notes/tags/reconciled e demais campos do schema).
function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    title: 'Mercado',
    amount: 100,
    type: 'EXPENSE',
    date: new Date('2024-01-15T12:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: false,
    transferGroupId: null,
    recurrenceGroupId: null,
    creditCardInvoiceId: null,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2024-01-15T12:00:00.000Z'),
    updatedAt: new Date('2024-01-15T12:00:00.000Z'),
    ...overrides,
  };
}

/** Alimenta o resultado de transaction.findMany com Transactions completos. */
function mockFindMany(rows: Transaction[]) {
  prismaMock.transaction.findMany.mockResolvedValue(rows as unknown as Transaction[]);
}

beforeEach(() => {
  getSessionMock.mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  // Sem cartão por padrão nos cenários existentes (gasto do cartão = 0).
  prismaMock.creditCardTransaction.findMany.mockResolvedValue([]);
});

describe('actions/reports.ts — getCashFlow', () => {
  it('agrupa receitas/despesas por mês e calcula net e cumulative corretos', async () => {
    mockFindMany([
      // Janeiro/2024: receita 1000, despesa 300 => net 700
      buildTransaction({ id: 't1', type: 'INCOME', amount: 1000, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTransaction({ id: 't2', type: 'EXPENSE', amount: 200, date: new Date('2024-01-20T12:00:00.000Z') }),
      buildTransaction({ id: 't3', type: 'EXPENSE', amount: 100, date: new Date('2024-01-25T12:00:00.000Z') }),
      // Fevereiro/2024: receita 500, despesa 800 => net -300
      buildTransaction({ id: 't4', type: 'INCOME', amount: 500, date: new Date('2024-02-05T12:00:00.000Z') }),
      buildTransaction({ id: 't5', type: 'EXPENSE', amount: 800, date: new Date('2024-02-15T12:00:00.000Z') }),
    ]);

    const result = await getCashFlow('2024-01-01', '2024-02-29');

    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      month: '01/2024',
      income: 1000,
      expense: 300,
      net: 700,
      cumulative: 700,
    });

    // Fevereiro: net -300, cumulative 700 + (-300) = 400.
    expect(result[1]).toEqual({
      month: '02/2024',
      income: 500,
      expense: 800,
      net: -300,
      cumulative: 400,
    });
  });

  it('cria buckets vazios para meses sem movimento (intervalo contíguo)', async () => {
    mockFindMany([
      buildTransaction({ id: 't1', type: 'INCOME', amount: 100, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTransaction({ id: 't2', type: 'EXPENSE', amount: 40, date: new Date('2024-03-10T12:00:00.000Z') }),
    ]);

    const result = await getCashFlow('2024-01-01', '2024-03-31');

    expect(result.map((r) => r.month)).toEqual(['01/2024', '02/2024', '03/2024']);

    // Mês do meio sem movimento.
    expect(result[1]).toEqual({
      month: '02/2024',
      income: 0,
      expense: 0,
      net: 0,
      cumulative: 100, // mantém o acumulado do mês anterior
    });

    // cumulative final = 100 - 40 = 60.
    expect(result[2].cumulative).toBe(60);
  });

  it('exclui transferências da consulta (passa isTransfer:false ao Prisma)', async () => {
    mockFindMany([]);

    await getCashFlow('2024-01-01', '2024-12-31');

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(arg?.where?.isTransfer).toBe(false);
  });

  it('rejeita data inicial inválida sem consultar o Prisma', async () => {
    await expect(getCashFlow('data-ruim', '2024-12-31')).rejects.toThrow('Data inicial inválida.');
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });

  it('rejeita quando a data inicial é posterior à final', async () => {
    await expect(getCashFlow('2024-12-31', '2024-01-01')).rejects.toThrow(
      'A data inicial deve ser anterior ou igual à data final.'
    );
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });

  it('rejeita intervalos maiores que 5 anos', async () => {
    await expect(getCashFlow('2010-01-01', '2020-01-02')).rejects.toThrow(
      'O intervalo não pode exceder 5 anos.'
    );
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });
});

describe('actions/reports.ts — getYearComparison', () => {
  it('retorna 12 meses comparando o ano informado com o anterior', async () => {
    mockFindMany([
      // Ano atual (2024)
      buildTransaction({ id: 'c1', type: 'INCOME', amount: 1000, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTransaction({ id: 'c2', type: 'EXPENSE', amount: 400, date: new Date('2024-01-20T12:00:00.000Z') }),
      buildTransaction({ id: 'c3', type: 'EXPENSE', amount: 250, date: new Date('2024-06-15T12:00:00.000Z') }),
      // Ano anterior (2023)
      buildTransaction({ id: 'p1', type: 'INCOME', amount: 800, date: new Date('2023-01-05T12:00:00.000Z') }),
      buildTransaction({ id: 'p2', type: 'EXPENSE', amount: 300, date: new Date('2023-12-31T12:00:00.000Z') }),
    ]);

    const result = await getYearComparison(2024);

    expect(result).toHaveLength(12);

    // Janeiro
    expect(result[0]).toEqual({
      month: '01/2024',
      currentYear: { income: 1000, expense: 400 },
      previousYear: { income: 800, expense: 0 },
    });

    // Junho (índice 5): só despesa no ano atual.
    expect(result[5].currentYear).toEqual({ income: 0, expense: 250 });
    expect(result[5].previousYear).toEqual({ income: 0, expense: 0 });

    // Dezembro (índice 11): só despesa no ano anterior.
    expect(result[11].currentYear).toEqual({ income: 0, expense: 0 });
    expect(result[11].previousYear).toEqual({ income: 0, expense: 300 });
  });

  it('consulta o intervalo dos dois anos com isTransfer:false', async () => {
    mockFindMany([]);

    await getYearComparison(2024);

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(arg?.where?.isTransfer).toBe(false);

    const dateFilter = arg?.where?.date as { gte: Date; lte: Date };
    // Início em 01/jan do ano anterior (UTC).
    expect(dateFilter.gte.getUTCFullYear()).toBe(2023);
    expect(dateFilter.gte.getUTCMonth()).toBe(0);
    // Fim em 31/dez do ano corrente (UTC).
    expect(dateFilter.lte.getUTCFullYear()).toBe(2024);
    expect(dateFilter.lte.getUTCMonth()).toBe(11);
  });

  it('rejeita ano fora do intervalo permitido sem consultar o Prisma', async () => {
    await expect(getYearComparison(1999)).rejects.toThrow('Ano deve ser um inteiro entre 2000 e 2100.');
    await expect(getYearComparison(2101)).rejects.toThrow('Ano deve ser um inteiro entre 2000 e 2100.');
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });
});

describe('actions/reports.ts — guarda de sessão', () => {
  it('getCashFlow rejeita sem sessão e não consulta o Prisma', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getCashFlow('2024-01-01', '2024-12-31')).rejects.toThrow('Não autorizado.');
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });

  it('getYearComparison rejeita sem sessão e não consulta o Prisma', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getYearComparison(2024)).rejects.toThrow('Não autorizado.');
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });

  it('getCategoryBreakdown rejeita sem sessão e não consulta o Prisma', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getCategoryBreakdown('2024-01-01', '2024-12-31')).rejects.toThrow('Não autorizado.');
    expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
  });
});
