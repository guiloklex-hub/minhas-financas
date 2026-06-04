"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getInvestments() {
  return await prisma.investment.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function createInvestment(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const initialAmount = parseFloat(formData.get("initialAmount") as string);
    const yieldRate = parseFloat(formData.get("yieldRate") as string) / 100; // Convert % to decimal
    const startDate = new Date(formData.get("startDate") as string);
    const maturityDateStr = formData.get("maturityDate") as string;
    
    if (!name || !type || isNaN(initialAmount) || isNaN(yieldRate) || !startDate) {
      return { success: false, error: "Dados inválidos." };
    }

    const investment = await prisma.investment.create({
      data: {
        name,
        type,
        initialAmount,
        currentAmount: initialAmount,
        yieldRate,
        startDate,
        maturityDate: maturityDateStr ? new Date(maturityDateStr) : null,
      }
    });

    revalidatePath("/investimentos");
    return { success: true, data: investment };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteInvestment(id: string) {
  try {
    await prisma.investment.delete({ where: { id } });
    revalidatePath("/investimentos");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
