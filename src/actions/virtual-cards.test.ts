import { describe, it, expect, vi } from 'vitest';
import { createVirtualCard } from './virtual-cards';
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
  fd.append('cardId', 'card-1');
  fd.append('name', 'Assinaturas');
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe('actions/virtual-cards.ts', () => {
  describe('createVirtualCard', () => {
    it('cria um cartão virtual quando o físico existe', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCard.findUnique.mockResolvedValue({ id: 'card-1' } as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.virtualCard.create.mockResolvedValue({ id: 'vc-1' } as any);

      const result = await createVirtualCard(buildForm({ lastFour: '4321', spendingLimit: '500' }));

      expect(result.success).toBe(true);
      const arg = prismaMock.virtualCard.create.mock.calls[0][0];
      expect(arg.data.cardId).toBe('card-1');
      expect(arg.data.name).toBe('Assinaturas');
      expect(arg.data.spendingLimit).toBe(500);
      expect(arg.data.lastFour).toBe('4321');
    });

    it('rejeita quando o cartão físico não existe', async () => {
      prismaMock.creditCard.findUnique.mockResolvedValue(null);
      const result = await createVirtualCard(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cartão físico não encontrado');
      expect(prismaMock.virtualCard.create).not.toHaveBeenCalled();
    });

    it('rejeita lastFour inválido', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.creditCard.findUnique.mockResolvedValue({ id: 'card-1' } as any);
      const result = await createVirtualCard(buildForm({ lastFour: '12' }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('4 números');
    });

    it('retorna não autorizado sem sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);
      const result = await createVirtualCard(buildForm());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Não autorizado');
    });
  });
});
