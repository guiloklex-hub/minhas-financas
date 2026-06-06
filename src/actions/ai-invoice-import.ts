"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAiUsage } from "@/lib/gemini";
import { isAiBudgetExceeded } from "@/lib/ai-budget";
import { getInvoiceCompetence } from "@/lib/credit-card";
import { ensureInvoice } from "@/lib/credit-card-service";
import { suggestCategoriesForTitles } from "@/lib/categorization";
import { categorizeTitlesWithAi } from "@/lib/ai-categorize";
import {
  sanitizeInvoiceLine,
  dedupKeyCard,
  sourceKey,
  type InvoiceLineType,
} from "@/lib/invoice-import";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type FileMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** Detecta o MIME real via magic bytes (PDF + imagens). */
function detectMime(bytes: Uint8Array): FileMime | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

export type ExtractedInvoiceRow = {
  date: string;
  description: string;
  amount: number;
  type: InvoiceLineType;
  categoryHint: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  fxCurrency: string | null;
  fxAmount: number | null;
  source: string;
  suggestedCategoryId: string | null;
  duplicate: boolean;
};

export type ExtractedSource = {
  key: string;
  label: string;
  lastFour: string | null;
  isVirtual: boolean;
  suggestedVirtualCardId: string | null;
};

export type ExtractResult =
  | {
      success: true;
      invoice: { referenceMonth: number | null; referenceYear: number | null; total: number | null; brand: string | null };
      rows: ExtractedInvoiceRow[];
      sources: ExtractedSource[];
      aiUsed: boolean;
      message?: string;
    }
  | { success: false; error: string };

/**
 * Fase A: lê o PDF/imagem da fatura via Gemini multimodal, transcreve os
 * lançamentos reais (excluindo "próximas faturas"/totais/limites), normaliza em
 * código, deduplica contra o cartão e sugere categorias + mapeamento de cartões
 * virtuais. NÃO grava nada.
 */
