import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock do Prisma no mesmo padrão dos outros testes (deep mock).
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('./__mocks__/prisma')>('./__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

import { prismaMock } from './__mocks__/prisma';
import {
  getAiMonthlyBudgetUsd,
  getAiSpendThisMonthUsd,
  isAiBudgetExceeded,
} from './ai-budget';

// O aggregate é tipado; este helper monta o retorno mínimo esperado.
function mockSpend(costUsd: number | null) {
  prismaMock.aiUsageLog.aggregate.mockResolvedValue({
    _sum: { costUsd },
  } as Awaited<ReturnType<typeof prismaMock.aiUsageLog.aggregate>>);
}

describe('lib/ai-budget.ts', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getAiMonthlyBudgetUsd', () => {
    it('retorna null quando AI_MONTHLY_BUDGET_USD não está setado', () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '');
      expect(getAiMonthlyBudgetUsd()).toBeNull();
    });

    it('retorna null quando o valor é <= 0', () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '0');
      expect(getAiMonthlyBudgetUsd()).toBeNull();

      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '-5');
      expect(getAiMonthlyBudgetUsd()).toBeNull();
    });

    it('retorna null quando o valor não é numérico', () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', 'abc');
      expect(getAiMonthlyBudgetUsd()).toBeNull();
    });

    it('retorna o número quando setado com valor positivo', () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10.5');
      expect(getAiMonthlyBudgetUsd()).toBe(10.5);
    });
  });

  describe('getAiSpendThisMonthUsd', () => {
    it('soma o costUsd do mês corrente via aggregate', async () => {
      mockSpend(3.25);
      await expect(getAiSpendThisMonthUsd()).resolves.toBe(3.25);
      expect(prismaMock.aiUsageLog.aggregate).toHaveBeenCalledTimes(1);
    });

    it('retorna 0 quando o aggregate não traz soma (sem registros)', async () => {
      mockSpend(null);
      await expect(getAiSpendThisMonthUsd()).resolves.toBe(0);
    });

    it('consulta a partir do primeiro dia do mês corrente', async () => {
      mockSpend(0);
      await getAiSpendThisMonthUsd();

      const arg = prismaMock.aiUsageLog.aggregate.mock.calls[0][0] as {
        where: { createdAt: { gte: Date } };
      };
      const gte = arg.where.createdAt.gte;
      const now = new Date();
      expect(gte.getFullYear()).toBe(now.getFullYear());
      expect(gte.getMonth()).toBe(now.getMonth());
      expect(gte.getDate()).toBe(1);
    });
  });

  describe('isAiBudgetExceeded', () => {
    it('retorna false (e não consulta gasto) quando não há limite configurado', async () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '');

      await expect(isAiBudgetExceeded()).resolves.toBe(false);
      // Sem teto, nem deve ir ao banco somar o gasto.
      expect(prismaMock.aiUsageLog.aggregate).not.toHaveBeenCalled();
    });

    it('retorna false quando o gasto está abaixo do limite', async () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10');
      mockSpend(9.99);
      await expect(isAiBudgetExceeded()).resolves.toBe(false);
    });

    it('retorna true quando o gasto é exatamente igual ao limite', async () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10');
      mockSpend(10);
      await expect(isAiBudgetExceeded()).resolves.toBe(true);
    });

    it('retorna true quando o gasto ultrapassa o limite', async () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10');
      mockSpend(10.01);
      await expect(isAiBudgetExceeded()).resolves.toBe(true);
    });

    it('trata gasto nulo (sem registros) como 0 e não estoura o limite', async () => {
      vi.stubEnv('AI_MONTHLY_BUDGET_USD', '10');
      mockSpend(null);
      await expect(isAiBudgetExceeded()).resolves.toBe(false);
    });
  });
});
