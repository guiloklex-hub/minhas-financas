import { describe, it, expect, vi, beforeEach } from 'vitest';

// Substitui o Prisma importado nas actions pelo nosso mock.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

// revalidatePath não faz nada nos testes.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Sessão SEMPRE autenticada por padrão; sobrescrevemos pontualmente com mockResolvedValueOnce.
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import type { Transaction } from '@/generated/prisma/client';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  deleteRecurrenceSeries,
  toggleReconciled,
} from './transactions';

// Helper para montar um Transaction completo (campos preenchidos com defaults sensatos).
function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    title: 'Mercado',
    amount: 100,
    type: 'EXPENSE',
    date: new Date('2024-01-31T00:00:00.000Z'),
    notes: null,
    tags: null,
    reconciled: false,
    isTransfer: false,
    transferGroupId: null,
    recurrenceGroupId: null,
    creditCardInvoiceId: null,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    createdAt: new Date('2024-01-31T00:00:00.000Z'),
    updatedAt: new Date('2024-01-31T00:00:00.000Z'),
    ...overrides,
  };
}

function buildSimpleFormData(): FormData {
  const fd = new FormData();
  fd.append('title', 'Mercado');
  fd.append('amount', '100');
  fd.append('type', 'EXPENSE');
  fd.append('date', '2024-01-31');
  fd.append('categoryId', 'cat-1');
  fd.append('accountId', 'acc-1');
  return fd;
}

