import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' }),
}));

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
import { analyzeCardCsvForImport } from './card-csv-import';

const card = { id: 'card-1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ userId: 'u1', email: 'e@e.com' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCard.findUnique.mockResolvedValue(card as any);
  prismaMock.creditCardTransaction.findMany.mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.virtualCard.findMany.mockResolvedValue([] as any);
  vi.mocked(suggestCategoriesForTitles).mockResolvedValue(new Map());
  vi.mocked(categorizeTitlesWithAi).mockResolvedValue({ map: new Map(), used: false });
});

function csvFormData(content: string, opts?: { name?: string; type?: string }): FormData {
  const fd = new FormData();
  fd.append('file', new File([content], opts?.name ?? 'fatura.csv', { type: opts?.type ?? 'text/csv' }));
  fd.append('cardId', 'card-1');
  return fd;
}

describe('analyzeCardCsvForImport', () => {
  it('retorna erro sem sessão', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const result = await analyzeCardCsvForImport(csvFormData('2026-05-27,Mercado,150'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Não autorizado/);
  });

  it('parseia CSV simples, categoriza por histórico+IA e detecta origens', async () => {
    vi.mocked(suggestCategoriesForTitles).mockResolvedValue(
      new Map<string, string | null>([['Netflix', 'cat-1'], ['Padaria', null]])
    );
    vi.mocked(categorizeTitlesWithAi).mockResolvedValue({
      map: new Map<string, string | null>([['Padaria', 'cat-2']]),
      used: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'A' }, { id: 'cat-2', name: 'B' }] as any);

    const csv = [
      'Data,Descrição,Valor,Tipo,Parcela,Cartão',
      '2026-05-27,Netflix,39.90',
      '27/05/2026,Padaria,12.50',
      '2026-05-28,Loja,-90', // estorno por valor negativo
      '2026-05-29,Compra virtual,100,,,@1234',
    ].join('\n');

    const result = await analyzeCardCsvForImport(csvFormData(csv));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.rows).toHaveLength(4);
    expect(result.rows.find((r) => r.description === 'Netflix')?.suggestedCategoryId).toBe('cat-1');
    expect(result.rows.find((r) => r.description === 'Padaria')?.suggestedCategoryId).toBe('cat-2');
    expect(result.rows.find((r) => r.description === 'Loja')?.type).toBe('REFUND');

    const virtualRow = result.rows.find((r) => r.description === 'Compra virtual');
    expect(virtualRow?.source).toBe('vc:1234');
    expect(result.sources.some((s) => s.key === 'vc:1234')).toBe(true);
    expect(result.aiUsed).toBe(true);
  });

  it('marca duplicadas contra lançamentos existentes do cartão', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = [{ date: new Date(Date.UTC(2026, 4, 27)), amount: 39.9, title: 'Netflix' }] as any;
    prismaMock.creditCardTransaction.findMany.mockResolvedValue(existing);

    const result = await analyzeCardCsvForImport(csvFormData('2026-05-27,Netflix,39.90'));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.rows[0].duplicate).toBe(true);
  });

  it('rejeita arquivo com extensão inválida', async () => {
    const result = await analyzeCardCsvForImport(csvFormData('x', { name: 'foto.png', type: 'image/png' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/Formato inválido/);
  });

  it('rejeita quando não há linha válida', async () => {
    const result = await analyzeCardCsvForImport(csvFormData('Data,Descrição,Valor\nlixo,,'));
    expect(result.success).toBe(false);
  });
});
