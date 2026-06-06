import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redeemRewards } from './card-rewards';
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
  prismaMock.creditCard.findUnique.mockResolvedValue({ id: 'card-1' } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.cardRewardLedger.create.mockResolvedValue({} as any);
});

function buildForm(points: string): FormData {
  const fd = new FormData();
  fd.append('cardId', 'card-1');
  fd.append('points', points);
  fd.append('description', 'Milhas');
  return fd;
}

describe('actions/card-rewards.ts — redeemRewards', () => {
  it('resgata pontos quando há saldo suficiente', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.cardRewardLedger.aggregate.mockResolvedValue({ _sum: { points: 100 } } as any);

    const result = await redeemRewards(buildForm('40'));

    expect(result.success).toBe(true);
    const arg = prismaMock.cardRewardLedger.create.mock.calls[0][0];
    expect(arg.data.type).toBe('REDEEM');
    expect(arg.data.points).toBe(-40);
    expect(arg.data.balanceAfter).toBe(60);
  });

  it('rejeita resgate acima do saldo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.cardRewardLedger.aggregate.mockResolvedValue({ _sum: { points: 30 } } as any);

    const result = await redeemRewards(buildForm('40'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('insuficiente');
  });

  it('retorna não autorizado sem sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await redeemRewards(buildForm('10'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Não autorizado');
  });
});
