import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBudget, deleteBudget } from './budgets';
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

describe('actions/budgets.ts', () => {
  beforeEach(() => {
    // Restaura a sessão autenticada padrão após casos que a sobrescrevem
    getSessionMock.mockResolvedValue({ userId: 'u1', email: 'teste@example.com' });
  });

  describe('deleteBudget', () => {
    it('deve excluir o orçamento chamando o Prisma com o id correto', async () => {
      const mockBudget = {
        id: 'bud-123',
        categoryId: 'cat-1',
        amountLimit: 500,
        month: 6,
        year: 2026,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaMock.budget.delete.mockResolvedValue(mockBudget);

      const result = await deleteBudget('bud-123');

      expect(result.success).toBe(true);
      expect(prismaMock.budget.delete).toHaveBeenCalledTimes(1);
      expect(prismaMock.budget.delete).toHaveBeenCalledWith({ where: { id: 'bud-123' } });
    });

    it('deve retornar erro quando não há sessão e não chamar o Prisma', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await deleteBudget('bud-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.budget.delete).not.toHaveBeenCalled();
    });

    it('deve retornar erro interno quando o Prisma falha', async () => {
      prismaMock.budget.delete.mockRejectedValue(new Error('db down'));

      const result = await deleteBudget('bud-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Erro interno ao excluir orçamento.');
    });
  });

  describe('upsertBudget', () => {
    function buildFormData(overrides: Partial<Record<'categoryId' | 'amountLimit' | 'month' | 'year', string>> = {}) {
      const data: Record<string, string> = {
        categoryId: 'cat-1',
        amountLimit: '500',
        month: '6',
        year: '2026',
        ...overrides
      };
      const formData = new FormData();
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value);
      }
      return formData;
    }

    it('deve criar um orçamento quando ainda não existe', async () => {
      const mockBudget = {
        id: 'bud-123',
        categoryId: 'cat-1',
        amountLimit: 500,
        month: 6,
        year: 2026,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaMock.budget.findFirst.mockResolvedValue(null);
      prismaMock.budget.create.mockResolvedValue(mockBudget);

      const result = await upsertBudget(buildFormData());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBudget);
      expect(prismaMock.budget.findFirst).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', month: 6, year: 2026 }
      });
      expect(prismaMock.budget.create).toHaveBeenCalledWith({
        data: { categoryId: 'cat-1', amountLimit: 500, month: 6, year: 2026 }
      });
      expect(prismaMock.budget.update).not.toHaveBeenCalled();
    });

    it('deve atualizar o teto quando o orçamento já existe', async () => {
      const existing = {
        id: 'bud-existing',
        categoryId: 'cat-1',
        amountLimit: 300,
        month: 6,
        year: 2026,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const updated = { ...existing, amountLimit: 500 };

      prismaMock.budget.findFirst.mockResolvedValue(existing);
      prismaMock.budget.update.mockResolvedValue(updated);

      const result = await upsertBudget(buildFormData());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(prismaMock.budget.update).toHaveBeenCalledWith({
        where: { id: 'bud-existing' },
        data: { amountLimit: 500 }
      });
      expect(prismaMock.budget.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro quando a categoria não é fornecida', async () => {
      const formData = buildFormData();
      formData.delete('categoryId');

      const result = await upsertBudget(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Categoria é obrigatório.');
      expect(prismaMock.budget.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.budget.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro quando o limite não é fornecido', async () => {
      const formData = buildFormData();
      formData.delete('amountLimit');

      const result = await upsertBudget(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Limite é obrigatório.');
      expect(prismaMock.budget.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro quando o mês está fora do intervalo', async () => {
      const result = await upsertBudget(buildFormData({ month: '13' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mês deve ser um inteiro entre 1 e 12.');
      expect(prismaMock.budget.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro quando o ano está fora do intervalo', async () => {
      const result = await upsertBudget(buildFormData({ year: '1999' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Ano deve ser um inteiro entre 2000 e 2100.');
      expect(prismaMock.budget.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro quando não há sessão', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await upsertBudget(buildFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.budget.findFirst).not.toHaveBeenCalled();
    });
  });
});
