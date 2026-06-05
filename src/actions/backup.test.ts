import { describe, it, expect, vi, beforeEach } from 'vitest';

// Substitui o Prisma importado na action pelo mock profundo.
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import { restoreBackup } from './backup';

/** Backup mínimo e válido (v1) com uma linha em cada tabela com FK. */
function buildValidBackup(): unknown {
  return {
    version: 1,
    exportedAt: '2026-06-05T00:00:00.000Z',
    data: {
      accounts: [
        {
          id: 'acc-1',
          name: 'Carteira',
          type: 'CASH',
          initialBalance: 0,
          currency: 'BRL',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      categories: [
        {
          id: 'cat-1',
          name: 'Geral',
          color: '#10b981',
          icon: null,
          sortOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      budgets: [],
      transactions: [
        {
          id: 'tx-1',
          title: 'Mercado',
          amount: 150.5,
          type: 'EXPENSE',
          date: '2024-01-10T00:00:00.000Z',
          notes: null,
          tags: null,
          reconciled: false,
          isTransfer: false,
          transferGroupId: null,
          recurrenceGroupId: null,
          categoryId: 'cat-1',
          accountId: 'acc-1',
          createdAt: '2024-01-10T00:00:00.000Z',
          updatedAt: '2024-01-10T00:00:00.000Z',
        },
      ],
      investments: [],
      recurringRules: [],
      goals: [],
    },
  };
}

/** Empacota um valor (objeto ou string crua) como File JSON num FormData. */
function buildFormData(content: unknown): FormData {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const file = new File([text], 'backup.json', { type: 'application/json' });
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

describe('actions/backup.ts — restoreBackup', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
    // O $transaction (forma callback) executa o callback recebendo o próprio mock,
    // de modo que os deletes/creates internos sejam registrados no prismaMock.
    prismaMock.$transaction.mockImplementation(
      async (cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock)
    );
  });

  it('JSON válido apaga e recria os dados dentro de $transaction (na ordem de FK)', async () => {
    const result = await restoreBackup(buildFormData(buildValidBackup()));

    expect(result.success).toBe(true);
    expect(result.message).toContain('1 conta(s)');
    expect(result.message).toContain('1 transação(ões)');

    // Tudo aconteceu dentro de uma única transação.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // Deletes de todas as tabelas (filhas primeiro, depois pais).
    expect(prismaMock.transaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.budget.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.recurringRule.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.goal.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.account.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.investment.deleteMany).toHaveBeenCalledTimes(1);

    // Recriações das tabelas que têm linhas no backup.
    expect(prismaMock.account.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.createMany).toHaveBeenCalledTimes(1);

    // Tabelas vazias no backup não geram createMany.
    expect(prismaMock.budget.createMany).not.toHaveBeenCalled();
    expect(prismaMock.investment.createMany).not.toHaveBeenCalled();
    expect(prismaMock.recurringRule.createMany).not.toHaveBeenCalled();
    expect(prismaMock.goal.createMany).not.toHaveBeenCalled();

    // ids preservados e datas reidratadas para Date.
    const accountArg = prismaMock.account.createMany.mock.calls[0][0] as {
      data: Array<{ id: string; createdAt: Date }>;
    };
    expect(accountArg.data[0].id).toBe('acc-1');
    expect(accountArg.data[0].createdAt).toBeInstanceOf(Date);

    const txArg = prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ id: string; date: Date; categoryId: string; accountId: string }>;
    };
    expect(txArg.data[0].id).toBe('tx-1');
    expect(txArg.data[0].date).toBeInstanceOf(Date);
    expect(txArg.data[0].categoryId).toBe('cat-1');
    expect(txArg.data[0].accountId).toBe('acc-1');

    // Registro de auditoria do restore.
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { action: 'BACKUP_RESTORE', entity: 'Backup' },
    });
  });

  it('JSON malformado retorna erro claro e não toca no banco', async () => {
    const result = await restoreBackup(buildFormData('{ isto não é json'));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Arquivo inválido: não é um JSON válido.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('JSON com shape inválido (sem data) retorna erro e não toca no banco', async () => {
    const result = await restoreBackup(buildFormData({ version: 1, exportedAt: 'x' }));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Arquivo de backup inválido ou incompleto.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('versão não suportada retorna erro e não toca no banco', async () => {
    const backup = buildValidBackup() as { version: number };
    backup.version = 2;

    const result = await restoreBackup(buildFormData(backup));

    expect(result.success).toBe(false);
    expect(result.error).toContain('Versão de backup não suportada');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('sem arquivo retorna erro', async () => {
    const result = await restoreBackup(new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Selecione um arquivo de backup (.json).');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('retorna "Não autorizado..." quando não há sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const result = await restoreBackup(buildFormData(buildValidBackup()));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Não autorizado. Faça login novamente.');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
