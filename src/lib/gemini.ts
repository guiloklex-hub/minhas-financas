import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";

export type ParsedTransaction = {
  amount: number;
  description: string;
  categoryId: string;
  type: "INCOME" | "EXPENSE";
};

export async function logAiUsage(feature: string, status: string, errorMessage: string | null, promptTokens: number, completionTokens: number, totalTokens: number, latencyMs: number, costUsd: number) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        feature,
        status,
        errorMessage,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs: Math.round(latencyMs),
        costUsd
      }
    });
  } catch (e) {
    console.error("Failed to log AI usage:", e);
  }
}

export async function parseTransactionText(
  text: string,
  categories: { id: string; name: string }[]
): Promise<ParsedTransaction> {
  const startTime = performance.now();
  let status = "SUCCESS";
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    status = "ERROR";
    errorMessage = "GEMINI_API_KEY não configurada.";
    await logAiUsage("Lançamento Mágico", status, errorMessage, 0, 0, 0, performance.now() - startTime, 0);
    throw new Error(errorMessage);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          amount: {
            type: SchemaType.NUMBER,
            description: "Valor numérico da transação sempre positivo (ex: 50.00)"
          },
          description: {
            type: SchemaType.STRING,
            description: "Descrição limpa e profissional do gasto ou receita"
          },
          categoryId: {
            type: SchemaType.STRING,
            description: "O ID exato da categoria que melhor se encaixa"
          },
          type: {
            type: SchemaType.STRING,
            description: "Apenas a palavra INCOME para receitas/ganhos, ou EXPENSE para despesas/gastos"
          }
        },
        required: ["amount", "description", "categoryId", "type"]
      }
    }
  });

  const categoriesContext = categories
    .map(c => `ID: ${c.id} - Nome: ${c.name}`)
    .join("\n");

  const prompt = `
Você é um interpretador financeiro. Sua tarefa é ler o texto do usuário e extrair os dados para estruturar uma transação.
Aqui estão as categorias disponíveis no banco de dados:
${categoriesContext}

Se não encontrar uma categoria perfeita, escolha a que mais se aproxima ou lance na mais genérica.

Texto do usuário: "${text}"
`;

  try {
    const result = await model.generateContent(prompt);
    
    // Telemetry capture
    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      // Cost: $0.1 per 1M prompt, $0.4 per 1M completion
      costUsd = (promptTokens / 1_000_000 * 0.1) + (completionTokens / 1_000_000 * 0.4);
    }

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText) as ParsedTransaction;
    
    const latency = performance.now() - startTime;
    await logAiUsage("Lançamento Mágico", status, null, promptTokens, completionTokens, totalTokens, latency, costUsd);
    
    return parsed;
  } catch (e: any) {
    status = "ERROR";
    errorMessage = e.message || "Failed to parse JSON";
    const latency = performance.now() - startTime;
    await logAiUsage("Lançamento Mágico", status, errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    
    console.error("Failed to parse Gemini response:", e);
    throw new Error("Não foi possível entender a transação estruturada.");
  }
}
