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
import type { Category, Transaction } from '@prisma/client';
import { createTransfer } from './transfers';

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-transfer',
    name: 'Transferência',
    color: '#8b5cf6',
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
});
