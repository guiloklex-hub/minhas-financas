import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { isAiBudgetExceeded } from "@/lib/ai-budget";

export type ParsedTransaction = {
  amount: number;
  description: string;
  categoryId: string; // Pode vir vazio se newCategory for preenchido
  type: "INCOME" | "EXPENSE";
  newCategory?: {
    name: string;
    color: string;
  };
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

  if (await isAiBudgetExceeded()) {
    status = "BLOCKED";
    errorMessage = "Limite mensal de gasto com IA atingido.";
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
            description: "O ID exato da categoria que melhor se encaixa, ou string vazia se for criar uma nova."
          },
          type: {
            type: SchemaType.STRING,
            description: "Apenas a palavra INCOME para receitas/ganhos, ou EXPENSE para despesas/gastos"
          },
          newCategory: {
            type: SchemaType.OBJECT,
            description: "Preencha APENAS se nenhuma categoria existente fizer sentido. Cria uma nova.",
            properties: {
              name: { type: SchemaType.STRING, description: "Nome curto e direto (ex: Pets, Viagem)" },
              color: { type: SchemaType.STRING, description: "Cor HEX (ex: #10b981)" }
            },
            required: ["name", "color"]
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
Aqui estão as categorias já cadastradas no banco de dados:
${categoriesContext}

Regras estritas para categorias:
1. Sempre priorize usar uma categoria já existente mapeando o ID em "categoryId".
2. Você tem autonomia para criar uma NOVA categoria preenchendo o objeto "newCategory".
3. SÓ crie uma categoria nova se o contexto da transação for muito específico e não se encaixar de jeito nenhum nas opções atuais. Não crie categorias sem motivo. Se criar, deixe "categoryId" como "".

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
  } catch (e) {
    status = "ERROR";
    errorMessage = e instanceof Error ? e.message : "Failed to parse JSON";
    const latency = performance.now() - startTime;
    await logAiUsage("Lançamento Mágico", status, errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    
    console.error("Failed to parse Gemini response:", e);
    throw new Error("Não foi possível entender a transação estruturada.");
  }
}
