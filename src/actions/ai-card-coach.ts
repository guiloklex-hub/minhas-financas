"use server";

import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logAiUsage } from "@/lib/gemini";
import { getSession } from "@/lib/session";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { roundMoney } from "@/lib/money";
import { invoiceItemsTotal } from "@/lib/credit-card-service";
import { shiftCompetence } from "@/lib/credit-card";

const FALLBACK = [
  "Pague a fatura integralmente até o vencimento para evitar os juros do rotativo, que estão entre os mais altos do mercado.",
  "Revise as maiores categorias da fatura e identifique gastos que podem ser cortados ou renegociados.",
  "Acompanhe as parcelas já comprometidas nas próximas faturas antes de assumir novas compras parceladas.",
];

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Coach da fatura: calcula as métricas EM CÓDIGO (top categorias, comparação com
 * a fatura anterior e com a média, % da renda, risco de rotativo) e pede ao
 * Gemini para redigir 3-5 insights. Resiliente: fallback determinístico.
 */
export async function analyzeInvoice(invoiceId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: { include: { category: { select: { name: true } } } },
        card: { select: { id: true, name: true } },
      },
    });
    if (!invoice) return { success: false, error: "Fatura não encontrada." };

    // --- Métricas determinísticas (a IA nunca recalcula) ---
    const total = invoice.totalAmount > 0 ? invoice.totalAmount : invoiceItemsTotal(invoice.items);

    const byCategory: Record<string, number> = {};
    for (const it of invoice.items) {
      if (it.type === "REFUND") continue;
      const name = it.category?.name || "Sem categoria";
      byCategory[name] = (byCategory[name] || 0) + it.amount;
    }
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, amount]) => `${name}: ${fmt(roundMoney(amount))}`);

    // Fatura anterior (competência -1) e média das últimas 3 fechadas.
    const prevComp = shiftCompetence({ month: invoice.referenceMonth, year: invoice.referenceYear }, -1);
    const prev = await prisma.creditCardInvoice.findUnique({
      where: {
        cardId_referenceMonth_referenceYear: {
          cardId: invoice.cardId,
          referenceMonth: prevComp.month,
          referenceYear: prevComp.year,
        },
      },
      select: { totalAmount: true },
    });
    const recent = await prisma.creditCardInvoice.findMany({
      where: { cardId: invoice.cardId, status: { in: ["CLOSED", "PAID", "OVERDUE", "PARTIAL"] }, id: { not: invoice.id } },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
      take: 3,
      select: { totalAmount: true },
    });
    const avgRecent =
      recent.length > 0 ? roundMoney(recent.reduce((a, r) => a + r.totalAmount, 0) / recent.length) : 0;

    // Renda do mês de vencimento (para % da fatura sobre a renda).
    const dueMonthStart = new Date(invoice.dueDate.getFullYear(), invoice.dueDate.getMonth(), 1);
    const dueMonthEnd = new Date(invoice.dueDate.getFullYear(), invoice.dueDate.getMonth() + 1, 1);
    const incomeAgg = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: "INCOME", isTransfer: false, date: { gte: dueMonthStart, lt: dueMonthEnd } },
    });
    const monthlyIncome = incomeAgg._sum.amount ?? 0;

    const outstanding = roundMoney(Math.max(0, total - invoice.paidAmount));
    const incomeShare = monthlyIncome > 0 ? roundMoney((total / monthlyIncome) * 100) : null;

    if (await isAiBudgetExceeded()) {
      return { success: true, insights: FALLBACK };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: true, insights: FALLBACK };

    const monthLabel = `${String(invoice.referenceMonth).padStart(2, "0")}/${invoice.referenceYear}`;
    const context = {
      cartao: invoice.card.name,
      competencia: monthLabel,
      total: fmt(total),
      pago: fmt(invoice.paidAmount),
      emAberto: fmt(outstanding),
      status: invoice.status,
      faturaAnterior: prev ? fmt(prev.totalAmount) : "sem histórico",
      mediaUltimas3: avgRecent > 0 ? fmt(avgRecent) : "sem histórico",
      percentDaRenda: incomeShare !== null ? `${incomeShare}%` : "renda não informada",
      topCategorias: topCategories,
    };

    const prompt = `
Você é um coach financeiro especializado em cartão de crédito brasileiro.
Com base EXCLUSIVAMENTE nos números fornecidos (já calculados — NÃO recalcule nem invente valores),
escreva de 3 a 5 insights curtos, diretos e acionáveis sobre esta fatura.
Aponte riscos (rotativo, fatura acima da média, peso sobre a renda) e oportunidades de economia.

Dados da fatura (JSON):
${JSON.stringify(context, null, 2)}
`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: "Array com 3 a 5 insights curtos em português.",
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

    const parsed = JSON.parse(result.response.text()) as string[];
    const latency = performance.now() - startTime;
    await logAiUsage("Coach Fatura", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    const insights = Array.isArray(parsed) && parsed.length > 0 ? parsed.slice(0, 5) : FALLBACK;
    return { success: true, insights };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Coach Fatura", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    console.error("AI Card Coach Error:", e);
    return { success: true, insights: FALLBACK };
  }
}
