import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateInvestment } from './investments';
import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';

// Substitui o Prisma importado nas actions pelo nosso mock
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return {
    prisma: mod.prismaMock
  };
});

// Mock do revalidatePath para não quebrar nos testes
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

// Sessão sempre autenticada por padrão (a action exige guarda de sessão)
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'teste@example.com' })
}));

const getSessionMock = vi.mocked(getSession);

describe('actions/investments.ts', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: 'u1', email: 'teste@example.com' });
  });

  describe('updateInvestment', () => {
    it('deve atualizar o investimento convertendo yield% e aplicando roundMoney', async () => {
      const mockInvestment = {
        id: 'inv-1',
        name: 'Tesouro Selic',
        type: 'FIXED_INCOME',
        initialAmount: 1000.13,
        currentAmount: 1200.45,
        yieldRate: 0.105,
        startDate: new Date('2024-01-01'),
        maturityDate: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaMock.investment.update.mockResolvedValue(mockInvestment);

      const formData = new FormData();
      formData.append('name', 'Tesouro Selic');
      formData.append('type', 'FIXED_INCOME');
      // Valores com mais de 2 casas para validar o roundMoney
      formData.append('initialAmount', '1000.125');
      formData.append('currentAmount', '1200.454');
      // 10.5% deve virar 0.105 (divisão por 100)
      formData.append('yieldRate', '10.5');
      formData.append('startDate', '2024-01-01');

      const result = await updateInvestment('inv-1', formData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockInvestment);
      expect(prismaMock.investment.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.investment.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          name: 'Tesouro Selic',
          type: 'FIXED_INCOME',
          initialAmount: 1000.13, // roundMoney(1000.125)
          currentAmount: 1200.45, // roundMoney(1200.454)
          yieldRate: 0.105, // 10.5 / 100
          startDate: new Date('2024-01-01'),
          maturityDate: null
        }
      });
    });

    it('deve retornar erro de não autorizado quando não houver sessão', async () => {
      getSessionMock.mockResolvedValue(null);

      const formData = new FormData();
      formData.append('name', 'Tesouro Selic');
      formData.append('type', 'FIXED_INCOME');
      formData.append('initialAmount', '1000');
      formData.append('currentAmount', '1000');
      formData.append('yieldRate', '10.5');
      formData.append('startDate', '2024-01-01');

      const result = await updateInvestment('inv-1', formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.investment.update).not.toHaveBeenCalled();
    });
  });
});
