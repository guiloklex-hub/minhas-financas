import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCardPurchase } from './credit-card-transactions';
import { prismaMock } from '../lib/__mocks__/prisma';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'teste@example.com' }),
}));

import { getSession } from '@/lib/session';

beforeEach(() => {
  // $transaction interativo: executa o callback com o próprio mock.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === 'function') return arg(prismaMock);
    return Promise.all(arg);
  });
});

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('cardId', 'card-1');
  fd.append('title', 'Geladeira');
  fd.append('amount', '300');
  fd.append('date', '2026-06-10');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('actions/credit-card-transactions.ts', () => {
  describe('createCardPurchase', () => {
    it('cria N lançamentos para uma compra parcelada', async () => {
      prismaMock.creditCard.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'card-1', closingDay: 15, dueDay: 25 } as any
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardInvoice.upsert.mockResolvedValue({ id: 'inv-1' } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardTransaction.create.mockResolvedValue({} as any);

      const result = await createCardPurchase(buildForm({ installments: '3' }));

      expect(result.success).toBe(true);
      expect(prismaMock.creditCardTransaction.create).toHaveBeenCalledTimes(3);
      const firstCall = prismaMock.creditCardTransaction.create.mock.calls[0][0];
      expect(firstCall.data.installmentTotal).toBe(3);
      expect(firstCall.data.title).toBe('Geladeira (1/3)');
    });

    it('cria 1 lançamento para compra à vista', async () => {
      prismaMock.creditCard.findUnique.mockResolvedValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'card-1', closingDay: 15, dueDay: 25 } as any
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardInvoice.upsert.mockResolvedValue({ id: 'inv-1' } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardTransaction.create.mockResolvedValue({} as any);

      const result = await createCardPurchase(buildForm());

      expect(result.success).toBe(true);
      expect(prismaMock.creditCardTransaction.create).toHaveBeenCalledTimes(1);
      const call = prismaMock.creditCardTransaction.create.mock.calls[0][0];
      expect(call.data.installmentTotal).toBeNull();
      expect(call.data.title).toBe('Geladeira');
    });

    it('retorna erro quando o cartão não existe', async () => {
      prismaMock.creditCard.findUnique.mockResolvedValue(null);
      const result = await createCardPurchase(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cartão não encontrado');
    });

    it('retorna não autorizado sem sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const result = await createCardPurchase(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Não autorizado');
    });
  });
});
