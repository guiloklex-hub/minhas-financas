import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGoal, addToGoal, deleteGoal } from './goals';
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

// Sessão autenticada por padrão (a action exige guarda de sessão)
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'teste@example.com' })
}));

const mockedGetSession = vi.mocked(getSession);

// Conta de exemplo para quando precisarmos vincular uma meta a uma conta.
const mockAccount = {
  id: 'acc-1',
  name: 'Nubank',
  type: 'CHECKING',
  initialBalance: 0,
  currency: 'BRL',
  createdAt: new Date(),
  updatedAt: new Date()
};

const baseGoal = {
  id: 'goal-1',
  name: 'Reserva de emergência',
  targetAmount: 10000,
  currentAmount: 0,
  deadline: null as Date | null,
  accountId: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('actions/goals.ts', () => {
  beforeEach(() => {
    // Restaura a sessão autenticada antes de cada teste
    mockedGetSession.mockResolvedValue({ userId: 'u1', email: 'teste@example.com' });
  });

  describe('createGoal', () => {
    it('deve criar uma meta corretamente chamando o Prisma', async () => {
      prismaMock.goal.create.mockResolvedValue({ ...baseGoal });

      const formData = new FormData();
      formData.append('name', 'Reserva de emergência');
      formData.append('targetAmount', '10000');

      const result = await createGoal(formData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ ...baseGoal });
      expect(prismaMock.goal.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.goal.create).toHaveBeenCalledWith({
        data: {
          name: 'Reserva de emergência',
          targetAmount: 10000,
          currentAmount: 0,
          deadline: null,
          accountId: null
        }
      });
    });

    it('deve vincular a meta a uma conta e arredondar valores ao criar', async () => {
      prismaMock.goal.create.mockResolvedValue({
        ...baseGoal,
        currentAmount: 100.01,
        accountId: mockAccount.id
      });

      const formData = new FormData();
      formData.append('name', 'Viagem');
      formData.append('targetAmount', '5000');
      // 100.005 deve ser arredondado para 100.01 pelo roundMoney
      formData.append('currentAmount', '100.005');
      formData.append('accountId', mockAccount.id);

      const result = await createGoal(formData);

      expect(result.success).toBe(true);
      expect(prismaMock.goal.create).toHaveBeenCalledWith({
        data: {
          name: 'Viagem',
          targetAmount: 5000,
          currentAmount: 100.01,
          deadline: null,
          accountId: mockAccount.id
        }
      });
    });

    it('deve retornar erro se o nome não for fornecido', async () => {
      const formData = new FormData();
      // Sem name
      formData.append('targetAmount', '10000');

      const result = await createGoal(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nome é obrigatório.');
      expect(prismaMock.goal.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro se o valor alvo for inválido', async () => {
      const formData = new FormData();
      formData.append('name', 'Meta sem alvo');
      // targetAmount ausente

      const result = await createGoal(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valor alvo é obrigatório.');
      expect(prismaMock.goal.create).not.toHaveBeenCalled();
    });
  });

  describe('addToGoal', () => {
    beforeEach(() => {
      // $transaction interativo: executa o callback com o próprio mock.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaMock.$transaction.mockImplementation(async (arg: any) => {
        if (typeof arg === 'function') return arg(prismaMock);
        return Promise.all(arg);
      });
    });

    it('soma ao currentAmount existente arredondando o resultado (sem drift de float)', async () => {
      // Saldo atual com resíduo de float; aporte que, somado cru, daria
      // 0.1 + 0.2 = 0.30000000000000004 — roundMoney deve devolver 0.3.
      prismaMock.goal.findUnique.mockResolvedValue({ ...baseGoal, currentAmount: 0.1 });
      prismaMock.goal.update.mockResolvedValue({ ...baseGoal, currentAmount: 0.3 });

      const formData = new FormData();
      formData.append('amount', '0.2');

      const result = await addToGoal('goal-1', formData);

      expect(result.success).toBe(true);
      expect(prismaMock.goal.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.goal.update).toHaveBeenCalledWith({
        where: { id: 'goal-1' },
        data: { currentAmount: 0.3 },
      });
    });

    it('retorna erro quando a meta não existe', async () => {
      prismaMock.goal.findUnique.mockResolvedValue(null);

      const formData = new FormData();
      formData.append('amount', '100');

      const result = await addToGoal('goal-inexistente', formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Meta não encontrada.');
      expect(prismaMock.goal.update).not.toHaveBeenCalled();
    });

    it('deve retornar erro se o valor do aporte for inválido', async () => {
      const formData = new FormData();
      formData.append('amount', '0');

      const result = await addToGoal('goal-1', formData);

      expect(result.success).toBe(false);
      expect(prismaMock.goal.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteGoal', () => {
    it('deve excluir a meta chamando o Prisma', async () => {
      prismaMock.goal.delete.mockResolvedValue({ ...baseGoal });

      const result = await deleteGoal('goal-1');

      expect(result.success).toBe(true);
      expect(prismaMock.goal.delete).toHaveBeenCalledTimes(1);
      expect(prismaMock.goal.delete).toHaveBeenCalledWith({ where: { id: 'goal-1' } });
    });
  });

  describe('sem sessão', () => {
    it('createGoal deve retornar não autorizado e não tocar o Prisma', async () => {
      mockedGetSession.mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('name', 'Reserva de emergência');
      formData.append('targetAmount', '10000');

      const result = await createGoal(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.goal.create).not.toHaveBeenCalled();
    });

    it('addToGoal deve retornar não autorizado sem sessão', async () => {
      mockedGetSession.mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('amount', '100');

      const result = await addToGoal('goal-1', formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.goal.update).not.toHaveBeenCalled();
    });

    it('deleteGoal deve retornar não autorizado sem sessão', async () => {
      mockedGetSession.mockResolvedValueOnce(null);

      const result = await deleteGoal('goal-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.goal.delete).not.toHaveBeenCalled();
    });
  });
});
