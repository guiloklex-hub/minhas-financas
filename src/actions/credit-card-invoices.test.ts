import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payInvoice } from './credit-card-invoices';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === 'function') return arg(prismaMock);
    return Promise.all(arg);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.category.findFirst.mockResolvedValue({ id: 'cat-pay' } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.account.findUnique.mockResolvedValue({ id: 'acc-1', name: 'Conta' } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.transaction.create.mockResolvedValue({} as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCardInvoice.update.mockResolvedValue({} as any);
});

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    cardId: 'card-1',
    referenceMonth: 6,
    referenceYear: 2026,
    totalAmount: 0,
    paidAmount: 0,
    paymentGroupId: null,
    items: [
      { type: 'PURCHASE', amount: 200 },
      { type: 'PURCHASE', amount: 100 },
    ],
    card: { name: 'Nubank' },
    ...overrides,
  };
}

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('invoiceId', 'inv-1');
  fd.append('fromAccountId', 'acc-1');
  fd.append('amount', '300');
  fd.append('date', '2026-06-25');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('actions/credit-card-invoices.ts', () => {
  describe('payInvoice', () => {
    it('pagamento total marca a fatura como PAID', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardInvoice.findUnique.mockResolvedValue(invoice() as any);

      const result = await payInvoice(buildForm({ amount: '300' }));

      expect(result.success).toBe(true);
      const updateArg = prismaMock.creditCardInvoice.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('PAID');
      expect(updateArg.data.paidAmount).toBe(300);
      // A transação de pagamento deve ser marcada como transfer (fora das KPIs).
      const txArg = prismaMock.transaction.create.mock.calls[0][0];
      expect(txArg.data.isTransfer).toBe(true);
      expect(txArg.data.creditCardInvoiceId).toBe('inv-1');
    });

    it('pagamento parcial marca a fatura como PARTIAL', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCardInvoice.findUnique.mockResolvedValue(invoice() as any);

      const result = await payInvoice(buildForm({ amount: '100' }));

      expect(result.success).toBe(true);
      const updateArg = prismaMock.creditCardInvoice.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('PARTIAL');
      expect(updateArg.data.paidAmount).toBe(100);
    });

    it('retorna não autorizado sem sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const result = await payInvoice(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Não autorizado');
    });
  });
});
