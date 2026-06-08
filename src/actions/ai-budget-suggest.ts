"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { roundMoney } from "@/lib/money";
import { revalidatePath } from "next/cache";

export type BudgetSuggestion = {
  categoryId: string;
  name: string;
  suggestedLimit: number;
  rationale: string;
};

type SuggestResult =
  | { success: true; data: BudgetSuggestion[] }
  | { success: false; error: string };

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/**
 * Sugere limites de orçamento por categoria para um mês/ano.
 *
 * PRINCÍPIO: o número-base é determinístico — média de despesa por categoria
 * nos últimos 3 meses, arredondada para cima (em código). A IA é usada APENAS,
 * de forma opcional, para redigir uma justificativa curta por categoria; ela
 * NÃO altera os valores. Em qualquer falha de IA, devolvemos as sugestões
 * calculadas com uma justificativa padrão (fallback resiliente).
 */
export async function suggestBudgets(month: number, year: number): Promise<SuggestResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (!isValidMonth(month)) return { success: false, error: "Mês inválido." };
  if (!isValidYear(year)) return { success: false, error: "Ano inválido." };

  try {
    // Janela dos últimos 3 meses encerrados antes do mês-alvo.
    // Ex.: alvo 06/2026 -> considera 03/2026, 04/2026 e 05/2026.
    // UTC para casar com as datas das transações (meia-noite UTC).
    const windowEnd = new Date(Date.UTC(year, month - 1, 1)); // 1º dia do mês-alvo (exclusivo)
    const windowStart = new Date(Date.UTC(year, month - 1 - 3, 1)); // 3 meses antes

    const transactions = await prisma.transaction.findMany({
      where: {
        type: "EXPENSE",
        isTransfer: false,
        date: { gte: windowStart, lt: windowEnd },
      },
      include: { category: true },
    });

    // Soma de despesa por categoria na janela.
    const totalsByCategory = new Map<string, { name: string; total: number }>();
    for (const t of transactions) {
      const entry = totalsByCategory.get(t.categoryId);
      if (entry) {
        entry.total += t.amount;
      } else {
        totalsByCategory.set(t.categoryId, { name: t.category.name, total: t.amount });
      }
    }

    // Sugestão determinística: média mensal (÷3) arredondada para CIMA ao real.
    const baseSuggestions: BudgetSuggestion[] = [...totalsByCategory.entries()]
      .map(([categoryId, { name, total }]) => {
        const monthlyAverage = total / 3;
        const suggestedLimit = Math.ceil(monthlyAverage);
        return {
          categoryId,
          name,
          suggestedLimit,
          rationale: `Média mensal de gastos nos últimos 3 meses: ${formatBrl(
            roundMoney(monthlyAverage)
          )}.`,
        };
      })
      .filter((s) => s.suggestedLimit > 0)
      .sort((a, b) => b.suggestedLimit - a.suggestedLimit);

    if (baseSuggestions.length === 0) {
      return { success: false, error: "Não há despesas suficientes nos últimos 3 meses para sugerir orçamentos." };
    }

    // Enriquecimento opcional via IA (apenas a justificativa, nunca o valor).
    // Pula a IA se não houver chave ou se o teto de custo foi atingido.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || (await isAiBudgetExceeded())) {
      return { success: true, data: baseSuggestions };
    }

    const startTime = performance.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                categoryId: { type: SchemaType.STRING },
                rationale: {
                  type: SchemaType.STRING,
                  description: "Justificativa curta (até 140 caracteres) em pt-BR.",
                },
              },
              required: ["categoryId", "rationale"],
            },
          },
        },
      });

      const prompt = `Você é um consultor de orçamento pessoal. Para cada categoria abaixo, escreva uma justificativa CURTA (máx. 140 caracteres) em português do Brasil explicando por que o limite sugerido faz sentido.

REGRAS:
- NÃO recalcule, NÃO altere e NÃO mencione números diferentes dos fornecidos.
- O valor "limiteSugerido" já está correto (média dos últimos 3 meses arredondada para cima). Apenas justifique.
- Devolva o mesmo "categoryId" recebido.

Categorias (JSON):
${JSON.stringify(
  baseSuggestions.map((s) => ({
    categoryId: s.categoryId,
    nome: s.name,
    limiteSugerido: s.suggestedLimit,
  })),
  null,
  2
)}`;

      const result = await model.generateContent(prompt);

      if (result.response.usageMetadata) {
        promptTokens = result.response.usageMetadata.promptTokenCount;
        completionTokens = result.response.usageMetadata.candidatesTokenCount;
        totalTokens = result.response.usageMetadata.totalTokenCount;
        costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
      }

      const parsed = JSON.parse(result.response.text()) as Array<{
        categoryId: string;
        rationale: string;
      }>;
      const rationaleById = new Map(
        parsed
          .filter((p) => typeof p.categoryId === "string" && typeof p.rationale === "string")
          .map((p) => [p.categoryId, p.rationale.slice(0, 200)] as const)
      );

      const enriched = baseSuggestions.map((s) => ({
        ...s,
        rationale: rationaleById.get(s.categoryId) ?? s.rationale,
      }));

      const latency = performance.now() - startTime;
      await logAiUsage(
        "Sugestão de Orçamento",
        "SUCCESS",
        null,
        promptTokens,
        completionTokens,
        totalTokens,
        latency,
        costUsd
      );

      return { success: true, data: enriched };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
      const latency = performance.now() - startTime;
      await logAiUsage(
        "Sugestão de Orçamento",
        "ERROR",
        errorMessage,
        promptTokens,
        completionTokens,
        totalTokens,
        latency,
        costUsd
      );
      console.error("AI Budget Suggest Error:", e);
      // Fallback resiliente: devolve as sugestões determinísticas.
      return { success: true, data: baseSuggestions };
    }
  } catch (e) {
    console.error("Erro ao sugerir orçamentos:", e);
    return { success: false, error: "Erro interno ao sugerir orçamentos." };
  }
}

