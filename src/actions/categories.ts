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

export async function updateCategory(id: string, formData: FormData): Promise<{ success: boolean; data?: Category; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const colorRaw = formData.get("color");
    let color: string | undefined; // ausente => mantém o valor atual
    if (typeof colorRaw === "string" && colorRaw.trim() !== "") {
      const trimmed = colorRaw.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return { success: false, error: "Cor inválida. Use o formato #RRGGBB." };
      }
      color = trimmed;
    }

    const iconRaw = formData.get("icon");
    let icon: string | null | undefined; // ausente => mantém; vazio => limpa
    if (typeof iconRaw === "string") {
      const trimmed = iconRaw.trim();
      if (trimmed === "") {
        icon = null;
      } else {
        if (trimmed.length > 40) {
          return { success: false, error: "Ícone deve ter no máximo 40 caracteres." };
        }
        icon = trimmed;
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        name: nameRes.value,
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon } : {}),
      }
    });

    revalidatePath("/configuracoes/categorias");
    revalidatePath("/transacoes");

    return { success: true, data: category };
  } catch {
    console.error("Erro ao atualizar categoria.");
    return { success: false, error: "Erro interno ao atualizar categoria." };
  }
}

export async function reorderCategories(orderedIds: string[]): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, error: "Lista de categorias inválida." };
  }
  if (!orderedIds.every((id) => typeof id === "string" && id.trim() !== "")) {
    return { success: false, error: "Lista de categorias inválida." };
  }

  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.category.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    revalidatePath("/configuracoes/categorias");
    revalidatePath("/transacoes");

    return { success: true };
  } catch {
    console.error("Erro ao reordenar categorias.");
    return { success: false, error: "Erro interno ao reordenar categorias." };
  }
}

export async function getCategories() {
  return await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
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
