"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/money";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { detectAnomalies, type Anomaly } from "@/lib/anomaly";
import { forecastCashFlow, type ForecastPoint } from "@/lib/forecast";
import type { MonthlyInsight } from "@/generated/prisma/client";

/** Métricas determinísticas que embasam (e nunca dependem de) a narração da IA. */
export type InsightMetrics = {
  month: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  net: number;
  anomalies: Anomaly[];
  forecast: ForecastPoint[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Calcula, 100% em código, as métricas do mês/ano: totais de receita/despesa
 * (excluindo transferências), saldo, anomalias por categoria e projeção de
 * caixa. A IA jamais produz números — apenas redige texto sobre eles.
 */
async function computeMetrics(month: number, year: number): Promise<InsightMetrics> {
  // UTC para casar com as datas das transações (meia-noite UTC).
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const transactions = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      date: { gte: startDate, lte: endDate },
    },
  });

  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.type === "INCOME") income += tx.amount;
    else if (tx.type === "EXPENSE") expense += tx.amount;
  }

  const totalIncome = roundMoney(income);
  const totalExpense = roundMoney(expense);

  // Âncora no fim do mês de referência para que anomalias/forecast usem a janela
  // correta mesmo quando o resumo é gerado para um mês passado.
  const anchor = endDate;
  const [anomalies, forecast] = await Promise.all([
    detectAnomalies(anchor),
    forecastCashFlow(3, anchor),
  ]);

  return {
    month,
    year,
    totalIncome,
    totalExpense,
    net: roundMoney(totalIncome - totalExpense),
    anomalies,
    forecast,
  };
}

/**
 * Monta um resumo textual determinístico a partir das métricas. Usado como
 * fallback quando a IA está desligada, estourou o budget ou falhou — a tela
 * nunca fica sem conteúdo.
 */
function buildFallbackSummary(metrics: InsightMetrics): string {
  const monthLabel = MONTH_NAMES[metrics.month - 1] ?? `mês ${metrics.month}`;
  const parts: string[] = [];

  const netVerb = metrics.net >= 0 ? "saldo positivo" : "saldo negativo";
  parts.push(
    `Em ${monthLabel} de ${metrics.year}, você recebeu ${formatCurrency(metrics.totalIncome)} ` +
      `e gastou ${formatCurrency(metrics.totalExpense)}, resultando em ${netVerb} de ` +
      `${formatCurrency(metrics.net)}.`
  );

  if (metrics.anomalies.length > 0) {
    const top = metrics.anomalies[0];
    parts.push(
      `Atenção: a categoria "${top.name}" subiu ${top.deltaPct.toFixed(0)}% acima da média ` +
        `(${formatCurrency(top.currentAmount)} contra média de ${formatCurrency(top.average)}).`
    );
  } else {
    parts.push("Nenhuma categoria apresentou gasto fora do padrão neste mês.");
  }

  const next = metrics.forecast[0];
  if (next) {
    const tendency = next.projectedNet >= 0 ? "sobra" : "déficit";
    parts.push(
      `Para ${next.month}, a projeção indica ${tendency} de ${formatCurrency(Math.abs(next.projectedNet))} ` +
        `(receita ${formatCurrency(next.projectedIncome)} x despesa ${formatCurrency(next.projectedExpense)}).`
    );
  }

  return parts.join(" ");
}

/** Pede ao Gemini um resumo curto narrando as métricas já calculadas. */
async function requestAiSummary(metrics: InsightMetrics): Promise<string> {
  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");

    const anomaliesText =
      metrics.anomalies.length > 0
        ? metrics.anomalies
            .map(
              (a) =>
                `${a.name}: ${formatCurrency(a.currentAmount)} (média ${formatCurrency(a.average)}, +${a.deltaPct.toFixed(0)}%)`
            )
            .join("; ")
        : "nenhuma";

    const forecastText =
      metrics.forecast.length > 0
        ? metrics.forecast
            .map((f) => `${f.month}: líquido ${formatCurrency(f.projectedNet)}`)
            .join("; ")
        : "indisponível";

    const prompt = `
Você é um analista financeiro. Escreva um resumo curto (2 a 4 frases), em português do Brasil,
tom direto e profissional, narrando os números abaixo. NÃO invente números nem recalcule nada:
use exatamente os valores fornecidos. Não use markdown nem listas.

Mês de referência: ${metrics.month}/${metrics.year}
Receitas: ${formatCurrency(metrics.totalIncome)}
Despesas: ${formatCurrency(metrics.totalExpense)}
Saldo do mês: ${formatCurrency(metrics.net)}
Categorias com gasto fora do padrão: ${anomaliesText}
Projeção dos próximos meses: ${forecastText}
`;

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

    const text = result.response.text().trim();
    if (!text) throw new Error("Resposta vazia da IA.");

    const latency = performance.now() - startTime;
    await logAiUsage("Resumo Mensal", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    return text;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Resumo Mensal", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    throw e;
  }
}

/**
 * Gera (ou regenera) o resumo mensal: calcula as métricas em código, tenta uma
 * narração da IA quando há chave e o budget não estourou, e persiste tudo em
 * MonthlyInsight (upsert por month/year). Em qualquer falha de IA, cai para o
 * resumo determinístico. Sempre registra uso de IA quando a IA é acionada.
 */
export async function generateMonthlyInsight(month: number, year: number) {
  const session = await getSession();
  if (!session) return { success: false as const, error: "Não autorizado. Faça login novamente." };

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { success: false as const, error: "Mês inválido." };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { success: false as const, error: "Ano inválido." };
  }

  try {
    const metrics = await computeMetrics(month, year);

    let summary: string;
    let usedAi = false;

    const budgetExceeded = await isAiBudgetExceeded();
    const hasKey = Boolean(process.env.GEMINI_API_KEY);

    if (hasKey && !budgetExceeded) {
      try {
        summary = await requestAiSummary(metrics);
        usedAi = true;
      } catch {
        // Fallback determinístico — nunca quebra a tela.
        summary = buildFallbackSummary(metrics);
      }
    } else {
      summary = buildFallbackSummary(metrics);
    }

    const payload = JSON.stringify({ ...metrics, usedAi });

    const insight = await prisma.monthlyInsight.upsert({
      where: { month_year: { month, year } },
      create: { month, year, summary, payload },
      update: { summary, payload },
    });

    revalidatePath("/insights");

    return { success: true as const, insight, usedAi };
  } catch (e) {
    console.error("generateMonthlyInsight error:", e);
    return { success: false as const, error: "Não foi possível gerar o resumo do mês." };
  }
}

/** Retorna o resumo mensal mais recente (por ano/mês), ou null. */
export async function getLatestMonthlyInsight(): Promise<MonthlyInsight | null> {
  await getSession();
  return prisma.monthlyInsight.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

/** Lista todos os resumos mensais, do mais recente para o mais antigo. */
export async function getMonthlyInsights(): Promise<MonthlyInsight[]> {
  await getSession();
  return prisma.monthlyInsight.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}
