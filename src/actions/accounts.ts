"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Account } from "@prisma/client"

export async function createAccount(formData: FormData): Promise<{ success: boolean; data?: Account; error?: string }> {
  try {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const initialBalance = parseFloat(formData.get("initialBalance") as string) || 0;

    if (!name || !type) {
      return { success: false, error: "Nome e tipo são obrigatórios." };
    }

    const account = await prisma.account.create({
      data: {
        name,
        type,
        initialBalance,
      }
    });

    revalidatePath("/");
    revalidatePath("/transacoes");
    
    return { success: true, data: account };
  } catch (error) {
    console.error("Erro ao criar conta:", error);
    return { success: false, error: "Erro interno ao criar conta." };
  }
}

export async function updateAccount(id: string, formData: FormData): Promise<{ success: boolean; data?: Account; error?: string }> {
  try {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const initialBalance = parseFloat(formData.get("initialBalance") as string);

    if (!name || !type || isNaN(initialBalance)) {
      return { success: false, error: "Dados inválidos para atualizar a conta." };
    }

    const account = await prisma.account.update({
      where: { id },
      data: { name, type, initialBalance }
    });

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");

    return { success: true, data: account };
  } catch (error) {
    console.error("Erro ao atualizar conta:", error);
    return { success: false, error: "Erro interno ao atualizar conta." };
  }
}

export async function updateAccountBalance(id: string, initialBalance: number): Promise<{ success: boolean; data?: Account; error?: string }> {
  try {
    const account = await prisma.account.update({
      where: { id },
      data: { initialBalance }
    });

    revalidatePath("/");
    revalidatePath("/contas");

    return { success: true, data: account };
  } catch (error) {
    console.error("Erro ao atualizar saldo da conta:", error);
    return { success: false, error: "Erro interno ao atualizar saldo da conta." };
  }
}

export async function deleteAccount(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verificar se há transações na conta antes de excluir? 
    // Em um cenário real, talvez não devêssemos excluir contas com histórico. 
    // Por enquanto, excluímos transações em cascata ou informamos o erro se o schema não suportar.
    
    // Deleta transações associadas para evitar erro de foreign key
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    
    await prisma.account.delete({ where: { id } });

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir conta:", error);
    return { success: false, error: "Erro interno ao excluir conta." };
  }
}
