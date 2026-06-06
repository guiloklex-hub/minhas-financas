import { describe, it, expect, vi } from 'vitest';
import { createCard } from './credit-cards';
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

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.append('name', 'Nubank');
  fd.append('closingDay', '15');
  fd.append('dueDay', '25');
  fd.append('creditLimit', '5000');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('actions/credit-cards.ts', () => {
  describe('createCard', () => {
    it('cria um cartão com os campos válidos', async () => {
      const mockCard = { id: 'card-1', name: 'Nubank' };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCard.create.mockResolvedValue(mockCard as any);

      const result = await createCard(buildForm({ brand: 'MASTERCARD', rewardType: 'CASHBACK', rewardRate: '1' }));

      expect(result.success).toBe(true);
      expect(prismaMock.creditCard.create).toHaveBeenCalledTimes(1);
      const arg = prismaMock.creditCard.create.mock.calls[0][0];
      expect(arg.data.closingDay).toBe(15);
      expect(arg.data.dueDay).toBe(25);
      expect(arg.data.creditLimit).toBe(5000);
      expect(arg.data.brand).toBe('MASTERCARD');
      expect(arg.data.rewardType).toBe('CASHBACK');
    });

    it('rejeita dia de fechamento inválido', async () => {
      const result = await createCard(buildForm({ closingDay: '40' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Dia de fechamento');
      expect(prismaMock.creditCard.create).not.toHaveBeenCalled();
    });

    it('retorna não autorizado sem sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const result = await createCard(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Não autorizado');
      expect(prismaMock.creditCard.create).not.toHaveBeenCalled();
    });
  });
});