type ApplyResult = { success: boolean; count?: number; error?: string };

/**
 * Aplica as sugestões fazendo upsert de Budget por (categoryId, month, year).
 * Mesma lógica de upsert de budgets.ts (findFirst -> update/create), porém em
 * lote dentro de uma transação atômica.
 */
export async function applySuggestedBudgets(
  items: Array<{ categoryId: string; suggestedLimit: number }>,
  month: number,
  year: number
): Promise<ApplyResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  if (!isValidMonth(month)) return { success: false, error: "Mês inválido." };
  if (!isValidYear(year)) return { success: false, error: "Ano inválido." };

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: "Nenhuma sugestão para aplicar." };
  }
  if (items.length > 200) {
    return { success: false, error: "Quantidade de itens acima do limite." };
  }

  // Sanitiza/valida cada item.
  const sanitized: Array<{ categoryId: string; amountLimit: number }> = [];
  for (const item of items) {
    if (typeof item.categoryId !== "string" || item.categoryId.trim().length === 0) {
      return { success: false, error: "Categoria inválida em uma das sugestões." };
    }
    const limit = Number(item.suggestedLimit);
    if (!Number.isFinite(limit) || limit < 0 || limit > 1_000_000_000) {
      return { success: false, error: "Limite inválido em uma das sugestões." };
    }
    sanitized.push({ categoryId: item.categoryId.trim(), amountLimit: roundMoney(limit) });
  }

  try {
    // Valida que todas as categorias existem antes de gravar.
    const categoryIds = [...new Set(sanitized.map((s) => s.categoryId))];
    const ownedCount = await prisma.category.count({ where: { id: { in: categoryIds } } });
    if (ownedCount !== categoryIds.length) {
      return { success: false, error: "Uma ou mais categorias não foram encontradas." };
    }

    let count = 0;
    await prisma.$transaction(async (tx) => {
      for (const { categoryId, amountLimit } of sanitized) {
        const existing = await tx.budget.findFirst({ where: { categoryId, month, year } });
        if (existing) {
          await tx.budget.update({ where: { id: existing.id }, data: { amountLimit } });
        } else {
          await tx.budget.create({ data: { categoryId, amountLimit, month, year } });
        }
        count++;
      }
    });

    revalidatePath("/orcamentos");
    revalidatePath("/");

    return { success: true, count };
  } catch (e) {
    console.error("Erro ao aplicar orçamentos sugeridos:", e);
    return { success: false, error: "Erro interno ao aplicar os orçamentos." };
  }
}

function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
