"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { suggestCategoriesForTitles } from "@/lib/categorization";
import { categorizeTitlesWithAi } from "@/lib/ai-categorize";
import { sanitizeInvoiceLine, dedupKeyCard, sourceKey } from "@/lib/invoice-import";
import {
  parseCsvLine,
  detectCsvLayout,
  mapCsvRowToRawLine,
} from "@/lib/card-csv-import";
import type {
  ExtractResult,
  ExtractedInvoiceRow,
  ExtractedSource,
} from "@/actions/ai-invoice-import";

// Fase B reaproveitada inteira do import por IA (gravação genérica).
export { confirmInvoiceImport } from "@/actions/ai-invoice-import";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_LINES = 5000;

/**
 * Fase A do import por CSV: lê o arquivo, normaliza cada linha (reaproveitando
 * sanitizeInvoiceLine do import por IA), deduplica contra o cartão e sugere
 * categorias (histórico grátis + IA no restante) + mapeamento de cartões
 * virtuais. NÃO grava nada — devolve o mesmo shape do import por IA para que a
 * Fase B (confirmInvoiceImport) seja idêntica.
 */
export async function analyzeCardCsvForImport(formData: FormData): Promise<ExtractResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const cardIdRaw = formData.get("cardId");
    if (typeof cardIdRaw !== "string" || cardIdRaw.trim().length === 0) {
      return { success: false, error: "Cartão não informado." };
    }
    const cardId = cardIdRaw.trim();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "Nenhum arquivo enviado." };
    if (file.size > MAX_FILE_SIZE) return { success: false, error: "Arquivo muito grande. O limite é de 2MB." };
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !file.type.includes("csv") && !file.type.includes("text")) {
      return { success: false, error: "Formato inválido. Envie um arquivo .csv." };
    }

    const card = await prisma.creditCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) return { success: false, error: "Cartão não encontrado." };

    const text = await file.text();
    let lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    let truncated = false;
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      truncated = true;
    }
    if (lines.length === 0) {
      return { success: false, error: "Arquivo vazio. Use o formato: Data,Descrição,Valor[,Tipo,Parcela,Cartão]" };
    }

    const firstCols = parseCsvLine(lines[0]);
    const { layout, hasHeader } = detectCsvLayout(firstCols);
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsed = dataLines
      .map((l) => mapCsvRowToRawLine(parseCsvLine(l), layout))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((r) => sanitizeInvoiceLine(r))
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (parsed.length === 0) {
      return { success: false, error: "Nenhum lançamento válido encontrado. Use o formato: Data,Descrição,Valor[,Tipo,Parcela,Cartão]" };
    }

    // Dedup contra os lançamentos já existentes do cartão.
    const existing = await prisma.creditCardTransaction.findMany({
      where: { cardId },
      select: { date: true, amount: true, title: true },
    });
    const seen = new Set(existing.map((e) => dedupKeyCard(cardId, e.date, e.amount, e.title)));

    // Sugestão de categoria: histórico (grátis) + IA no restante.
    const titles = parsed.map((l) => l.description);
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

    const rows: ExtractedInvoiceRow[] = parsed.map((l) => ({
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
    for (const l of parsed) {
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

    const parts: string[] = [];
    if (truncated) parts.push(`Arquivo truncado em ${MAX_LINES} linhas.`);
    if (!aiUsed && remaining.length > 0) parts.push("IA de categorização indisponível — ajuste as categorias manualmente.");

    return {
      success: true,
      invoice: { referenceMonth: null, referenceYear: null, total: null, brand: null },
      rows,
      sources: Array.from(sourcesMap.values()),
      aiUsed,
      message: parts.join(" ") || undefined,
    };
  } catch (e) {
    console.error("Erro ao analisar CSV do cartão:", e);
    return { success: false, error: "Erro ao analisar o arquivo CSV." };
  }
}
