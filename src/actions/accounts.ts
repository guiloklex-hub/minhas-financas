"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { Account } from "@/generated/prisma/client"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney } from "@/lib/validation"
import { isSupportedCurrency } from "@/lib/currency"

/** Lê e valida a moeda do formulário, com fallback para BRL. */
function parseCurrency(value: FormDataEntryValue | null): string {
  return typeof value === "string" && isSupportedCurrency(value) ? value : "BRL";
}

export async function createAccount(formData: FormData): Promise<{ success: boolean; data?: Account; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const balanceRes = parseMoney(formData.get("initialBalance"), "Saldo inicial", { min: -1_000_000_000 });
    if (!balanceRes.ok) return { success: false, error: balanceRes.error };

    const account = await prisma.account.create({
      data: {
        name: nameRes.value,
        type: typeRes.value,
        initialBalance: balanceRes.value,
        currency: parseCurrency(formData.get("currency")),
      }
    });

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");

    return { success: true, data: account };
  } catch (error) {
    console.error("Erro ao criar conta:", error);
    return { success: false, error: "Erro interno ao criar conta." };
  }
}

export async function updateAccount(id: string, formData: FormData): Promise<{ success: boolean; data?: Account; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const nameRes = parseRequiredString(formData.get("name"), "Nome");
    if (!nameRes.ok) return { success: false, error: nameRes.error };

    const typeRes = parseRequiredString(formData.get("type"), "Tipo");
    if (!typeRes.ok) return { success: false, error: typeRes.error };

    const balanceRes = parseMoney(formData.get("initialBalance"), "Saldo inicial", { min: -1_000_000_000 });
    if (!balanceRes.ok) return { success: false, error: balanceRes.error };

    const account = await prisma.account.update({
      where: { id },
      data: {
        name: nameRes.value,
        type: typeRes.value,
        initialBalance: balanceRes.value,
        currency: parseCurrency(formData.get("currency")),
      }
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
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

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
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    // Coleta os grupos de transferência das transações desta conta para que a
    // outra perna (em outra conta) também seja removida, evitando saldo
    // desbalanceado.
    const rows = await prisma.transaction.findMany({
      where: { accountId: id },
      select: { transferGroupId: true },
    });

    const groupIds = Array.from(
      new Set(
        rows
          .map((r) => r.transferGroupId)
          .filter((g): g is string => g !== null)
      )
    );

    await prisma.$transaction([
      prisma.transaction.deleteMany({
        where: {
          OR: [
            { accountId: id },
            { transferGroupId: { in: groupIds } },
          ],
        },
      }),
      prisma.account.delete({ where: { id } }),
    ]);

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir conta:", error);
    return { success: false, error: "Erro interno ao excluir conta." };
  }
}
