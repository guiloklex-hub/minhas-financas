import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { normalizeTitle } from "@/lib/categorization";

/**
 * Categorização em lote por IA para o importador de CSV. A IA escolhe apenas
 * entre categorias EXISTENTES (não cria novas); valores/datas são tratados em
 * código. Resiliente: sem chave/orçamento ou em falha, retorna o que conseguiu
 * (o caller cai no fallback determinístico).
 */

type RawAiItem = { title?: string; categoryId?: string };

// Quantos títulos por chamada ao modelo (limita tokens e melhora confiabilidade).
const CHUNK_SIZE = 80;

/**
 * Filtra a resposta crua da IA: descarta categoryId que não existe (a IA pode
 * alucinar um id) e casa cada título pedido com a sugestão pelo título
 * normalizado. Função PURA — base dos testes.
 */
export function sanitizeAiCategoryMap(
  raw: RawAiItem[],
  validIds: Set<string>,
  requestedTitles: string[]
): Map<string, string | null> {
  const byNormalized = new Map<string, string>();
  for (const item of raw) {
    const id = typeof item.categoryId === "string" ? item.categoryId.trim() : "";
    const title = typeof item.title === "string" ? item.title : "";
    if (!id || !validIds.has(id)) continue;
    const norm = normalizeTitle(title);
    if (!norm) continue;
    if (!byNormalized.has(norm)) byNormalized.set(norm, id);
  }

  const result = new Map<string, string | null>();
  for (const t of requestedTitles) {
    result.set(t, byNormalized.get(normalizeTitle(t)) ?? null);
  }
  return result;
}

/** Divide um array em pedaços de tamanho fixo. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Sugere categorias (apenas IDs existentes) para uma lista de títulos via Gemini.
 * Retorna `used: false` quando a IA não rodou (sem chave ou orçamento estourado).
 */
export async function categorizeTitlesWithAi(
  titles: string[],
  categories: { id: string; name: string }[]
): Promise<{ map: Map<string, string | null>; used: boolean }> {
  const uniqueTitles = Array.from(new Set(titles.filter((t) => t && t.trim().length > 0)));
  const empty = new Map<string, string | null>();

  if (uniqueTitles.length === 0 || categories.length === 0) {
    return { map: empty, used: false };
  }
  if (await isAiBudgetExceeded()) {
    return { map: empty, used: false };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { map: empty, used: false };
  }

  const validIds = new Set(categories.map((c) => c.id));
  const categoriesContext = categories.map((c) => `ID: ${c.id} - Nome: ${c.name}`).join("\n");

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
            title: { type: SchemaType.STRING, description: "O título exatamente como recebido." },
            categoryId: {
              type: SchemaType.STRING,
              description: "O ID da categoria existente que melhor se encaixa, ou string vazia se nenhuma servir.",
            },
          },
          required: ["title", "categoryId"],
        },
      },
    },
  });

  const merged = new Map<string, string | null>();

  for (const part of chunk(uniqueTitles, CHUNK_SIZE)) {
    const startTime = performance.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;

    const prompt = `Você é um classificador financeiro. Para CADA título de transação abaixo,
escolha o ID da categoria existente que melhor se encaixa. Use SOMENTE os IDs listados.
Se nenhuma categoria fizer sentido, devolva categoryId como string vazia ("").
Não invente IDs nem crie categorias novas.

Categorias existentes:
${categoriesContext}

Títulos (um por linha):
${part.join("\n")}`;

    try {
      const result = await model.generateContent(prompt);
      if (result.response.usageMetadata) {
        promptTokens = result.response.usageMetadata.promptTokenCount;
        completionTokens = result.response.usageMetadata.candidatesTokenCount;
        totalTokens = result.response.usageMetadata.totalTokenCount;
        costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
      }

      const parsed = JSON.parse(result.response.text()) as RawAiItem[];
      const sanitized = sanitizeAiCategoryMap(Array.isArray(parsed) ? parsed : [], validIds, part);
      for (const [title, id] of sanitized) merged.set(title, id);

      const latency = performance.now() - startTime;
      await logAiUsage("Categorização CSV", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      const latency = performance.now() - startTime;
      await logAiUsage("Categorização CSV", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
      console.error("AI Categorize Error:", e);
      // Mantém os títulos do chunk sem sugestão (null) e segue.
    }
  }

  return { map: merged, used: true };
}
