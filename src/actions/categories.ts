"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Category } from "@prisma/client"

export async function createCategory(formData: FormData): Promise<{ success: boolean; data?: Category; error?: string }> {
  try {
    const name = formData.get("name") as string;
    const color = formData.get("color") as string;

    if (!name) {
      return { success: false, error: "O nome da categoria é obrigatório." };
    }

    const category = await prisma.category.create({
      data: {
        name,
        color: color || "#52525b", // default zinc-600
      }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    
    return { success: true, data: category };
  } catch (error) {
    console.error("Erro ao criar categoria:", error);
    return { success: false, error: "Erro interno ao criar categoria." };
  }
}

export async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
}

export async function deleteCategory(id: string) {
  try {
    const usage = await prisma.transaction.count({
      where: { categoryId: id }
    });

    if (usage > 0) {
      return { success: false, error: "Não é possível excluir uma categoria que possui transações." };
    }

    const budgetUsage = await prisma.budget.count({
      where: { categoryId: id }
    });

    if (budgetUsage > 0) {
      return { success: false, error: "Não é possível excluir uma categoria vinculada a um orçamento." };
    }

    await prisma.category.delete({
      where: { id }
    });

    revalidatePath("/configuracoes/categorias");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Erro ao excluir categoria." };
  }
}
