import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

// Evita carregar o SDK de IA neste teste de confirmação.
vi.mock('@/lib/credit-card-service', () => ({
  ensureInvoice: vi.fn().mockResolvedValue('inv-1'),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import { confirmInvoiceImport } from './ai-invoice-import';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === 'function') return arg(prismaMock);
    return Promise.all(arg);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCard.findUnique.mockResolvedValue({ id: 'card-1', closingDay: 15, dueDay: 25 } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.category.findMany.mockResolvedValue([{ id: 'cat-1' }] as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.virtualCard.findMany.mockResolvedValue([{ id: 'vc-1' }] as any);
  prismaMock.creditCardTransaction.findMany.mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCardTransaction.create.mockResolvedValue({} as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.virtualCard.create.mockResolvedValue({ id: 'vc-new' } as any);
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-06-05',
    description: 'Mercado',
    amount: 50,
    type: 'PURCHASE' as const,
    source: 'PHYSICAL',
    include: true,
    ...overrides,
  };
}

describe('confirmInvoiceImport', () => {
  it('importa atribuindo virtualCardId conforme o sourceMap (origem virtual existente)', async () => {
    const result = await confirmInvoiceImport({
      cardId: 'card-1',
      sourceMap: { 'vc:7725': { target: 'vc-1' } },
      rows: [row({ source: 'vc:7725', categoryId: 'cat-1' })],
    });
    expect(result.success).toBe(true);
    const data = prismaMock.creditCardTransaction.create.mock.calls[0][0].data as { virtualCardId: string | null; categoryId: string | null };
    expect(data.virtualCardId).toBe('vc-1');
    expect(data.categoryId).toBe('cat-1');
  });

  it('cria cartão virtual NEW e usa o id gerado', async () => {
    const result = await confirmInvoiceImport({
      cardId: 'card-1',
      sourceMap: { 'vc:9999': { target: 'NEW', newName: 'Online' } },
      rows: [row({ source: 'vc:9999' })],
    });
    expect(result.success).toBe(true);
    expect(prismaMock.virtualCard.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.creditCardTransaction.create.mock.calls[0][0].data as { virtualCardId: string | null };
    expect(data.virtualCardId).toBe('vc-new');
  });

  it('rejeita categoryId inexistente', async () => {
    const result = await confirmInvoiceImport({
      cardId: 'card-1',
      sourceMap: {},
      rows: [row({ categoryId: 'hacker' })],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Categoria inválida');
  });

  it('deduplica contra lançamentos existentes', async () => {
    prismaMock.creditCardTransaction.findMany.mockResolvedValue([
      { date: new Date('2026-06-05T00:00:00.000Z'), amount: 50, title: 'Mercado' },
    ] as never);
    const result = await confirmInvoiceImport({
      cardId: 'card-1',
      sourceMap: {},
      rows: [row()],
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(prismaMock.creditCardTransaction.create).not.toHaveBeenCalled();
  });

  it('retorna não autorizado sem sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await confirmInvoiceImport({ cardId: 'card-1', sourceMap: {}, rows: [row()] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Não autorizado');
  });
});
