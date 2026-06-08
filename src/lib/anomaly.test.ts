import { describe, it, expect, vi } from 'vitest';

// Substitui o Prisma importado na lib pelo nosso mock profundo.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('./__mocks__/prisma')>('./__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

import { prismaMock } from './__mocks__/prisma';
import type { Category, Transaction } from '@/generated/prisma/client';
import { detectAnomalies } from './anomaly';

// Transaction com a relation `category` carregada (a lib usa include: { category: true }).
type TxWithCategory = Transaction & { category: Category };

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Alimentação',
    color: '#10b981',
    icon: null,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTx(overrides: Partial<TxWithCategory> = {}): TxWithCategory {
  const category = overrides.category ?? buildCategory({ id: overrides.categoryId ?? 'cat-1' });
  return {
    id: 'tx-1',
    title: 'Gasto',
    amount: 100,
    type: 'EXPENSE',
    date: new Date('2024-04-10T12:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: false,
    transferGroupId: null,
    recurrenceGroupId: null,
    creditCardInvoiceId: null,
    categoryId: category.id,
    accountId: 'acc-1',
    createdAt: new Date('2024-04-10T12:00:00.000Z'),
    updatedAt: new Date('2024-04-10T12:00:00.000Z'),
    category,
    ...overrides,
  };
}

function mockFindMany(rows: TxWithCategory[]) {
  prismaMock.transaction.findMany.mockResolvedValue(rows as unknown as Transaction[]);
}

// Mês corrente fixo: abril/2024. Janela histórica = jan, fev, mar/2024.
const NOW = new Date(2024, 3, 15, 12, 0, 0);

describe('lib/anomaly.ts — detectAnomalies', () => {
  it('sinaliza categoria quando supera média*1.4 E (atual - média) >= 50', async () => {
    const cat = buildCategory({ id: 'cat-mercado', name: 'Mercado', color: '#f43f5e' });
    mockFindMany([
      // Histórico: 100 por mês em jan, fev, mar => média 100.
      buildTx({ id: 'h1', amount: 100, category: cat, categoryId: cat.id, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTx({ id: 'h2', amount: 100, category: cat, categoryId: cat.id, date: new Date('2024-02-10T12:00:00.000Z') }),
      buildTx({ id: 'h3', amount: 100, category: cat, categoryId: cat.id, date: new Date('2024-03-10T12:00:00.000Z') }),
      // Mês corrente: 200 (> 100*1.4 = 140; e 200-100=100 >= 50) => anomalia.
      buildTx({ id: 'c1', amount: 200, category: cat, categoryId: cat.id, date: new Date('2024-04-05T12:00:00.000Z') }),
    ]);

    const result = await detectAnomalies(NOW);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      categoryId: 'cat-mercado',
      name: 'Mercado',
      color: '#f43f5e',
      currentAmount: 200,
      average: 100,
      deltaPct: 100,
    });
  });

  it('NÃO sinaliza quando passa do fator mas a diferença absoluta é < 50', async () => {
    const cat = buildCategory({ id: 'cat-cafe', name: 'Café' });
    mockFindMany([
      // Média 10 (30 / 3 meses).
      buildTx({ id: 'h1', amount: 30, category: cat, categoryId: cat.id, date: new Date('2024-01-10T12:00:00.000Z') }),
      // Mês corrente 20: 20 > 10*1.4=14 (passa no fator), mas 20-10=10 < 50 => sem flag.
      buildTx({ id: 'c1', amount: 20, category: cat, categoryId: cat.id, date: new Date('2024-04-05T12:00:00.000Z') }),
    ]);

    const result = await detectAnomalies(NOW);

    expect(result).toHaveLength(0);
  });

  it('NÃO sinaliza quando a diferença é alta mas não atinge o fator de 1.4', async () => {
    const cat = buildCategory({ id: 'cat-aluguel', name: 'Aluguel' });
    mockFindMany([
      // Média 1000 (3000 / 3).
      buildTx({ id: 'h1', amount: 1000, category: cat, categoryId: cat.id, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTx({ id: 'h2', amount: 1000, category: cat, categoryId: cat.id, date: new Date('2024-02-10T12:00:00.000Z') }),
      buildTx({ id: 'h3', amount: 1000, category: cat, categoryId: cat.id, date: new Date('2024-03-10T12:00:00.000Z') }),
      // Mês corrente 1300: 1300-1000=300 >= 50 (passa no absoluto),
      // mas 1300 < 1000*1.4=1400 (falha no fator) => sem flag.
      buildTx({ id: 'c1', amount: 1300, category: cat, categoryId: cat.id, date: new Date('2024-04-05T12:00:00.000Z') }),
    ]);

    const result = await detectAnomalies(NOW);

    expect(result).toHaveLength(0);
  });

  it('ignora categoria sem histórico (média 0) mesmo com gasto alto no mês', async () => {
    const cat = buildCategory({ id: 'cat-nova', name: 'Viagem' });
    mockFindMany([
      // Só há gasto no mês corrente; sem histórico a média é 0 => não flaga.
      buildTx({ id: 'c1', amount: 5000, category: cat, categoryId: cat.id, date: new Date('2024-04-05T12:00:00.000Z') }),
    ]);

    const result = await detectAnomalies(NOW);

    expect(result).toHaveLength(0);
  });

  it('consulta o Prisma com EXPENSE e isTransfer:false', async () => {
    mockFindMany([]);

    await detectAnomalies(NOW);

    expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(arg?.where?.type).toBe('EXPENSE');
    expect(arg?.where?.isTransfer).toBe(false);
  });

  // Regressão de fuso: a janela tem que ser meia-noite UTC do dia 1 (não
  // 03:00Z), senão a transação do dia 1º cai fora do mês em fusos negativos
  // (BRT). Com o range em horário local este teste falharia fora de UTC.
  it('monta a janela de datas em UTC (meia-noite do dia 1, sem deslocar por fuso)', async () => {
    mockFindMany([]);

    await detectAnomalies(NOW); // NOW = abril/2024; janela = jan..abril/2024

    const arg = prismaMock.transaction.findMany.mock.calls[0][0];
    const dateFilter = arg?.where?.date as { gte?: Date; lte?: Date } | undefined;
    expect(dateFilter?.gte?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(dateFilter?.lte?.toISOString()).toBe('2024-04-30T23:59:59.999Z');
  });

  it('ordena as anomalias por deltaPct decrescente', async () => {
    const catA = buildCategory({ id: 'cat-a', name: 'A' });
    const catB = buildCategory({ id: 'cat-b', name: 'B' });
    mockFindMany([
      // A: média 100, atual 200 => +100%.
      buildTx({ id: 'a-h1', amount: 100, category: catA, categoryId: catA.id, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTx({ id: 'a-h2', amount: 100, category: catA, categoryId: catA.id, date: new Date('2024-02-10T12:00:00.000Z') }),
      buildTx({ id: 'a-h3', amount: 100, category: catA, categoryId: catA.id, date: new Date('2024-03-10T12:00:00.000Z') }),
      buildTx({ id: 'a-c1', amount: 200, category: catA, categoryId: catA.id, date: new Date('2024-04-05T12:00:00.000Z') }),
      // B: média 100, atual 400 => +300%.
      buildTx({ id: 'b-h1', amount: 100, category: catB, categoryId: catB.id, date: new Date('2024-01-10T12:00:00.000Z') }),
      buildTx({ id: 'b-h2', amount: 100, category: catB, categoryId: catB.id, date: new Date('2024-02-10T12:00:00.000Z') }),
      buildTx({ id: 'b-h3', amount: 100, category: catB, categoryId: catB.id, date: new Date('2024-03-10T12:00:00.000Z') }),
      buildTx({ id: 'b-c1', amount: 400, category: catB, categoryId: catB.id, date: new Date('2024-04-05T12:00:00.000Z') }),
    ]);

    const result = await detectAnomalies(NOW);

    expect(result.map((a) => a.categoryId)).toEqual(['cat-b', 'cat-a']);
    expect(result[0].deltaPct).toBe(300);
    expect(result[1].deltaPct).toBe(100);
  });
});
