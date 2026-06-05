"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Budget } from "@prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney } from "@/lib/validation"

export async function upsertBudget(formData: FormData): Promise<{ success: boolean; data?: Budget; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const categoryRes = parseRequiredString(formData.get("categoryId"), "Categoria");
    if (!categoryRes.ok) return { success: false, error: categoryRes.error };
    const categoryId = categoryRes.value;

    const amountRes = parseMoney(formData.get("amountLimit"), "Limite", { min: 0 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };
    const amountLimit = amountRes.value;

    const monthRaw = formData.get("month");
    const month = typeof monthRaw === "string" ? Number(monthRaw) : NaN;
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { success: false, error: "Mês deve ser um inteiro entre 1 e 12." };
    }

    const yearRaw = formData.get("year");
    const year = typeof yearRaw === "string" ? Number(yearRaw) : NaN;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { success: false, error: "Ano deve ser um inteiro entre 2000 e 2100." };
    }

    // Upsert logic: search by categoryId, month, and year. If it doesn't exist, create it. If it exists, update amountLimit.
    // Since Prisma requires a unique identifier for upsert, and we don't have a unique constraint on (categoryId, month, year) in the schema yet,
    // we do a findFirst followed by update or create.
    const existingBudget = await prisma.budget.findFirst({
      where: {
        categoryId,
        month,
        year
      }
    });

    let budget;
    if (existingBudget) {
      budget = await prisma.budget.update({
        where: { id: existingBudget.id },
        data: { amountLimit }
      });
    } else {
      budget = await prisma.budget.create({
        data: {
          categoryId,
          amountLimit,
          month,
          year
        }
      });
    }

    revalidatePath("/orcamentos");
    revalidatePath("/");

    return { success: true, data: budget };
  } catch {
    console.error("Erro ao definir orçamento.");
    return { success: false, error: "Erro interno ao definir orçamento." };
  }
}

export async function deleteBudget(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    await prisma.budget.delete({ where: { id } });

    revalidatePath("/orcamentos");
    revalidatePath("/");

    return { success: true };
  } catch {
    console.error("Erro ao excluir orçamento.");
    return { success: false, error: "Erro interno ao excluir orçamento." };
  }
}
