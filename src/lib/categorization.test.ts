import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('./__mocks__/prisma')>('./__mocks__/prisma');
  return { prisma: mod.prismaMock };
});

import { prismaMock } from './__mocks__/prisma';
import {
  normalizeTitle,
  suggestCategoryIdByHistory,
  suggestCategoriesForTitles,
} from './categorization';

// Histórico mockado: cada item simula o select { title, categoryId }.
type HistoryRow = { title: string; categoryId: string };

function mockHistory(rows: HistoryRow[]): void {
  prismaMock.transaction.findMany.mockResolvedValue(rows as never);
}

describe('lib/categorization.ts', () => {
  describe('normalizeTitle', () => {
    it('coloca em minúsculas', () => {
      expect(normalizeTitle('SALARIO')).toBe('salario');
    });

    it('remove acentos', () => {
      expect(normalizeTitle('Pão de Açúcar')).toBe('pao de acucar');
    });

    it('remove números e pontuação', () => {
      expect(normalizeTitle('Uber *Trip #1234, 99.90')).toBe('uber trip');
    });

    it('colapsa espaços repetidos e apara as pontas', () => {
      expect(normalizeTitle('  mercado    feira  ')).toBe('mercado feira');
    });

    it('retorna string vazia quando só há números/pontuação', () => {
      expect(normalizeTitle('1234 - 56.78')).toBe('');
    });

    it('é idempotente sobre um título já normalizado', () => {
      const once = normalizeTitle('Café com Leite 2x');
      expect(normalizeTitle(once)).toBe(once);
    });
  });

  describe('suggestCategoryIdByHistory', () => {
    it('retorna a categoria MAIS FREQUENTE entre as correspondências', async () => {
      // "ifood" aparece 3x: 2x em alimentacao, 1x em lazer => alimentacao vence.
      mockHistory([
        { title: 'iFood Pedido', categoryId: 'alimentacao' },
        { title: 'IFOOD restaurante', categoryId: 'alimentacao' },
        { title: 'ifood sobremesa', categoryId: 'lazer' },
        { title: 'Salario mensal', categoryId: 'renda' },
      ]);

      const result = await suggestCategoryIdByHistory('iFood almoço');
      expect(result).toBe('alimentacao');
    });

    it('casa por substring quando o título é contido em outro', async () => {
      mockHistory([
        { title: 'Uber Trip ajuda', categoryId: 'transporte' },
      ]);

      // "uber" está contido em "uber trip ajuda" (normalizado).
      const result = await suggestCategoryIdByHistory('Uber');
      expect(result).toBe('transporte');
    });

    it('retorna null quando nada casa', async () => {
      mockHistory([
        { title: 'Salario', categoryId: 'renda' },
        { title: 'Aluguel', categoryId: 'moradia' },
      ]);

      const result = await suggestCategoryIdByHistory('Netflix assinatura');
      expect(result).toBeNull();
    });

    it('retorna null quando o título normaliza para vazio (sem consultar histórico)', async () => {
      const result = await suggestCategoryIdByHistory('1234 99.90');
      expect(result).toBeNull();
      expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
    });

    it('ignora tokens curtos (preposições) para evitar correspondências espúrias', async () => {
      // O único token compartilhado seria "de" (curto, descartado) — não casa.
      mockHistory([
        { title: 'Conta de luz', categoryId: 'moradia' },
      ]);

      const result = await suggestCategoryIdByHistory('Presente de aniversario');
      expect(result).toBeNull();
    });
  });

  describe('suggestCategoriesForTitles', () => {
    it('resolve cada título carregando o histórico UMA única vez', async () => {
      mockHistory([
        { title: 'iFood Pedido', categoryId: 'alimentacao' },
        { title: 'Uber Trip', categoryId: 'transporte' },
      ]);

      const result = await suggestCategoriesForTitles([
        'iFood almoço',
        'Uber para casa',
        'Algo Desconhecido',
      ]);

      expect(result.get('iFood almoço')).toBe('alimentacao');
      expect(result.get('Uber para casa')).toBe('transporte');
      expect(result.get('Algo Desconhecido')).toBeNull();
      // Lote eficiente: só uma carga do histórico para os 3 títulos.
      expect(prismaMock.transaction.findMany).toHaveBeenCalledTimes(1);
    });

    it('retorna Map vazio sem consultar o banco quando não há títulos', async () => {
      const result = await suggestCategoriesForTitles([]);
      expect(result.size).toBe(0);
      expect(prismaMock.transaction.findMany).not.toHaveBeenCalled();
    });

    it('deduplica títulos repetidos no input (mesma chave no Map)', async () => {
      mockHistory([
        { title: 'iFood Pedido', categoryId: 'alimentacao' },
      ]);

      const result = await suggestCategoriesForTitles(['iFood almoço', 'iFood almoço']);
      expect(result.size).toBe(1);
      expect(result.get('iFood almoço')).toBe('alimentacao');
    });
  });
});
