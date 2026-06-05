import { describe, it, expect, vi, beforeEach } from 'vitest';

// Substitui o Prisma importado nas actions pelo nosso mock.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

// revalidatePath não faz nada nos testes.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Sessão SEMPRE autenticada por padrão; sobrescrevemos pontualmente.
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'teste@example.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import type { RecurringRule } from '@/generated/prisma/client';
import {
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  toggleRecurringRule,
  getRecurringRules,
} from './recurring';

const getSessionMock = vi.mocked(getSession);

// Helper para montar uma RecurringRule completa.
function buildRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    title: 'Salário',
    amount: 5000,
    type: 'INCOME',
    frequency: 'MONTHLY',
    dayOfMonth: 5,
    nextRunDate: new Date('2026-01-05T00:00:00.000Z'),
    lastRunDate: null,
    isActive: true,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildFormData(
  overrides: Partial<Record<'title' | 'amount' | 'type' | 'frequency' | 'dayOfMonth' | 'startDate' | 'categoryId' | 'accountId', string>> = {}
): FormData {
  const data: Record<string, string> = {
    title: 'Salário',
    amount: '5000',
    type: 'INCOME',
    frequency: 'MONTHLY',
    dayOfMonth: '5',
    startDate: '2026-01-05',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.append(k, v);
  return fd;
}

describe('actions/recurring.ts', () => {
  beforeEach(() => {
    // Restaura a sessão autenticada padrão após casos que a sobrescrevem.
    getSessionMock.mockResolvedValue({ userId: 'u1', email: 'teste@example.com' });
  });

  describe('createRecurringRule', () => {
    it('cria a regra chamando o Prisma com os campos normalizados', async () => {
      const mockRule = buildRule();
      prismaMock.recurringRule.create.mockResolvedValue(mockRule);

      const result = await createRecurringRule(buildFormData());

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual(mockRule);
      expect(prismaMock.recurringRule.create).toHaveBeenCalledTimes(1);

      const arg = prismaMock.recurringRule.create.mock.calls[0][0] as {
        data: {
          title: string;
          amount: number;
          type: string;
          frequency: string;
          dayOfMonth: number | null;
          nextRunDate: Date;
          categoryId: string;
          accountId: string;
        };
      };
      expect(arg.data.title).toBe('Salário');
      expect(arg.data.amount).toBe(5000);
      expect(arg.data.type).toBe('INCOME');
      expect(arg.data.frequency).toBe('MONTHLY');
      expect(arg.data.dayOfMonth).toBe(5);
      expect(arg.data.categoryId).toBe('cat-1');
      expect(arg.data.accountId).toBe('acc-1');
      expect(arg.data.nextRunDate).toBeInstanceOf(Date);
    });

    it('grava dayOfMonth como null para frequência WEEKLY', async () => {
      prismaMock.recurringRule.create.mockResolvedValue(
        buildRule({ frequency: 'WEEKLY', dayOfMonth: null })
      );

      // Mesmo enviando dayOfMonth, WEEKLY o ignora.
      const result = await createRecurringRule(
        buildFormData({ frequency: 'WEEKLY', dayOfMonth: '15' })
      );

      expect(result.success).toBe(true);
      const arg = prismaMock.recurringRule.create.mock.calls[0][0] as {
        data: { dayOfMonth: number | null };
      };
      expect(arg.data.dayOfMonth).toBeNull();
    });

    it('retorna erro quando o título não é fornecido', async () => {
      const fd = buildFormData();
      fd.delete('title');

      const result = await createRecurringRule(fd);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Título é obrigatório.');
      expect(prismaMock.recurringRule.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando o tipo é inválido', async () => {
      const result = await createRecurringRule(buildFormData({ type: 'FOO' }));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Tipo deve ser INCOME ou EXPENSE.');
      expect(prismaMock.recurringRule.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando a frequência é inválida', async () => {
      const result = await createRecurringRule(buildFormData({ frequency: 'DAILY' }));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Frequência deve ser WEEKLY, MONTHLY ou YEARLY.');
      expect(prismaMock.recurringRule.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando dayOfMonth está fora do intervalo (MONTHLY)', async () => {
      const result = await createRecurringRule(buildFormData({ dayOfMonth: '32' }));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Dia do mês deve ser um inteiro entre 1 e 31.');
      expect(prismaMock.recurringRule.create).not.toHaveBeenCalled();
    });

    it('retorna erro de não autorizado quando não há sessão e não chama o Prisma', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await createRecurringRule(buildFormData());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.recurringRule.create).not.toHaveBeenCalled();
    });

    it('retorna erro interno quando o Prisma falha', async () => {
      prismaMock.recurringRule.create.mockRejectedValue(new Error('db down'));

      const result = await createRecurringRule(buildFormData());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Erro interno ao criar regra de recorrência.');
    });
  });

  describe('updateRecurringRule', () => {
    it('atualiza a regra com o id correto', async () => {
      const updated = buildRule({ title: 'Aluguel', type: 'EXPENSE' });
      prismaMock.recurringRule.update.mockResolvedValue(updated);

      const result = await updateRecurringRule(
        'rule-1',
        buildFormData({ title: 'Aluguel', type: 'EXPENSE' })
      );

      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toEqual(updated);
      const arg = prismaMock.recurringRule.update.mock.calls[0][0] as {
        where: { id: string };
      };
      expect(arg.where.id).toBe('rule-1');
    });

    it('retorna erro de não autorizado quando não há sessão', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await updateRecurringRule('rule-1', buildFormData());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.recurringRule.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecurringRule', () => {
    it('exclui a regra chamando o Prisma com o id correto', async () => {
      prismaMock.recurringRule.delete.mockResolvedValue(buildRule());

      const result = await deleteRecurringRule('rule-1');

      expect(result.success).toBe(true);
      expect(prismaMock.recurringRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });

    it('retorna erro de não autorizado quando não há sessão', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await deleteRecurringRule('rule-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.recurringRule.delete).not.toHaveBeenCalled();
    });
  });

  describe('toggleRecurringRule', () => {
    it('alterna isActive de true para false', async () => {
      prismaMock.recurringRule.findUnique.mockResolvedValue(buildRule({ isActive: true }));
      prismaMock.recurringRule.update.mockResolvedValue(buildRule({ isActive: false }));

      const result = await toggleRecurringRule('rule-1');

      expect(result.success).toBe(true);
      expect(prismaMock.recurringRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { isActive: false },
      });
    });

    it('retorna erro quando a regra não existe', async () => {
      prismaMock.recurringRule.findUnique.mockResolvedValue(null);

      const result = await toggleRecurringRule('rule-x');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Regra de recorrência não encontrada.');
      expect(prismaMock.recurringRule.update).not.toHaveBeenCalled();
    });

    it('retorna erro de não autorizado quando não há sessão', async () => {
      getSessionMock.mockResolvedValueOnce(null);

      const result = await toggleRecurringRule('rule-1');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.recurringRule.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getRecurringRules', () => {
    it('lista as regras ordenadas por nextRunDate ascendente', async () => {
      const rules = [buildRule({ id: 'a' }), buildRule({ id: 'b' })];
      prismaMock.recurringRule.findMany.mockResolvedValue(rules);

      const result = await getRecurringRules();

      expect(result).toEqual(rules);
      expect(prismaMock.recurringRule.findMany).toHaveBeenCalledWith({
        orderBy: { nextRunDate: 'asc' },
      });
    });
  });
});