export async function extractInvoiceForImport(formData: FormData): Promise<ExtractResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const cardIdRaw = formData.get("cardId");
  if (typeof cardIdRaw !== "string" || cardIdRaw.trim().length === 0) {
    return { success: false, error: "Cartão não informado." };
  }
  const cardId = cardIdRaw.trim();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "Nenhum arquivo enviado." };
  if (file.size > MAX_FILE_SIZE) return { success: false, error: "Arquivo muito grande. O limite é de 10MB." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(new Uint8Array(buffer));
  if (!mime) return { success: false, error: "Arquivo inválido. Envie um PDF ou imagem (JPEG/PNG/WEBP) da fatura." };

  const card = await prisma.creditCard.findUnique({ where: { id: cardId }, select: { id: true } });
  if (!card) return { success: false, error: "Cartão não encontrado." };

  if (await isAiBudgetExceeded()) {
    return { success: false, error: "Import indisponível: limite mensal de IA atingido." };
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "IA não configurada (GEMINI_API_KEY)." };

  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            invoice: {
              type: SchemaType.OBJECT,
              properties: {
                referenceMonth: { type: SchemaType.INTEGER },
                referenceYear: { type: SchemaType.INTEGER },
                total: { type: SchemaType.NUMBER },
                brand: { type: SchemaType.STRING },
              },
            },
            lines: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  date: { type: SchemaType.STRING, description: "Data do lançamento em YYYY-MM-DD." },
                  description: { type: SchemaType.STRING },
                  categoryHint: { type: SchemaType.STRING, description: "A 2ª linha do estabelecimento (categoria Itaú), se houver." },
                  amount: { type: SchemaType.NUMBER, description: "Valor em R$, positivo." },
                  type: { type: SchemaType.STRING, description: "PURCHASE | REFUND | FEE | INTEREST." },
                  installmentNumber: { type: SchemaType.INTEGER },
                  installmentTotal: { type: SchemaType.INTEGER },
                  isInternational: { type: SchemaType.BOOLEAN },
                  fxCurrency: { type: SchemaType.STRING },
                  fxAmount: { type: SchemaType.NUMBER },
                  cardLastFour: { type: SchemaType.STRING, description: "Os 4 dígitos do 'final XXXX' da seção." },
                  isVirtual: { type: SchemaType.BOOLEAN, description: "true se a linha tem o marcador @ (cartão virtual)." },
                },
                required: ["date", "description", "amount", "type"],
              },
            },
          },
          required: ["lines"],
        },
      },
    });

    const prompt = `Você é um leitor de faturas de cartão de crédito do Itaú (Visa/Mastercard).
Transcreva APENAS os lançamentos REAIS desta fatura, como uma lista de objetos.

INCLUA:
- "Lançamentos: compras e saques" (nacionais) — cada compra com data, estabelecimento e valor em R$.
- "Lançamentos internacionais" — use o valor em R$ (não o US$); preencha fxCurrency/fxAmount com a moeda e o valor estrangeiro.
- "Lançamentos: produtos e serviços" (ex.: PIX) e "Outros lançamentos" (IOF, encargos => type FEE; ESTORNO/valor negativo => type REFUND com amount positivo).

EXCLUA (não retorne):
- "Compras parceladas - próximas faturas" (são futuras).
- Linhas de subtotal/total ("Lançamentos no cartão", "Total dos lançamentos atuais", "Total ...").
- Limites de crédito, simulações, encargos informativos do rotativo, textos legais.

REGRAS:
- amount sempre positivo; o type indica a natureza.
- Parcelas no texto do estabelecimento ("03/03", "01/02") => installmentNumber/installmentTotal.
- O Itaú separa por cartão "final XXXX": preencha cardLastFour com esses 4 dígitos da seção da linha.
- Marque isVirtual=true quando a linha tiver o marcador "@" (compra com cartão virtual).
- As datas mostram só DD/MM; converta para YYYY-MM-DD inferindo o ano pela competência/vencimento da fatura (trate a virada dezembro→janeiro).
- Em invoice, traga referenceMonth/referenceYear (competência), total e brand (VISA/MASTERCARD).`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: mime, data: buffer.toString("base64") } },
    ]);

    if (result.response.usageMetadata) {
      promptTokens = result.response.usageMetadata.promptTokenCount;
      completionTokens = result.response.usageMetadata.candidatesTokenCount;
      totalTokens = result.response.usageMetadata.totalTokenCount;
      costUsd = (promptTokens / 1_000_000) * 0.1 + (completionTokens / 1_000_000) * 0.4;
    }

    const parsed = JSON.parse(result.response.text()) as {
      invoice?: { referenceMonth?: number; referenceYear?: number; total?: number; brand?: string };
      lines?: unknown[];
    };

    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.map((l) => sanitizeInvoiceLine(l as Record<string, unknown>)).filter((l): l is NonNullable<typeof l> => l !== null)
      : [];

    const latency = performance.now() - startTime;
    await logAiUsage("Import Fatura", "SUCCESS", null, promptTokens, completionTokens, totalTokens, latency, costUsd);

    if (lines.length === 0) {
      return { success: false, error: "Não consegui ler lançamentos nesta fatura. Tente outro arquivo." };
    }

    // Dedup contra os lançamentos já existentes do cartão.
    const existing = await prisma.creditCardTransaction.findMany({
      where: { cardId },
      select: { date: true, amount: true, title: true },
    });
    const seen = new Set(existing.map((e) => dedupKeyCard(cardId, e.date, e.amount, e.title)));

    // Sugestão de categoria: histórico (grátis) + IA no restante.
    const titles = lines.map((l) => l.description);
    const historyMap = await suggestCategoriesForTitles(titles);
    const remaining = Array.from(new Set(titles.filter((t) => !(historyMap.get(t) ?? null))));
    let aiUsed = false;
    let aiMap = new Map<string, string | null>();
    if (remaining.length > 0) {
      const categories = await prisma.category.findMany({ select: { id: true, name: true } });
      const r = await categorizeTitlesWithAi(remaining, categories);
      aiMap = r.map;
      aiUsed = r.used;
    }

    const rows: ExtractedInvoiceRow[] = lines.map((l) => ({
      date: l.date,
      description: l.description,
      amount: l.amount,
      type: l.type,
      categoryHint: l.categoryHint,
      installmentNumber: l.installmentNumber,
      installmentTotal: l.installmentTotal,
      fxCurrency: l.fxCurrency,
      fxAmount: l.fxAmount,
      source: sourceKey(l),
      suggestedCategoryId: historyMap.get(l.description) ?? aiMap.get(l.description) ?? null,
      duplicate: seen.has(dedupKeyCard(cardId, new Date(l.date), l.amount, l.description)),
    }));

    // Origens distintas (físico/virtuais) com match sugerido por lastFour.
    const virtualCards = await prisma.virtualCard.findMany({
      where: { cardId, archived: false },
      select: { id: true, name: true, lastFour: true },
    });
    const sourcesMap = new Map<string, ExtractedSource>();
    for (const l of lines) {
      const key = sourceKey(l);
      if (sourcesMap.has(key)) continue;
      const isVirtual = key.startsWith("vc:");
      const label =
        key === "PHYSICAL"
          ? "Cartão físico"
          : `${isVirtual ? "Virtual" : "Final"} ${l.cardLastFour ?? "?"}`;
      const suggested = l.cardLastFour ? virtualCards.find((v) => v.lastFour === l.cardLastFour)?.id ?? null : null;
      sourcesMap.set(key, { key, label, lastFour: l.cardLastFour, isVirtual, suggestedVirtualCardId: suggested });
    }

    return {
      success: true,
      invoice: {
        referenceMonth: parsed.invoice?.referenceMonth ?? null,
        referenceYear: parsed.invoice?.referenceYear ?? null,
        total: typeof parsed.invoice?.total === "number" ? parsed.invoice.total : null,
        brand: typeof parsed.invoice?.brand === "string" ? parsed.invoice.brand : null,
      },
      rows,
      sources: Array.from(sourcesMap.values()),
      aiUsed,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    const latency = performance.now() - startTime;
    await logAiUsage("Import Fatura", "ERROR", errorMessage, promptTokens, completionTokens, totalTokens, latency, costUsd);
    console.error("AI Invoice Import Error:", e);
    return { success: false, error: "Não foi possível ler a fatura agora. Tente novamente em instantes." };
  }
}

