import { describe, it, expect, vi } from 'vitest';
import { updateCategory, reorderCategories } from './categories';
import { prismaMock } from '../lib/__mocks__/prisma';
import { getSession } from '@/lib/session';

// Substitui o Prisma importado nas actions pelo nosso mock
vi.mock('@/lib/prisma', async () => {
  const mod = await vi.importActual<typeof import('../lib/__mocks__/prisma')>('../lib/__mocks__/prisma');
  return {
    prisma: mod.prismaMock
  };
});

// Precisamos fazer um mock do revalidatePath para não quebrar nos testes
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

// Sessão sempre autenticada por padrão (a action exige guarda de sessão)
vi.mock('@/lib/session', () => ({
  getSession: vi.fn().mockResolvedValue({ userId: 'u1', email: 'e@e.com' })
}));

describe('actions/categories.ts', () => {
  describe('updateCategory', () => {
    it('deve atualizar a categoria corretamente chamando o Prisma', async () => {
      const mockCategory = {
        id: 'cat-123',
        name: 'Mercado',
        color: '#10b981',
        icon: 'shopping-cart',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prismaMock.category.update.mockResolvedValue(mockCategory);

      const formData = new FormData();
      formData.append('name', 'Mercado');
      formData.append('color', '#10b981');
      formData.append('icon', 'shopping-cart');

      const result = await updateCategory('cat-123', formData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockCategory);
      expect(prismaMock.category.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-123' },
        data: {
          name: 'Mercado',
          color: '#10b981',
          icon: 'shopping-cart'
        }
      });
    });

    it('deve retornar erro de não autorizado quando não há sessão', async () => {
      vi.mocked(getSession).mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('name', 'Mercado');

      const result = await updateCategory('cat-123', formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Não autorizado. Faça login novamente.');
      expect(prismaMock.category.update).not.toHaveBeenCalled();
    });
  });

  describe('reorderCategories', () => {
    it('deve chamar update do Prisma para cada categoria com seu índice', async () => {
      prismaMock.category.update.mockResolvedValue({
        id: 'x',
        name: 'x',
        color: null,
        icon: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await reorderCategories(['cat-a', 'cat-b', 'cat-c']);

      expect(result.success).toBe(true);
      expect(prismaMock.category.update).toHaveBeenCalledTimes(3);
      expect(prismaMock.category.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'cat-a' },
        data: { sortOrder: 0 }
      });
      expect(prismaMock.category.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'cat-b' },
        data: { sortOrder: 1 }
      });
      expect(prismaMock.category.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'cat-c' },
        data: { sortOrder: 2 }
      });
    });

    it('deve retornar erro quando a lista está vazia', async () => {
      const result = await reorderCategories([]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Lista de categorias inválida.');
      expect(prismaMock.category.update).not.toHaveBeenCalled();
    });
  });
});
