"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { roundMoney, sumMoney } from "@/lib/money";
import { computeAccountBalances } from "@/lib/account-balance";
import { computeCardSummary } from "@/lib/credit-card";

const FALLBACK_ANSWER =
  "Assistente indisponível no momento. Tente novamente em alguns instantes.";

type AskResult = { success: boolean; answer: string; error?: string };

/**
 * Responde a uma pergunta financeira em pt-BR.
 *
 * PRINCÍPIO: TODOS os números são calculados aqui, em código (determinístico).
 * A IA apenas interpreta/redige a resposta usando EXCLUSIVAMENTE os agregados
 * fornecidos no contexto — está explicitamente proibida de somar/calcular.
 */
export async function askFinancialQuestion(question: string): Promise<AskResult> {
  const session = await getSession();
  if (!session) {
    return { success: false, answer: "", error: "Não autorizado. Faça login novamente." };
  }

  // Validação da pergunta: string, 1..500 caracteres.
  if (typeof question !== "string") {
    return { success: false, answer: "", error: "Pergunta inválida." };
  }
  const trimmed = question.trim();
  if (trimmed.length === 0) {
    return { success: false, answer: "", error: "Digite uma pergunta." };
  }
  if (trimmed.length > 500) {
    return { success: false, answer: "", error: "A pergunta deve ter no máximo 500 caracteres." };
  }

  // Guardrail de custo: se o teto mensal foi atingido, não chama a IA.
  if (await isAiBudgetExceeded()) {
    return { success: true, answer: FALLBACK_ANSWER };
  }

  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    // ----- Agregados determinísticos (calculados em código) -----
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // UTC para casar com as datas das transações (meia-noite UTC).
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    // Transações do mês (sem transferências — não são receita/despesa).
    const monthTx = await prisma.transaction.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, isTransfer: false },
      include: { category: true },
    });

    const monthIncome = sumMoney(
      monthTx.filter((t) => t.type === "INCOME").map((t) => t.amount)
    );
    const monthExpense = sumMoney(
      monthTx.filter((t) => t.type === "EXPENSE").map((t) => t.amount)
    );

    // Transações do ano (sem transferências).
    const yearAgg = await prisma.transaction.groupBy({
      by: ["type"],
      where: { date: { gte: yearStart, lte: yearEnd }, isTransfer: false },
      _sum: { amount: true },
    });
    const yearIncome = roundMoney(
      yearAgg.find((g) => g.type === "INCOME")?._sum.amount ?? 0
    );
    const yearExpense = roundMoney(
      yearAgg.find((g) => g.type === "EXPENSE")?._sum.amount ?? 0
    );

    // Top categorias de despesa do mês.
    const expenseByCategory = new Map<string, number>();
    for (const t of monthTx) {
      if (t.type !== "EXPENSE") continue;
      const key = t.category.name;
      expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + t.amount);
    }
    const topCategories = [...expenseByCategory.entries()]
      .map(([name, amount]) => ({ name, amount: roundMoney(amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Saldos por conta (saldo derivado, nunca initialBalance bruto).
    const accounts = await prisma.account.findMany();
    const allTransactions = await prisma.transaction.findMany({
      select: { accountId: true, type: true, amount: true },
    });
    const accountBalances = computeAccountBalances(accounts, allTransactions).map(
      (a) => ({ name: a.name, balance: roundMoney(a.currentBalance) })
    );
    const totalBalance = roundMoney(
      accountBalances.reduce((acc, a) => acc + a.balance, 0)
    );

    // Orçamentos do mês com gasto correspondente.
    const budgets = await prisma.budget.findMany({
      where: { month, year },
      include: { category: true },
    });
    const budgetStatus = budgets.map((b) => {
      const spent = roundMoney(expenseByCategory.get(b.category.name) ?? 0);
      return {
        category: b.category.name,
        limit: roundMoney(b.amountLimit),
        spent,
        remaining: roundMoney(b.amountLimit - spent),
      };
    });

    // Resumo dos cartões (devido, fatura atual, limite disponível, vencimento).
    const cards = await prisma.creditCard.findMany({
      where: { archived: false },
      include: {
        transactions: { select: { type: true, amount: true, date: true } },
        invoices: { select: { paidAmount: true } },
      },
    });
    const cardsSummary = cards.map((card) => {
      const paidTotal = card.invoices.reduce((acc, i) => acc + i.paidAmount, 0);
      const s = computeCardSummary({
        creditLimit: card.creditLimit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        transactions: card.transactions,
        paidTotal,
        now,
      });
      return {
        nome: card.name,
        faturaAtual: s.currentInvoiceTotal,
        totalDevido: s.totalOwed,
        limiteDisponivel: s.availableLimit,
        utilizacaoPct: s.usagePercent,
        proximoVencimento: s.nextDueDate.toISOString().slice(0, 10),
      };
    });

    // Contexto JSON entregue à IA. Todos os valores em BRL, já arredondados.
    const context = {
      moeda: "BRL",
      mesAtual: `${String(month).padStart(2, "0")}/${year}`,
      mes: {
        receitas: monthIncome,
        despesas: monthExpense,
        saldoDoMes: roundMoney(monthIncome - monthExpense),
      },
      ano: {
        receitas: yearIncome,
        despesas: yearExpense,
        saldoDoAno: roundMoney(yearIncome - yearExpense),
      },
      topCategoriasDespesaDoMes: topCategories,
      saldosPorConta: accountBalances,
      saldoTotal: totalBalance,
      orcamentosDoMes: budgetStatus,
      cartoesDeCredito: cardsSummary,
    };

    const prompt = `Você é um assistente financeiro pessoal que responde em português do Brasil.

REGRAS ABSOLUTAS:
- Use SOMENTE os números fornecidos no JSON de contexto abaixo. Eles já foram calculados de forma correta.
- É TERMINANTEMENTE PROIBIDO somar, subtrair, recalcular, estimar ou inventar qualquer número que não esteja no contexto.
- Se a resposta exigir um número que não está no contexto, diga que não possui esse dado disponível.
- Todos os valores estão em Reais (BRL). Formate-os como R$ 0,00.
- Seja conciso, direto e amigável. Pode usar markdown simples (negrito, listas).

CONTEXTO (JSON com os agregados financeiros já calculados):
${JSON.stringify(context, null, 2)}

PERGUNTA DO USUÁRIO:
"${trimmed}"`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(prompt);

    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
    }

    const answer = result.response.text().trim();
    const latency = performance.now() - startTime;
    await logAiUsage(
      "Assistente Chat",
      "SUCCESS",
      null,
      promptTokens,
      completionTokens,
      totalTokens,
      latency,
      costUsd
    );

    return { success: true, answer: answer || FALLBACK_ANSWER };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    const latency = performance.now() - startTime;
    await logAiUsage(
      "Assistente Chat",
      "ERROR",
      errorMessage,
      promptTokens,
      completionTokens,
      totalTokens,
      latency,
      costUsd
    );
    console.error("AI Chat Error:", e);
    return { success: true, answer: FALLBACK_ANSWER };
  }
}
