"use server";

import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logAiUsage } from "@/lib/gemini";
import { getSession } from "@/lib/session";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { formatCivilDate } from "@/lib/format-date";

export async function generateFinancialAdvice(month: number, year: number) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const startTime = performance.now();
  let status = "SUCCESS";
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    // Guardrail de custo: não chama o Gemini se o teto mensal foi atingido.
    if (await isAiBudgetExceeded()) {
      return {
        success: true,
        advice: [
          "O limite mensal de gasto com IA foi atingido — as dicas inteligentes estão pausadas até o próximo mês.",
          "Mantenha um fundo de emergência equivalente a pelo menos 6 meses de gastos básicos.",
          "Monitore constantemente suas maiores despesas para identificar oportunidades rápidas de economia.",
        ],
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    // 1. Coleta de Dados do Banco
    // UTC para casar com as datas das transações (meia-noite UTC).
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

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
  } catch (e) {
    status = "ERROR";
    errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Conselheiro", status, errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);

    console.error("AI Advisor Error:", e);
    return { 
      success: true, // Mantemos true para não quebrar o painel
      advice: [
        "Mantenha um fundo de emergência equivalente a pelo menos 6 meses de gastos básicos.",
        "Evite o uso rotativo do cartão de crédito; concentre-se em liquidar a fatura integralmente.",
        "Monitore constantemente suas maiores despesas para identificar oportunidades rápidas de economia."
      ] 
    };
  }
}

export async function testGeminiConnection() {
  const session = await getSession();
  if (!session) return { success: false, message: "Não autorizado. Faça login novamente." };

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, message: "A chave da API (GEMINI_API_KEY) não foi encontrada." };
    }

    if (await isAiBudgetExceeded()) {
      return { success: false, message: "Limite mensal de gasto com IA atingido." };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    
    // Teste simples e leve
    await model.generateContent("Responda apenas com a palavra 'OK'");
    
    return { success: true, message: "Conexão estabelecida com sucesso!" };
  } catch (e) {
    console.error("Test connection failed:", e);
    return {
      success: false,
      message: e instanceof Error ? e.message : "Erro de conexão ou chave inválida.",
    };
  }
}

export async function simulateInvestmentScenario(prompt: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const startTime = performance.now();
  let status = "SUCCESS";
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    // Guardrail de custo: não chama o Gemini se o teto mensal foi atingido.
    if (await isAiBudgetExceeded()) {
      return {
        success: true,
        answer: "O limite mensal de gasto com IA foi atingido, então o simulador inteligente está pausado até o próximo mês. Para simulações manuais, lembre-se de que o IR regressivo de renda fixa inicia em 22.5% (até 180 dias) e cai até 15% (acima de 720 dias).",
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    // 1. Coletar carteira
    const investments = await prisma.investment.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const portfolioContext = investments.length > 0 
      ? investments.map(inv => `- ${inv.name} (${inv.type}): R$ ${inv.currentAmount.toFixed(2)} rendendo ${(inv.yieldRate * 100).toFixed(2)}% a.a. Vencimento: ${inv.maturityDate ? formatCivilDate(inv.maturityDate) : 'Indefinido'}`).join('\n')
      : "O usuário não possui nenhum investimento cadastrado no momento.";

    // 2. Preparar prompt e regras
    const systemInstruction = `
Você é um planejador financeiro quantitativo e calculista.
Sua missão é ler a pergunta "E se?" do usuário e realizar os cálculos necessários para responder de forma clara.

Carteira Atual do Usuário:
${portfolioContext}

Regras Matemáticas e Tributárias do Brasil a considerar em seus cálculos mentais:
- Juros Compostos Anuais: M = P * (1 + i)^n
- Imposto de Renda Regressivo (para Renda Fixa):
  * Até 180 dias: 22.5% sobre o lucro
  * De 181 a 360 dias: 20%
  * De 361 a 720 dias: 17.5%
  * Acima de 720 dias: 15%
- IOF: altíssimo para saques com menos de 30 dias (deve alertar se for o caso).

Estrutura da Resposta:
- Use formatação Markdown.
- Calcule e mostre o Custo de Oportunidade (ex: quanto deixará de ganhar se sacar antes).
- Dê um veredito direto e matemático se vale a pena ou não a ação proposta.

Pergunta do Usuário: "${prompt}"
`;

    // 3. Chamada ao Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(systemInstruction);
    
    // Telemetria
    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000 * 0.1) + (completionTokens / 1_000_000 * 0.4);
    }

    const responseText = result.response.text();

    const latency = performance.now() - startTime;
    await logAiUsage("Simulador E-Se", status, null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    return { success: true, answer: responseText };
  } catch (e) {
    status = "ERROR";
    errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Simulador E-Se", status, errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);

    console.error("AI Simulator Error:", e);
    return { 
      success: true, 
      answer: "O simulador inteligente de IA está temporariamente indisponível (falha de rede ou instabilidade). Por favor, aguarde alguns instantes e tente novamente. Para simulações manuais, considere a alíquota regressiva do IR que inicia em 22.5%."
    };
  }
}