export type ConfirmInvoiceRow = {
  date: string;
  description: string;
  amount: number;
  type: InvoiceLineType;
  categoryId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  fxCurrency?: string | null;
  fxAmount?: number | null;
  source: string;
  include: boolean;
};

export type SourceTarget = { target: "PHYSICAL" | "NEW" | string; newName?: string };

export type ConfirmInvoiceInput = {
  cardId: string;
  sourceMap: Record<string, SourceTarget>;
  rows: ConfirmInvoiceRow[];
};

/**
 * Fase B: grava os lançamentos revisados como CreditCardTransaction no cartão
 * físico, atribuindo o cartão virtual conforme o mapeamento de origens. Não
 * confia no client: revalida conta/categorias, deduplica e é atômico.
 */
export async function confirmInvoiceImport(
  input: ConfirmInvoiceInput
): Promise<{ success: boolean; count?: number; error?: string; message?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    if (!input || typeof input.cardId !== "string" || !Array.isArray(input.rows)) {
      return { success: false, error: "Dados de importação inválidos." };
    }
    const card = await prisma.creditCard.findUnique({
      where: { id: input.cardId },
      select: { id: true, closingDay: true, dueDay: true },
    });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    const rows = input.rows.filter((r) => r.include);
    if (rows.length === 0) return { success: false, error: "Nenhuma linha selecionada para importar." };
    if (rows.length > 5000) return { success: false, error: "Limite de 5000 linhas por importação." };

    const categories = await prisma.category.findMany({ select: { id: true } });
    const validIds = new Set(categories.map((c) => c.id));

    // Valida cartões virtuais existentes referenciados no sourceMap.
    const existingVcs = await prisma.virtualCard.findMany({ where: { cardId: card.id }, select: { id: true } });
    const validVcIds = new Set(existingVcs.map((v) => v.id));

    const existing = await prisma.creditCardTransaction.findMany({
      where: { cardId: card.id },
      select: { date: true, amount: true, title: true },
    });
    const seen = new Set(existing.map((e) => dedupKeyCard(card.id, e.date, e.amount, e.title)));

    let count = 0;
    let duplicates = 0;

    await prisma.$transaction(async (tx) => {
      // Resolve cada origem -> virtualCardId | null (criando virtuais "NEW").
      const resolved = new Map<string, string | null>();
      for (const [key, target] of Object.entries(input.sourceMap ?? {})) {
        if (!target || target.target === "PHYSICAL") {
          resolved.set(key, null);
        } else if (target.target === "NEW") {
          const created = await tx.virtualCard.create({
            data: { cardId: card.id, name: (target.newName || "Cartão virtual").slice(0, 120) },
            select: { id: true },
          });
          resolved.set(key, created.id);
        } else if (validVcIds.has(target.target)) {
          resolved.set(key, target.target);
        } else {
          throw new Error("INVALID_VC");
        }
      }

      for (const row of rows) {
        const date = new Date(row.date);
        if (Number.isNaN(date.getTime())) continue;
        const amount = Math.abs(Number(row.amount));
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const type: InvoiceLineType =
          row.type === "REFUND" || row.type === "FEE" || row.type === "INTEREST" ? row.type : "PURCHASE";
        const title = (typeof row.description === "string" && row.description.trim() ? row.description.trim() : "Lançamento").slice(0, 200);

        let categoryId: string | null = null;
        if (row.categoryId) {
          if (!validIds.has(row.categoryId)) throw new Error("INVALID_CATEGORY");
          categoryId = row.categoryId;
        }

        const key = dedupKeyCard(card.id, date, amount, title);
        if (seen.has(key)) { duplicates++; continue; }
        seen.add(key);

        const competence = getInvoiceCompetence(date, card.closingDay);
        const invoiceId = await ensureInvoice(tx, card, competence);
        const virtualCardId = resolved.has(row.source) ? resolved.get(row.source)! : null;

        await tx.creditCardTransaction.create({
          data: {
            cardId: card.id,
            title,
            amount,
            date,
            type,
            categoryId,
            invoiceId,
            virtualCardId,
            installmentNumber: row.installmentNumber ?? null,
            installmentTotal: row.installmentTotal ?? null,
            fxCurrency: row.fxCurrency ?? null,
            fxAmount: row.fxAmount ?? null,
          },
        });
        count++;
      }
    });

    revalidatePath("/");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${card.id}`);
    revalidatePath("/transacoes");
    revalidatePath("/insights");
    const dup = duplicates > 0 ? ` ${duplicates} ignorada(s) (duplicadas).` : "";
    return { success: true, count, message: `${count} lançamento(s) importado(s).${dup}` };
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_CATEGORY") {
      return { success: false, error: "Categoria inválida em uma das linhas." };
    }
    if (e instanceof Error && e.message === "INVALID_VC") {
      return { success: false, error: "Cartão virtual inválido no mapeamento." };
    }
    console.error("Erro ao confirmar import de fatura:", e);
    return { success: false, error: "Erro ao importar os lançamentos." };
  }
}
