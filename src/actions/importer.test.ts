import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import type { Account, Category } from '@prisma/client';
import { importTransactionsFromCsv } from './importer';

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Carteira',
    type: 'CASH',
    initialBalance: 0,
    currency: 'BRL',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Geral',
    color: '#10b981',
    icon: null,
    sortOrder: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildFormData(file: File): FormData {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('accountId', 'acc-1');
  fd.append('categoryId', 'cat-1');
  return fd;
}

// Linha de transação existente usada na checagem de duplicidade do importador.
type ExistingTx = { date: Date; amount: number; title: string };

// Habilita conta + categoria válidas para os testes que chegam ao parse.
// Por padrão a conta não tem transações existentes (dedup não encontra nada).
function mockValidAccountAndCategory(existing: ExistingTx[] = []): void {
  prismaMock.account.findUnique.mockResolvedValue(buildAccount());
  prismaMock.category.findUnique.mockResolvedValue(buildCategory());
  prismaMock.transaction.findMany.mockResolvedValue(existing as never);
}

describe('actions/importer.ts', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  });

  it('rejeita arquivo maior que 2MB', async () => {
    // 2MB + 1 byte de conteúdo.
    const bigContent = 'a'.repeat(2 * 1024 * 1024 + 1);
    const file = new File([bigContent], 'grande.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Arquivo muito grande. O limite é de 2MB.');
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('parseia CSV com campo entre aspas contendo vírgula, pulando o cabeçalho', async () => {
    mockValidAccountAndCategory();
    prismaMock.transaction.createMany.mockResolvedValue({ count: 2 });

    // Linha 1: cabeçalho (data inválida => pulado).
    // Linha 2: título entre aspas com vírgula interna.
    // Linha 3: outra transação válida.
    const content = [
      'Data,Titulo,Valor',
      '2024-01-10,"Mercado, feira e padaria",-150.50',
      '2024-01-15,Salario,3000.00',
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(prismaMock.transaction.createMany).toHaveBeenCalledTimes(1);

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ title: string; amount: number; type: string; accountId: string; categoryId: string }>;
    }).data;

    expect(data).toHaveLength(2);

    // Campo entre aspas preservou a vírgula no título.
    expect(data[0].title).toBe('Mercado, feira e padaria');
    // Valor negativo => EXPENSE; armazenado em valor absoluto.
    expect(data[0].type).toBe('EXPENSE');
    expect(data[0].amount).toBe(150.5);

    // Valor positivo => INCOME.
    expect(data[1].title).toBe('Salario');
    expect(data[1].type).toBe('INCOME');
    expect(data[1].amount).toBe(3000);

    // Conta e categoria propagadas.
    expect(data[0].accountId).toBe('acc-1');
    expect(data[0].categoryId).toBe('cat-1');
  });

  it('conta apenas linhas válidas, ignorando linhas com data inválida', async () => {
    mockValidAccountAndCategory();
    prismaMock.transaction.createMany.mockResolvedValue({ count: 1 });

    const content = [
      'Data,Titulo,Valor', // cabeçalho — pulado (data inválida)
      'linha,sem,data', // data inválida — pulado
      '15/01/2024,Conta de luz,"-120,90"', // DD/MM/YYYY válida (vírgula decimal entre aspas)
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ title: string; amount: number; type: string }>;
    }).data;
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Conta de luz');
    expect(data[0].type).toBe('EXPENSE');
    expect(data[0].amount).toBe(120.9);
  });

  it('ignora linha já existente no banco (dedup por conta|dia|valor|título)', async () => {
    // Banco já tem "Mercado" de 10/01/2024, 150.50 nesta conta.
    mockValidAccountAndCategory([
      { date: new Date(Date.UTC(2024, 0, 10)), amount: 150.5, title: 'Mercado' },
    ]);
    prismaMock.transaction.createMany.mockResolvedValue({ count: 1 });

    const content = [
      'Data,Titulo,Valor',
      '2024-01-10,Mercado,-150.50', // duplicata da existente => ignorada
      '2024-01-15,Salario,3000.00', // nova => importada
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(true);
    // Só a transação nova foi importada.
    expect(result.count).toBe(1);
    expect(result.message).toContain('1 ignorada(s) (duplicadas)');

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ title: string; amount: number }>;
    }).data;
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Salario');
    expect(data[0].amount).toBe(3000);
  });

  it('ignora duplicatas dentro do próprio arquivo (mesma linha repetida)', async () => {
    mockValidAccountAndCategory(); // banco vazio
    prismaMock.transaction.createMany.mockResolvedValue({ count: 1 });

    const content = [
      'Data,Titulo,Valor',
      '2024-01-10,Mercado,-150.50',
      '2024-01-10,Mercado,-150.50', // duplicata interna => ignorada
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.message).toContain('1 ignorada(s) (duplicadas)');

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ title: string }>;
    }).data;
    expect(data).toHaveLength(1);
  });

  it('retorna erro quando nenhuma transação válida é encontrada', async () => {
    mockValidAccountAndCategory();

    const content = ['Data,Titulo,Valor', 'cabecalho,apenas,aqui'].join('\n');
    const file = new File([content], 'vazio.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Nenhuma transação válida encontrada no CSV. Use o formato: Data,Título,Valor',
    );
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejeita formato inválido (extensão e tipo não-CSV)', async () => {
    const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Formato inválido. Envie um arquivo .csv.');
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('retorna erro quando a conta não existe', async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);

    const file = new File(['2024-01-10,Teste,100'], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Conta não encontrada.');
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('modo "__auto__": categoriza cada linha pela sugestão do histórico', async () => {
    // Conta válida.
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    // Fallback existe (não será usado pelas linhas que casam).
    prismaMock.category.findFirst.mockResolvedValue(
      buildCategory({ id: 'cat-fallback' }) as never,
    );
    // 1ª chamada de findMany = dedup (where accountId): banco vazio.
    // 2ª chamada de findMany = histórico (select title/categoryId).
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { title: 'iFood Pedido', categoryId: 'cat-alimentacao' },
        { title: 'Uber Trip', categoryId: 'cat-transporte' },
      ] as never);
    prismaMock.transaction.createMany.mockResolvedValue({ count: 2 });

    const content = [
      'Data,Titulo,Valor',
      '2024-02-01,iFood almoco,-45.00',
      '2024-02-02,Uber para casa,-22.00',
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('accountId', 'acc-1');
    fd.append('categoryId', '__auto__');

    const result = await importTransactionsFromCsv(fd);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.message).toContain('2 auto-categorizada(s)');

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ title: string; categoryId: string }>;
    }).data;
    expect(data).toHaveLength(2);
    expect(data[0].categoryId).toBe('cat-alimentacao');
    expect(data[1].categoryId).toBe('cat-transporte');
  });

  it('modo "__auto__": usa a categoria de fallback quando o histórico não sugere', async () => {
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    prismaMock.category.findFirst.mockResolvedValue(
      buildCategory({ id: 'cat-fallback' }) as never,
    );
    prismaMock.transaction.findMany
      .mockResolvedValueOnce([] as never) // dedup
      .mockResolvedValueOnce([] as never); // histórico vazio => sem sugestão
    prismaMock.transaction.createMany.mockResolvedValue({ count: 1 });

    const content = [
      'Data,Titulo,Valor',
      '2024-02-01,Compra totalmente nova,-10.00',
    ].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('accountId', 'acc-1');
    fd.append('categoryId', '__auto__');

    const result = await importTransactionsFromCsv(fd);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.message).toContain('0 auto-categorizada(s)');

    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as {
      data: Array<{ categoryId: string }>;
    }).data;
    expect(data[0].categoryId).toBe('cat-fallback');
  });

  it('modo "__auto__": erro quando não há categoria cadastrada para fallback', async () => {
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
    prismaMock.category.findFirst.mockResolvedValue(null);

    const content = ['Data,Titulo,Valor', '2024-02-01,Algo,-10.00'].join('\n');
    const file = new File([content], 'extrato.csv', { type: 'text/csv' });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('accountId', 'acc-1');
    fd.append('categoryId', '__auto__');

    const result = await importTransactionsFromCsv(fd);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Nenhuma categoria cadastrada para categorização automática.');
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('retorna "Não autorizado..." quando não há sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const file = new File(['2024-01-10,Teste,100'], 'extrato.csv', { type: 'text/csv' });

    const result = await importTransactionsFromCsv(buildFormData(file));

    expect(result.success).toBe(false);
    expect(result.error).toBe('Não autorizado. Faça login novamente.');
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });
});
