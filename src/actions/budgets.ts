"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Budget } from "@prisma/client"

export async function upsertBudget(formData: FormData): Promise<{ success: boolean; data?: Budget; error?: string }> {
  try {
    const categoryId = formData.get("categoryId") as string;
    const amountLimit = parseFloat(formData.get("amountLimit") as string);
    const month = parseInt(formData.get("month") as string);
    const year = parseInt(formData.get("year") as string);

    if (!categoryId || isNaN(amountLimit) || isNaN(month) || isNaN(year)) {
      return { success: false, error: "Todos os campos são obrigatórios." };
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
  } catch (error) {
    console.error("Erro ao definir orçamento:", error);
    return { success: false, error: "Erro interno ao definir orçamento." };
  }
}
