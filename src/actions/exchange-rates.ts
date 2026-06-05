"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ExchangeRate } from "@prisma/client"
import { getSession } from "@/lib/session"
import { parseDate, parseMoney } from "@/lib/validation"
import { isSupportedCurrency } from "@/lib/currency"
import { refreshExchangeRatesFromApi } from "@/lib/exchange-rate-fetch"

/**
 * Atualiza as cotações a partir da API externa (AwesomeAPI), configurada em
 * `EXCHANGE_RATE_API_URL`. Best-effort: retorna mensagem clara se não configurada.
 */
export async function refreshExchangeRates(): Promise<{ success: boolean; message?: string; error?: string; data?: ExchangeRate[] }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const result = await refreshExchangeRatesFromApi();
  if (!result.ok) {
    return { success: false, error: result.error ?? "Não foi possível atualizar as cotações." };
  }

  revalidatePath("/configuracoes/moedas");
  const rates = await prisma.exchangeRate.findMany({ orderBy: { date: "desc" } });
  return { success: true, message: `${result.updated} cotação(ões) atualizada(s).`, data: rates };
}

/**
 * Cria ou atualiza uma cotação de câmbio (base→quote em uma data).
 *
 * O `@@unique([base, quote, date])` do schema garante que reenviar a mesma
 * tripla apenas atualiza a taxa, em vez de duplicar — por isso usamos `upsert`.
 */
export async function upsertExchangeRate(
  formData: FormData
): Promise<{ success: boolean; data?: ExchangeRate; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const baseRaw = formData.get("base");
    const quoteRaw = formData.get("quote");

    if (typeof baseRaw !== "string" || !isSupportedCurrency(baseRaw)) {
      return { success: false, error: "Moeda de origem inválida." };
    }
    if (typeof quoteRaw !== "string" || !isSupportedCurrency(quoteRaw)) {
      return { success: false, error: "Moeda de destino inválida." };
    }
    if (baseRaw === quoteRaw) {
      return { success: false, error: "A moeda de origem e destino devem ser diferentes." };
    }

    const rateRes = parseMoney(formData.get("rate"), "Taxa", { min: 0.000001, max: 1_000_000 });
    if (!rateRes.ok) return { success: false, error: rateRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const rate = await prisma.exchangeRate.upsert({
      where: {
        base_quote_date: {
          base: baseRaw,
          quote: quoteRaw,
          date: dateRes.value,
        },
      },
      update: { rate: rateRes.value },
      create: {
        base: baseRaw,
        quote: quoteRaw,
        rate: rateRes.value,
        date: dateRes.value,
      },
    });

    revalidatePath("/configuracoes/moedas");

    return { success: true, data: rate };
  } catch (error) {
    console.error("Erro ao salvar cotação:", error);
    return { success: false, error: "Erro interno ao salvar cotação." };
  }
}

/**
 * Remove uma cotação de câmbio pelo id.
 */
export async function deleteExchangeRate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (typeof id !== "string" || id.trim() === "") {
    return { success: false, error: "Cotação inválida." };
  }

  try {
    await prisma.exchangeRate.delete({ where: { id } });

    revalidatePath("/configuracoes/moedas");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir cotação:", error);
    return { success: false, error: "Erro interno ao excluir cotação." };
  }
}

/**
 * Lista todas as cotações cadastradas, da mais recente para a mais antiga.
 */
export async function getExchangeRates(): Promise<ExchangeRate[]> {
  return await prisma.exchangeRate.findMany({
    orderBy: [{ date: "desc" }, { base: "asc" }, { quote: "asc" }],
  });
}
