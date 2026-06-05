"use server"

import { getSession } from "@/lib/session"
import {
  isOpenBankingConfigured,
  syncTransactions,
  type BankTransaction,
} from "@/lib/openbanking"

/**
 * Dispara a sincronização de transações bancárias via Open Banking.
 *
 * Enquanto o agregador não estiver configurado (PLUGGY_CLIENT_ID/SECRET
 * ausentes), retorna `{ success: false, error }` — ponto de bloqueio claro
 * para a UI exibir a mensagem ao usuário.
 */
export async function syncBankTransactions(): Promise<{
  success: boolean;
  data?: BankTransaction[];
  error?: string;
}> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (!isOpenBankingConfigured()) {
    return {
      success: false,
      error: "Open Banking não configurado (defina PLUGGY_CLIENT_ID/SECRET).",
    };
  }

  try {
    const transactions = await syncTransactions();
    return { success: true, data: transactions };
  } catch (error) {
    console.error("Erro ao sincronizar transações bancárias:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao sincronizar transações.";
    return { success: false, error: message };
  }
}
