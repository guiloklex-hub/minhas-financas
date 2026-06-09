import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

// Mocks das camadas de sugestão (isolados neste arquivo).
vi.mock('@/lib/categorization', () => ({
  suggestCategoriesForTitles: vi.fn(),
}));
vi.mock('@/lib/ai-categorize', () => ({
  categorizeTitlesWithAi: vi.fn(),
}));

import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';
import { suggestCategoriesForTitles } from '@/lib/categorization';
import { categorizeTitlesWithAi } from '@/lib/ai-categorize';
import { analyzeCsvForImport, confirmCsvImport } from './importer';

const account = { id: 'acc-1', name: 'Carteira' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.account.findUnique.mockResolvedValue(account as any);
  // Sem transações existentes por padrão (dedup não acha nada).
  prismaMock.transaction.findMany.mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.transaction.createMany.mockResolvedValue({ count: 0 } as any);
});

function csvFormData(content: string, mode: string): FormData {
  const fd = new FormData();
  fd.append('file', new File([content], 'extrato.csv', { type: 'text/csv' }));
  fd.append('accountId', 'acc-1');
  fd.append('mode', mode);
  return fd;
}

describe('analyzeCsvForImport', () => {
  it('modo IA: histórico resolve uns, IA resolve o resto, conta as origens', async () => {
    vi.mocked(suggestCategoriesForTitles).mockResolvedValue(
      new Map<string, string | null>([['Netflix', 'cat-1'], ['Padaria', null]])
    );
    vi.mocked(categorizeTitlesWithAi).mockResolvedValue({
      map: new Map<string, string | null>([['Padaria', 'cat-2']]),
      used: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'A' }, { id: 'cat-2', name: 'B' }] as any);

    const csv = '05/06/2026,Netflix,-39.90\n05/06/2026,Padaria,-10.00';
    const result = await analyzeCsvForImport(csvFormData(csv, 'ai'));

    expect(result.success).toBe(true);
    expect(result.counts).toMatchObject({ total: 2, history: 1, ai: 1, unresolved: 0 });
    const netflix = result.rows?.find((r) => r.title === 'Netflix');
    const padaria = result.rows?.find((r) => r.title === 'Padaria');
    expect(netflix?.source).toBe('history');
    expect(netflix?.suggestedCategoryId).toBe('cat-1');
    expect(padaria?.source).toBe('ai');
    expect(padaria?.suggestedCategoryId).toBe('cat-2');
  });

  it('aceita export pt-BR: separador ;, valor BR e data DD/MM', async () => {
    vi.mocked(suggestCategoriesForTitles).mockResolvedValue(new Map());
    // Cabeçalho é ignorado (data não parseia). Valores em formato BR e datas DD/MM.
    const csv = [
      'Data;Titulo;Valor',
      '06/06;Mercado;-1.234,56',
      '05/06;Salario;3.000,00',
    ].join('\n');
    const result = await analyzeCsvForImport(csvFormData(csv, 'history'));

    expect(result.success).toBe(true);
    expect(result.counts).toMatchObject({ total: 2 });
    const mercado = result.rows?.find((r) => r.title === 'Mercado');
    const salario = result.rows?.find((r) => r.title === 'Salario');
    expect(mercado).toMatchObject({ amount: 1234.56, type: 'EXPENSE' });
    expect(salario).toMatchObject({ amount: 3000, type: 'INCOME' });
    // DD/MM infere ano (junho já passou em relação a "hoje" do teste).
    expect(mercado?.date.startsWith('20')).toBe(true);
  });

  it('modo padrão: não sugere nada (tudo sem categoria, fica para o fallback)', async () => {
    const result = await analyzeCsvForImport(csvFormData('05/06/2026,Mercado,-50.00', 'default'));
    expect(result.success).toBe(true);
    expect(result.counts).toMatchObject({ total: 1, history: 0, ai: 0, unresolved: 1 });
    expect(vi.mocked(suggestCategoriesForTitles)).not.toHaveBeenCalled();
  });

  it('retorna não autorizado sem sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await analyzeCsvForImport(csvFormData('05/06/2026,X,-1.00', 'ai'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Não autorizado');
  });
});

describe('confirmCsvImport', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.category.findMany.mockResolvedValue([{ id: 'cat-1' }, { id: 'cat-2' }] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.transaction.createMany.mockResolvedValue({ count: 1 } as any);
  });

  function row(overrides: Record<string, unknown> = {}) {
    return { date: '2026-06-05T00:00:00.000Z', title: 'Mercado', amount: 50, type: 'EXPENSE' as const, ...overrides };
  }

  it('importa usando a categoria padrão quando a linha não tem categoria', async () => {
    const result = await confirmCsvImport({
      accountId: 'acc-1',
      defaultCategoryId: 'cat-1',
      rows: [row({ categoryId: null })],
    });
    expect(result.success).toBe(true);
    const data = (prismaMock.transaction.createMany.mock.calls[0][0] as { data: Array<{ categoryId: string }> }).data;
    expect(data[0].categoryId).toBe('cat-1');
  });

  it('rejeita categoryId inexistente (anti-adulteração)', async () => {
    const result = await confirmCsvImport({
      accountId: 'acc-1',
      defaultCategoryId: 'cat-1',
      rows: [row({ categoryId: 'hackercat' })],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Categoria inválida');
    expect(prismaMock.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejeita categoria padrão inválida', async () => {
    const result = await confirmCsvImport({ accountId: 'acc-1', defaultCategoryId: 'naoexiste', rows: [row()] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Categoria padrão inválida');
  });

  it('deduplica contra transações existentes', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { date: new Date('2026-06-05T00:00:00.000Z'), amount: 50, title: 'Mercado' },
    ] as never);
    const result = await confirmCsvImport({
      accountId: 'acc-1',
      defaultCategoryId: 'cat-1',
      rows: [row({ categoryId: 'cat-1' })],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('duplicadas');
  });

  it('retorna não autorizado sem sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await confirmCsvImport({ accountId: 'acc-1', defaultCategoryId: 'cat-1', rows: [row()] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Não autorizado');
  });
});
