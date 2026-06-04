import { describe, it, expect, vi } from 'vitest';
import { createAccount } from './accounts';
import { prismaMock } from '../lib/__mocks__/prisma';

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

describe('actions/accounts.ts', () => {
  describe('createAccount', () => {
    it('deve criar uma conta corretamente chamando o Prisma', async () => {
      const mockAccount = {
        id: 'acc-123',
        name: 'Nubank',
        type: 'CREDIT',
        initialBalance: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Configura o mock para resolver com essa conta quando prisma.account.create for chamado
      prismaMock.account.create.mockResolvedValue(mockAccount);

      // Precisamos montar um FormData falso para passar para a action
      const formData = new FormData();
      formData.append('name', 'Nubank');
      formData.append('type', 'CREDIT');
      formData.append('initialBalance', '0');

      const result = await createAccount(formData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAccount);
      expect(prismaMock.account.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: {
          name: 'Nubank',
          type: 'CREDIT',
          initialBalance: 0
        }
      });
    });

    it('deve retornar erro se o nome da conta não for fornecido', async () => {
      const formData = new FormData();
      // Não adiciona name
      formData.append('type', 'CREDIT');
      formData.append('initialBalance', '0');

      const result = await createAccount(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nome e tipo são obrigatórios.');
      expect(prismaMock.account.create).not.toHaveBeenCalled();
    });
  });
});
