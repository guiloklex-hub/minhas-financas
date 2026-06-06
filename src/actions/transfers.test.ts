import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import type { Category, Transaction } from '@/generated/prisma/client';
import { createTransfer, updateTransfer } from './transfers';

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-transfer',
    name: 'Transferência',
    color: '#8b5cf6',
    icon: null,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    title: 'Transferência (Saída)',
    amount: 50,
    type: 'EXPENSE',
    date: new Date('2024-01-15T00:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: true,
    transferGroupId: 'grp-1',
    recurrenceGroupId: null,
    creditCardInvoiceId: null,
    categoryId: 'cat-transfer',
    accountId: 'acc-from',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTransferFormData(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    fromAccountId: 'acc-from',
    toAccountId: 'acc-to',
    amount: '50',
    date: '2024-01-15',
    title: 'Movimentação',
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) fd.append(k, v);
  return fd;
}

describe('actions/transfers.ts', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  });

  it('cria as duas pernas (saída + entrada) usando categoria existente', async () => {
    prismaMock.category.findFirst.mockResolvedValue(buildCategory());
    prismaMock.$transaction.mockResolvedValue([] as unknown as Transaction[]);
    prismaMock.transaction.create.mockResolvedValue({} as Transaction);

    const result = await createTransfer(buildTransferFormData());

    expect(result.success).toBe(true);
    // Não recria a categoria de transferência (já existe).
    expect(prismaMock.category.create).not.toHaveBeenCalled();
    // Duas chamadas de create (saída e entrada) compõem o array do $transaction.
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // O $transaction recebeu um array com exatamente 2 itens (passa pela forma
    // de overload de callback no tipo, então convertemos via `unknown` primeiro).
    const txArg = prismaMock.$transaction.mock.calls[0][0] as unknown;
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg as unknown[]).toHaveLength(2);

    const calls = prismaMock.transaction.create.mock.calls;
    const first = (calls[0][0] as { data: { type: string; accountId: string; transferGroupId: string; isTransfer: boolean } }).data;
    const second = (calls[1][0] as { data: { type: string; accountId: string; transferGroupId: string; isTransfer: boolean } }).data;

    // Perna de saída.
    expect(first.type).toBe('EXPENSE');
    expect(first.accountId).toBe('acc-from');
    expect(first.isTransfer).toBe(true);
    // Perna de entrada.
    expect(second.type).toBe('INCOME');
    expect(second.accountId).toBe('acc-to');
    expect(second.isTransfer).toBe(true);
    // Ambas no mesmo grupo de transferência.
    expect(first.transferGroupId).toBeTruthy();
    expect(first.transferGroupId).toBe(second.transferGroupId);
  });

  it('cria a categoria "Transferência" quando ela ainda não existe', async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);
    prismaMock.category.create.mockResolvedValue(buildCategory());
    prismaMock.$transaction.mockResolvedValue([] as unknown as Transaction[]);
    prismaMock.transaction.create.mockResolvedValue({} as Transaction);

    const result = await createTransfer(buildTransferFormData());

    expect(result.success).toBe(true);
    expect(prismaMock.category.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: { name: 'Transferência', color: '#8b5cf6' },
    });
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('rejeita quando origem e destino são a mesma conta', async () => {
    const result = await createTransfer(
      buildTransferFormData({ fromAccountId: 'acc-x', toAccountId: 'acc-x' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('A conta de origem e destino não podem ser as mesmas.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('rejeita valor <= 0 (min 0.01)', async () => {
    const result = await createTransfer(buildTransferFormData({ amount: '0' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Valor deve ser maior ou igual a 0.01.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it('rejeita quando a conta de origem está ausente', async () => {
    const fd = buildTransferFormData();
    fd.delete('fromAccountId');

    const result = await createTransfer(fd);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Conta de origem é obrigatório.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('retorna "Não autorizado..." quando não há sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await createTransfer(buildTransferFormData());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Não autorizado. Faça login novamente.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  describe('updateTransfer', () => {
    function buildUpdateFormData(overrides: Record<string, string> = {}): FormData {
      const base: Record<string, string> = {
        amount: '75',
        date: '2024-02-20',
        title: 'Aluguel',
        ...overrides,
      };
      const fd = new FormData();
      for (const [k, v] of Object.entries(base)) fd.append(k, v);
      return fd;
    }

    it('atualiza ambas as pernas mantendo as contas', async () => {
      const expenseLeg = buildTransaction({ id: 'tx-exp', type: 'EXPENSE', accountId: 'acc-from' });
      const incomeLeg = buildTransaction({ id: 'tx-inc', type: 'INCOME', accountId: 'acc-to' });
      prismaMock.transaction.findMany.mockResolvedValue([expenseLeg, incomeLeg]);
      prismaMock.$transaction.mockResolvedValue([] as unknown as Transaction[]);
      prismaMock.transaction.update.mockResolvedValue({} as Transaction);

      const result = await updateTransfer('grp-1', buildUpdateFormData());

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: { transferGroupId: 'grp-1' },
      });
      expect(prismaMock.transaction.update).toHaveBeenCalledTimes(2);

      const calls = prismaMock.transaction.update.mock.calls;
      const first = calls[0][0] as { where: { id: string }; data: { title: string; amount: number; date: Date } };
      const second = calls[1][0] as { where: { id: string }; data: { title: string; amount: number; date: Date } };

      // Perna de saída (EXPENSE).
      expect(first.where.id).toBe('tx-exp');
      expect(first.data.title).toBe('Aluguel (Saída)');
      expect(first.data.amount).toBe(75);
      // Perna de entrada (INCOME).
      expect(second.where.id).toBe('tx-inc');
      expect(second.data.title).toBe('Aluguel (Entrada)');
      expect(second.data.amount).toBe(75);

      // Não toca em accountId em nenhuma das pernas (mantém as contas).
      expect(first.data).not.toHaveProperty('accountId');
      expect(second.data).not.toHaveProperty('accountId');
    });

    it('usa o título padrão "Transferência" quando ausente', async () => {
      const expenseLeg = buildTransaction({ id: 'tx-exp', type: 'EXPENSE' });
      const incomeLeg = buildTransaction({ id: 'tx-inc', type: 'INCOME' });
      prismaMock.transaction.findMany.mockResolvedValue([expenseLeg, incomeLeg]);
      prismaMock.$transaction.mockResolvedValue([] as unknown as Transaction[]);
      prismaMock.transaction.update.mockResolvedValue({} as Transaction);

      const fd = buildUpdateFormData();
      fd.delete('title');

      const result = await updateTransfer('grp-1', fd);

      expect(result.success).toBe(true);
      const calls = prismaMock.transaction.update.mock.calls;
      const first = calls[0][0] as { data: { title: string } };
      const second = calls[1][0] as { data: { title: string } };
      expect(first.data.title).toBe('Transferência (Saída)');
      expect(second.data.title).toBe('Transferência (Entrada)');
    });

    it('retorna erro quando não encontra o par de pernas', async () => {
      prismaMock.transaction.findMany.mockResolvedValue([
        buildTransaction({ id: 'tx-exp', type: 'EXPENSE' }),
      ]);

      const result = await updateTransfer('grp-1', buildUpdateFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transferência não encontrada.');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    });

    it('rejeita valor <= 0 (min 0.01)', async () => {
      const result = await updateTransfer('grp-1', buildUpdateFormData({ amount: '0' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valor deve ser maior ou igual a 0.01.');
      expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await updateTransfer('grp-1', buildUpdateFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
