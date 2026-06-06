"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { roundMoney } from "@/lib/money";
import { reconcileInvoice, type ReconcileResult } from "@/lib/invoice-reconcile";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type OcrResult =
  | { success: true; result: ReconcileResult }
  | { success: false; error: string };

/** Detecta o MIME real via magic bytes (JPEG/PNG/WEBP). */
function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

/**
 * Lê a foto de uma fatura de cartão, extrai as linhas (descrição + valor) via
 * Gemini multimodal e CONCILIA em código contra os lançamentos já registrados na
 * fatura selecionada. Não grava nada — apenas devolve o relatório de divergências
 * para o usuário revisar. Resiliente: falha de IA vira erro amigável.
 */
export async function reconcileInvoiceImage(formData: FormData): Promise<OcrResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const invoiceIdRaw = formData.get("invoiceId");
  if (typeof invoiceIdRaw !== "string" || invoiceIdRaw.trim().length === 0) {
    return { success: false, error: "Fatura não informada." };
  }
  const invoiceId = invoiceIdRaw.trim();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Nenhuma imagem enviada." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "Imagem muito grande. O limite é de 5MB." };
  }
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "Formato inválido. Envie uma imagem (JPEG, PNG ou WEBP)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const realMime = detectImageMime(new Uint8Array(buffer));
  if (!realMime) {
    return { success: false, error: "Arquivo não reconhecido como imagem válida (JPEG, PNG ou WEBP)." };
  }

  if (await isAiBudgetExceeded()) {
    return { success: false, error: "Conciliação indisponível: limite mensal de IA atingido." };
  }

  const invoice = await prisma.creditCardInvoice.findUnique({
    where: { id: invoiceId },
    include: { items: { select: { id: true, title: true, amount: true, type: true } } },
  });
  if (!invoice) return { success: false, error: "Fatura não encontrada." };

  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");

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
              description: { type: SchemaType.STRING },
              amount: { type: SchemaType.NUMBER },
            },
            required: ["description", "amount"],
          },
          description: "Lista de lançamentos da fatura (descrição + valor positivo).",
        },
      },
    });

    const prompt = `Você é um leitor de faturas de cartão de crédito. Analise a imagem e transcreva
CADA lançamento como um objeto { description, amount }, com amount positivo (ponto decimal).
Ignore linhas de total, pagamento, juros e encargos. Transcreva apenas o que estiver visível.`;

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

    const parsed = JSON.parse(result.response.text()) as Array<{ description?: string; amount?: number }>;
    const extracted = (Array.isArray(parsed) ? parsed : [])
      .map((l) => ({ description: (l.description || "").trim(), amount: Number(l.amount) }))
      .filter((l) => l.description.length > 0 && Number.isFinite(l.amount) && l.amount > 0)
      .map((l) => ({ description: l.description, amount: roundMoney(l.amount) }));

    // Concilia contra as compras lançadas (ignora estornos/juros/taxas/anuidade).
    const booked = invoice.items
      .filter((i) => i.type === "PURCHASE")
      .map((i) => ({ id: i.id, title: i.title, amount: i.amount }));

    const reconciled = reconcileInvoice(extracted, booked);

    const latency = performance.now() - startTime;
    await logAiUsage("Conciliação Fatura", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    return { success: true, result: reconciled };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Erro desconhecido";
    const latency = performance.now() - startTime;
    await logAiUsage("Conciliação Fatura", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    console.error("AI Invoice OCR Error:", e);
    return { success: false, error: "Não foi possível ler a fatura agora. Tente novamente em instantes." };
  }
}
