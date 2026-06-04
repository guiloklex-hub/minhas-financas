"use server";

import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logAiUsage } from "@/lib/gemini";

export async function generateFinancialAdvice(month: number, year: number) {
  const startTime = performance.now();
  let status = "SUCCESS";
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    // 1. Coleta de Dados do Banco
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const transactions = await prisma.transaction.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        isTransfer: false
      },
      include: { category: true }
    });

    const totalIncome = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);

    const expensesByCategory: Record<string, number> = {};
    transactions.filter(t => t.type === "EXPENSE").forEach(t => {
      const name = t.category.name;
      expensesByCategory[name] = (expensesByCategory[name] || 0) + t.amount;
    });

    const topCategories = Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => `${name}: R$ ${amount.toFixed(2)}`);

    const budgets = await prisma.budget.findMany({
      where: { month, year },
      include: { category: true }
    });

    const budgetStatus = budgets.map(b => {
      const spent = expensesByCategory[b.category.name] || 0;
      const percentage = (spent / b.amountLimit) * 100;
      return `${b.category.name}: R$ ${spent.toFixed(2)} / R$ ${b.amountLimit.toFixed(2)} (${percentage.toFixed(0)}%)`;
    });

    // 2. Preparação do Prompt
    const prompt = `
Você é um conselheiro financeiro sênior extremamente analítico.
Sua missão é fornecer 3 dicas/alertas baseados EXCLUSIVAMENTE nos dados deste mês.
Seja direto, profissional, use números percentuais para embasar seus avisos e aponte riscos ou pontos positivos.

Dados do Mês (${month}/${year}):
Total de Receitas: R$ ${totalIncome.toFixed(2)}
Total de Despesas: R$ ${totalExpense.toFixed(2)}
Três Maiores Gastos: ${topCategories.join(", ")}
Status dos Orçamentos (Gastos vs Limite):
${budgetStatus.join("\n")}
`;

    // 3. Chamada ao Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.STRING
          },
          description: "Retorne um array com exatamente 3 strings curtas contendo as dicas."
        }
      }
    });

    const result = await model.generateContent(prompt);
    
    // Telemetria
    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000 * 0.1) + (completionTokens / 1_000_000 * 0.4);
    }

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText) as string[];

    const latency = performance.now() - startTime;
    await logAiUsage("Conselheiro", status, null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    return { success: true, advice: parsed };
  } catch (e: any) {
    status = "ERROR";
    errorMessage = e.message || "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Conselheiro", status, errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);

    console.error("AI Advisor Error:", e);
    return { success: false, error: errorMessage };
  }
}
