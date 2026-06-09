import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import { getLatestMonthlyInsight, getMonthlyInsights } from './ai-insights';

const getSessionMock = vi.mocked(getSession);

beforeEach(() => {
  getSessionMock.mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
});

describe('actions/ai-insights.ts — guarda de sessão', () => {
  it('getLatestMonthlyInsight rejeita sem sessão e não consulta o Prisma', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getLatestMonthlyInsight()).rejects.toThrow('Não autorizado.');
    expect(prismaMock.monthlyInsight.findFirst).not.toHaveBeenCalled();
  });

  it('getMonthlyInsights rejeita sem sessão e não consulta o Prisma', async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getMonthlyInsights()).rejects.toThrow('Não autorizado.');
    expect(prismaMock.monthlyInsight.findMany).not.toHaveBeenCalled();
  });
});
