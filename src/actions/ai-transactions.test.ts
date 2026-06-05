import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

// Mocka o parser do Gemini para não tocar a API externa.
vi.mock('@/lib/gemini', () => ({ parseTransactionText: vi.fn() }));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import { parseTransactionText } from '@/lib/gemini';
import type { ParsedTransaction } from '@/lib/gemini';
import type { Account, Category, Transaction } from '@prisma/client';
import { createTransactionFromText } from './ai-transactions';

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Alimentação',
    color: '#10b981',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Carteira',
    type: 'CASH',
    initialBalance: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildParsed(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amount: 25.5,
    description: 'Almoço no restaurante',
    categoryId: 'cat-1',
    type: 'EXPENSE',
    ...overrides,
  };
}

describe('actions/ai-transactions.ts', () => {
  beforeEach(() => {
    // mockReset(prismaMock) (no __mocks__) só limpa o Prisma; o mock do Gemini
    // é manual, então limpamos seu histórico/implementação aqui para não vazar entre testes.
    vi.mocked(parseTransactionText).mockReset();
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  });

  it('cria a transação SEM chamar account.update (evita dupla contagem de saldo)', async () => {
    prismaMock.category.findMany.mockResolvedValue([buildCategory()]);
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    vi.mocked(parseTransactionText).mockResolvedValue(buildParsed());
    prismaMock.transaction.create.mockResolvedValue({} as Transaction);

    const result = await createTransactionFromText('almocei pagando 25,50', 'acc-1');

    expect(result.success).toBe(true);
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);
    // O saldo é derivado das transações — NUNCA mutar account aqui.
    expect(prismaMock.account.update).not.toHaveBeenCalled();

    const data = (prismaMock.transaction.create.mock.calls[0][0] as { data: { title: string; amount: number; type: string; categoryId: string; accountId: string } }).data;
    expect(data.title).toBe('Almoço no restaurante');
    expect(data.amount).toBe(25.5);
    expect(data.type).toBe('EXPENSE');
    expect(data.categoryId).toBe('cat-1');
    expect(data.accountId).toBe('acc-1');
  });

  it('cria nova categoria quando a IA retorna newCategory e categoryId vazio', async () => {
    prismaMock.category.findMany.mockResolvedValue([buildCategory()]);
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    vi.mocked(parseTransactionText).mockResolvedValue(
      buildParsed({ categoryId: '', newCategory: { name: 'Pets', color: '#f59e0b' } }),
    );
    prismaMock.category.create.mockResolvedValue(buildCategory({ id: 'cat-new', name: 'Pets' }));
    prismaMock.transaction.create.mockResolvedValue({} as Transaction);

    const result = await createTransactionFromText('ração do cachorro 80', 'acc-1');

    expect(result.success).toBe(true);
    expect(prismaMock.category.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { name: 'Pets', color: '#f59e0b' },
    });
    expect(prismaMock.account.update).not.toHaveBeenCalled();

    const data = (prismaMock.transaction.create.mock.calls[0][0] as { data: { categoryId: string } }).data;
    expect(data.categoryId).toBe('cat-new');
  });

  it('retorna erro quando não há categorias cadastradas', async () => {
    prismaMock.category.findMany.mockResolvedValue([]);

    const result = await createTransactionFromText('qualquer coisa', 'acc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Nenhuma categoria cadastrada no banco.');
    expect(parseTransactionText).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('retorna erro quando a conta selecionada não existe', async () => {
    prismaMock.category.findMany.mockResolvedValue([buildCategory()]);
    vi.mocked(parseTransactionText).mockResolvedValue(buildParsed());
    prismaMock.account.findUnique.mockResolvedValue(null);

    const result = await createTransactionFromText('almocei 25', 'acc-inexistente');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Conta selecionada não encontrada.');
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it('retorna erro quando a IA não estrutura dados suficientes', async () => {
    prismaMock.category.findMany.mockResolvedValue([buildCategory()]);
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    // amount ausente (0) e sem categoria/newCategory válidos.
    vi.mocked(parseTransactionText).mockResolvedValue(
      buildParsed({ amount: 0, categoryId: '' }),
    );

    const result = await createTransactionFromText('texto confuso', 'acc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'A inteligência artificial não conseguiu estruturar todos os dados corretamente.',
    );
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it('propaga a mensagem de erro quando o parser do Gemini lança', async () => {
    prismaMock.category.findMany.mockResolvedValue([buildCategory()]);
    vi.mocked(parseTransactionText).mockRejectedValue(new Error('Falha no Gemini'));

    const result = await createTransactionFromText('almocei 25', 'acc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Falha no Gemini');
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });

  it('retorna "Não autorizado..." quando não há sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await createTransactionFromText('almocei 25', 'acc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Não autorizado. Faça login novamente.');
    expect(parseTransactionText).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
  });
});
