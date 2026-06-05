"use server"

import { prisma } from "@/lib/prisma";
import { parseTransactionText } from "@/lib/gemini";
import { getSession } from "@/lib/session";
import { roundMoney } from "@/lib/money";
import { revalidatePath } from "next/cache";

export async function createTransactionFromText(text: string, accountId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const categories = await prisma.category.findMany();
    if (categories.length === 0) {
      return { success: false, error: "Nenhuma categoria cadastrada no banco." };
    }

    // Call Gemini
    const parsedData = await parseTransactionText(text, categories);

    // Verify account
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      return { success: false, error: "Conta selecionada não encontrada." };
    }

    // Verificação de segurança (garantir que o retorno não contenha nulos se o Gemini errar)
    if ((!parsedData.categoryId && !parsedData.newCategory) || !parsedData.amount || !parsedData.description) {
         return { success: false, error: "A inteligência artificial não conseguiu estruturar todos os dados corretamente." };
    }

    let finalCategoryId = parsedData.categoryId;

    // Se a IA decidiu criar uma nova categoria
    if (parsedData.newCategory && !finalCategoryId) {
      const newCat = await prisma.category.create({
        data: {
          name: parsedData.newCategory.name,
          color: parsedData.newCategory.color
        }
      });
      finalCategoryId = newCat.id;
    }

    // Insert transaction (o saldo é derivado das transações, não mutado aqui)
    await prisma.transaction.create({
      data: {
        title: parsedData.description || "Transação Inteligente",
        amount: roundMoney(parsedData.amount),
        type: parsedData.type,
        categoryId: finalCategoryId,
        accountId,
        date: new Date(),
      }
    });

    revalidatePath("/transacoes");
    revalidatePath("/contas");
    revalidatePath("/insights");
    revalidatePath("/");

    return { success: true, data: parsedData };
  } catch (error) {
    console.error("AI Transaction Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao processar a transação com IA.",
    };
  }
}
