"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { suggestCategoryIdByHistory } from "@/lib/categorization";
import { createCardPurchase } from "./credit-card-transactions";

type ActionResult = { success: boolean; error?: string };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Lançamento mágico no cartão: interpreta texto livre ("parcelei a geladeira em
 * 10x de 350 no cartão") e cria a compra parcelada. A IA só EXTRAI os campos
 * (descrição, valor TOTAL, parcelas); o cálculo das parcelas e a categorização
 * são determinísticos no código. Resiliente: erro de IA não cria nada.
 */
export async function createCardPurchaseFromText(text: string, cardId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (typeof text !== "string" || text.trim().length === 0) {
    return { success: false, error: "Descreva a compra em texto." };
  }
  if (text.trim().length > 300) {
    return { success: false, error: "Texto muito longo (máx. 300 caracteres)." };
  }
  if (typeof cardId !== "string" || cardId.trim().length === 0) {
    return { success: false, error: "Cartão é obrigatório." };
  }

  if (await isAiBudgetExceeded()) {
    return { success: false, error: "Limite mensal de IA atingido. Lance a compra manualmente." };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "IA não configurada. Lance a compra manualmente." };

  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const prompt = `Extraia os dados de uma compra de cartão de crédito a partir do texto do usuário.
- "amount" é o valor TOTAL da compra (se o texto disser "10x de 350", o total é 3500).
- "installments" é o número de parcelas (1 se à vista).
- "description" é uma descrição curta do item/estabelecimento.
Texto: "${text.trim()}"`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            description: { type: SchemaType.STRING },
            amount: { type: SchemaType.NUMBER },
            installments: { type: SchemaType.INTEGER },
          },
          required: ["description", "amount", "installments"],
        },
      },
    });

    const result = await model.generateContent(prompt);
    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
    }

    const parsed = JSON.parse(result.response.text()) as {
      description?: string;
      amount?: number;
      installments?: number;
    };

    const latency = performance.now() - startTime;
    await logAiUsage("Cartão Mágico", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    const description = (parsed.description || "").trim();
    const amount = Number(parsed.amount);
    const installments = Math.max(1, Math.min(72, Math.round(Number(parsed.installments) || 1)));

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: "Não consegui interpretar a compra. Tente novamente ou lance manualmente." };
    }

    // Categorização determinística pelo histórico (sem IA).
    const categoryId = await suggestCategoryIdByHistory(description);

    const fd = new FormData();
    fd.set("cardId", cardId);
    fd.set("title", description);
    fd.set("amount", String(amount));
    fd.set("installments", String(installments));
    fd.set("date", todayISO());
    if (categoryId) fd.set("categoryId", categoryId);

    return await createCardPurchase(fd);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Cartão Mágico", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    console.error("AI Card Purchase Error:", e);
    return { success: false, error: "A IA está indisponível. Lance a compra manualmente." };
  }
}