describe('actions/transactions.ts', () => {
  beforeEach(() => {
    // Garante a sessão autenticada como padrão entre testes (após mockResolvedValueOnce).
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  });

  describe('createTransaction (recorrente)', () => {
    it('cria N transações via $transaction com clamp de fim de mês (31/jan +1 mês => fev, não março)', async () => {
      // O $transaction recebe um array de promessas de create; só precisamos resolvê-lo.
      prismaMock.$transaction.mockResolvedValue([] as unknown as Transaction[]);
      // Cada create retorna algo; o conteúdo não é usado no caminho recorrente.
      prismaMock.transaction.create.mockResolvedValue(buildTransaction());

      const fd = buildSimpleFormData();
      // Sem 'Z' => parseado em horário LOCAL, alinhado às APIs locais de addMonthsClamped
      // (getDate/getMonth), tornando o clamp determinístico independente do fuso do CI.
      fd.set('date', '2024-01-31T00:00:00');
      fd.append('isRecurring', 'on');
      fd.append('recurrenceMonths', '3');
      fd.append('notes', 'parcela mensal');
      fd.append('tags', ' assinatura , casa ');

      const result = await createTransaction(fd);

      expect(result.success).toBe(true);
      // 3 chamadas de create (uma por mês).
      expect(prismaMock.transaction.create).toHaveBeenCalledTimes(3);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // Inspeciona as datas passadas em cada create.
      // Tipamos cada argumento como o shape de `create` para evitar `any` implícito
      // e sem depender de tipos gerados do Prisma além do necessário.
      type CreateArg = {
        data: {
          date: Date;
          title: string;
          recurrenceGroupId: string;
          notes: string | null;
          tags: string | null;
        };
      };
      const calls = prismaMock.transaction.create.mock.calls as unknown as Array<[CreateArg]>;
      const dates = calls.map((c) => c[0].data.date);

      // 1ª: janeiro (mês 0), dia 31.
      expect(dates[0].getMonth()).toBe(0);
      expect(dates[0].getDate()).toBe(31);

      // 2ª: fevereiro (mês 1) por clamp — NÃO março (mês 2).
      expect(dates[1].getMonth()).toBe(1);
      expect(dates[1].getMonth()).not.toBe(2);
      // Dia foi clampado para o último dia de fevereiro de 2024 (bissexto => 29).
      expect(dates[1].getDate()).toBe(29);

      // 3ª: março (mês 2), dia 31.
      expect(dates[2].getMonth()).toBe(2);
      expect(dates[2].getDate()).toBe(31);

      // Conferindo os títulos numerados das parcelas recorrentes.
      const titles = calls.map((c) => c[0].data.title);
      expect(titles[0]).toBe('Mercado');
      expect(titles[1]).toBe('Mercado (2/3)');
      expect(titles[2]).toBe('Mercado (3/3)');

      // Todas compartilham o mesmo recurrenceGroupId.
      const groupIds = calls.map((c) => c[0].data.recurrenceGroupId);
      expect(groupIds[0]).toBeTruthy();
      expect(new Set(groupIds).size).toBe(1);

      // notes/tags (normalizadas) propagam para todas as parcelas da série.
      for (const c of calls) {
        expect(c[0].data.notes).toBe('parcela mensal');
        expect(c[0].data.tags).toBe('assinatura,casa');
      }
    });
  });

  describe('createTransaction (simples)', () => {
    it('cria uma transação simples chamando create uma vez', async () => {
      const created = buildTransaction();
      prismaMock.transaction.create.mockResolvedValue(created);

      const result = await createTransaction(buildSimpleFormData());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(created);
      expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: {
          title: 'Mercado',
          amount: 100,
          type: 'EXPENSE',
          date: expect.any(Date),
          categoryId: 'cat-1',
          accountId: 'acc-1',
          notes: null,
          tags: null,
        },
      });
    });

    it('persiste notes e tags normalizadas ao criar', async () => {
      const created = buildTransaction({ notes: 'comprei a prazo', tags: 'casa,contas' });
      prismaMock.transaction.create.mockResolvedValue(created);

      const fd = buildSimpleFormData();
      fd.append('notes', '  comprei a prazo  ');
      // Espaços extras, vazios e duplicata devem ser normalizados para "casa,contas".
      fd.append('tags', ' casa ,  contas , , casa ');

      const result = await createTransaction(fd);

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: {
          title: 'Mercado',
          amount: 100,
          type: 'EXPENSE',
          date: expect.any(Date),
          categoryId: 'cat-1',
          accountId: 'acc-1',
          notes: 'comprei a prazo',
          tags: 'casa,contas',
        },
      });
    });

    it('grava null em notes/tags quando ausentes ou vazias', async () => {
      prismaMock.transaction.create.mockResolvedValue(buildTransaction());

      const fd = buildSimpleFormData();
      fd.append('notes', '   ');
      fd.append('tags', ' , , ');

      const result = await createTransaction(fd);

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: {
          title: 'Mercado',
          amount: 100,
          type: 'EXPENSE',
          date: expect.any(Date),
          categoryId: 'cat-1',
          accountId: 'acc-1',
          notes: null,
          tags: null,
        },
      });
    });

    it('rejeita notes acima de 2000 caracteres', async () => {
      const fd = buildSimpleFormData();
      fd.append('notes', 'x'.repeat(2001));

      const result = await createTransaction(fd);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Observações devem ter no máximo 2000 caracteres.');
      expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando o título está ausente', async () => {
      const fd = buildSimpleFormData();
      fd.delete('title');

      const result = await createTransaction(fd);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Título é obrigatório.');
      expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando o valor está ausente', async () => {
      const fd = buildSimpleFormData();
      fd.delete('amount');

      const result = await createTransaction(fd);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Valor é obrigatório.');
      expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    });

    it('retorna erro quando a conta está ausente', async () => {
      const fd = buildSimpleFormData();
      fd.delete('accountId');

      const result = await createTransaction(fd);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conta é obrigatório.');
      expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await createTransaction(buildSimpleFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTransaction', () => {
    it('bloqueia edição de uma perna de transferência', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(
        buildTransaction({ transferGroupId: 'g1', isTransfer: true }),
      );

      const fd = buildSimpleFormData();
      const result = await updateTransaction('tx-1', fd);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Transferências não podem ser editadas individualmente. Exclua e recrie a transferência.',
      );
      expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    });

    it('atualiza uma transação normal', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(buildTransaction());
      const updated = buildTransaction({ title: 'Mercado editado' });
      prismaMock.transaction.update.mockResolvedValue(updated);

      const fd = buildSimpleFormData();
      fd.set('title', 'Mercado editado');

      const result = await updateTransaction('tx-1', fd);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(prismaMock.transaction.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: {
          title: 'Mercado editado',
          amount: 100,
          type: 'EXPENSE',
          date: expect.any(Date),
          categoryId: 'cat-1',
          accountId: 'acc-1',
          notes: null,
          tags: null,
        },
      });
    });

    it('atualiza notes e tags normalizadas', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(buildTransaction());
      prismaMock.transaction.update.mockResolvedValue(
        buildTransaction({ notes: 'pago', tags: 'casa,fixo' }),
      );

      const fd = buildSimpleFormData();
      fd.append('notes', '  pago  ');
      fd.append('tags', ' casa , fixo , casa ');

      const result = await updateTransaction('tx-1', fd);

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: {
          title: 'Mercado',
          amount: 100,
          type: 'EXPENSE',
          date: expect.any(Date),
          categoryId: 'cat-1',
          accountId: 'acc-1',
          notes: 'pago',
          tags: 'casa,fixo',
        },
      });
    });

    it('retorna erro quando a transação não existe', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(null);

      const result = await updateTransaction('inexistente', buildSimpleFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transação não encontrada.');
      expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await updateTransaction('tx-1', buildSimpleFormData());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('deleteTransaction', () => {
    it('remove ambas as pernas via deleteMany quando é transferência', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(
        buildTransaction({ transferGroupId: 'g1', isTransfer: true }),
      );
      prismaMock.transaction.deleteMany.mockResolvedValue({ count: 2 });

      const result = await deleteTransaction('tx-1');

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.deleteMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.deleteMany).toHaveBeenCalledWith({
        where: { transferGroupId: 'g1' },
      });
      expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
    });

    it('remove uma transação normal via delete', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(buildTransaction());
      prismaMock.transaction.delete.mockResolvedValue(buildTransaction());

      const result = await deleteTransaction('tx-1');

      expect(result.success).toBe(true);
      expect(prismaMock.transaction.delete).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
      });
      expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
    });

    it('retorna erro quando a transação não existe', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(null);

      const result = await deleteTransaction('inexistente');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transação não encontrada.');
      expect(prismaMock.transaction.delete).not.toHaveBeenCalled();
      expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await deleteTransaction('tx-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecurrenceSeries', () => {
    it('remove a série inteira via deleteMany pelo recurrenceGroupId', async () => {
      prismaMock.transaction.deleteMany.mockResolvedValue({ count: 3 });

      const result = await deleteRecurrenceSeries('rg-1');

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(prismaMock.transaction.deleteMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.deleteMany).toHaveBeenCalledWith({
        where: { recurrenceGroupId: 'rg-1' },
      });
    });

    it('retorna erro quando o grupo de recorrência é vazio', async () => {
      const result = await deleteRecurrenceSeries('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Grupo de recorrência inválido.');
      expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await deleteRecurrenceSeries('rg-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('toggleReconciled', () => {
    it('alterna de false para true', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(
        buildTransaction({ reconciled: false }),
      );
      const updated = buildTransaction({ reconciled: true });
      prismaMock.transaction.update.mockResolvedValue(updated);

      const result = await toggleReconciled('tx-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(prismaMock.transaction.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: { reconciled: true },
      });
    });

    it('alterna de true para false', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(
        buildTransaction({ reconciled: true }),
      );
      const updated = buildTransaction({ reconciled: false });
      prismaMock.transaction.update.mockResolvedValue(updated);

      const result = await toggleReconciled('tx-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updated);
      expect(prismaMock.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: { reconciled: false },
      });
    });

    it('retorna erro quando a transação não existe', async () => {
      prismaMock.transaction.findUnique.mockResolvedValue(null);

      const result = await toggleReconciled('inexistente');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transação não encontrada.');
      expect(prismaMock.transaction.update).not.toHaveBeenCalled();
    });

    it('retorna "Não autorizado..." quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const result = await toggleReconciled('tx-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.transaction.findUnique).not.toHaveBeenCalled();
    });
  });
});
