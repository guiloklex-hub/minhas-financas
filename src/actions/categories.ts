"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Category } from "@prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString } from "@/lib/validation"

export async function createCategory(formData: FormData): Promise<{ success: boolean; data?: Category; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const colorRaw = formData.get("color");
    let color = "#52525b"; // default zinc-600
    if (typeof colorRaw === "string" && colorRaw.trim() !== "") {
      const trimmed = colorRaw.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return { success: false, error: "Cor inválida. Use o formato #RRGGBB." };
      }
      color = trimmed;
    }

    const category = await prisma.category.create({
      data: {
        name: nameRes.value,
        color,
      }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");

    return { success: true, data: category };
  } catch {
    console.error("Erro ao criar categoria.");
    return { success: false, error: "Erro interno ao criar categoria." };
  }
}

export async function getCategories() {
  return await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
}

export async function deleteCategory(id: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

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
  } catch {
    return { success: false, error: "Erro ao excluir categoria." };
  }
}
