"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { roundMoney } from "@/lib/money";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export type ReceiptData = {
  amount: number | null;
  date: string | null; // YYYY-MM-DD, quando detectado
  title: string | null;
};

type ReceiptResult =
  | { success: true; data: ReceiptData }
  | { success: false; error: string };

/**
 * Detecta o MIME real a partir dos magic bytes do arquivo.
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47
 * - WEBP: "RIFF" (0..3) E "WEBP" (8..11) — checar os dois evita falsos
 *   positivos com AVI/WAV, que também começam com RIFF.
 */
function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Lê uma imagem de comprovante e extrai {amount, date, title} via Gemini
 * multimodal. NÃO cria nenhuma transação — apenas devolve os dados para o
 * usuário CONFIRMAR na interface.
 *
 * PRINCÍPIO: a IA lê a imagem e transcreve os campos; o app valida formato e
 * arredonda o valor. Qualquer falha resulta em fallback resiliente (erro
 * amigável), nunca em exceção que quebre a tela.
 */
export async function parseReceiptImage(formData: FormData): Promise<ReceiptResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Nenhuma imagem enviada." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "Imagem muito grande. O limite é de 5MB." };
  }
  // Valida o type declarado contra a allowlist (image/*).
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Formato inválido. Envie uma imagem (JPEG, PNG ou WEBP)." };
  }

  // Valida o MIME real via magic bytes.
  const buffer = Buffer.from(await file.arrayBuffer());
  const realMime = detectImageMime(new Uint8Array(buffer));
  if (!realMime) {
    return {
      success: false,
      error: "Arquivo não reconhecido como imagem válida (JPEG, PNG ou WEBP).",
    };
  }

  // Guardrail de custo.
  if (await isAiBudgetExceeded()) {
    return {
      success: false,
      error: "Leitor de comprovantes indisponível: limite mensal de IA atingido.",
    };
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
              description: "Valor TOTAL do comprovante, positivo (ex.: 49.90). 0 se não encontrar.",
            },
            date: {
              type: SchemaType.STRING,
              description: "Data do comprovante no formato YYYY-MM-DD. String vazia se não encontrar.",
            },
            title: {
              type: SchemaType.STRING,
              description: "Nome do estabelecimento/descrição curta. String vazia se não encontrar.",
            },
          },
          required: ["amount", "date", "title"],
        },
      },
    });

    const prompt = `Você é um leitor de comprovantes e notas fiscais. Analise a imagem e extraia:
- amount: o VALOR TOTAL pago (número positivo, use ponto como separador decimal).
- date: a data da compra no formato YYYY-MM-DD.
- title: o nome do estabelecimento ou uma descrição curta.

Transcreva apenas o que estiver visível na imagem. Não invente dados: se um campo não for legível, devolva 0 (amount) ou string vazia (date/title).`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: realMime, data: buffer.toString("base64") } },
    ]);

    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
    }

    const parsed = JSON.parse(result.response.text()) as {
      amount?: number;
      date?: string;
      title?: string;
    };

    const rawAmount = Number(parsed.amount);
    const amount =
      Number.isFinite(rawAmount) && rawAmount > 0 ? roundMoney(Math.abs(rawAmount)) : null;

    const rawDate = typeof parsed.date === "string" ? parsed.date.trim() : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(new Date(rawDate).getTime())
      ? rawDate
      : null;

    const rawTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const title = rawTitle.length > 0 ? rawTitle.slice(0, 120) : null;

    const latency = performance.now() - startTime;
    await logAiUsage(
      "Leitor de Comprovante",
      "SUCCESS",
      null,
      promptTokens,
      completionTokens,
      totalTokens,
      latency,
      costUsd
    );

    return { success: true, data: { amount, date, title } };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    const latency = performance.now() - startTime;
    await logAiUsage(
      "Leitor de Comprovante",
      "ERROR",
      errorMessage,
      promptTokens,
      completionTokens,
      totalTokens,
      latency,
      costUsd
    );
    console.error("AI Receipt Error:", e);
    return {
      success: false,
      error: "Não foi possível ler o comprovante agora. Tente novamente em instantes.",
    };
  }
}
