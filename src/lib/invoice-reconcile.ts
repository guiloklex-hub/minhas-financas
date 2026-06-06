import { roundMoney } from "./money";
import { normalizeTitle } from "./categorization";

/**
 * Conciliação determinística (sem IA) entre as linhas extraídas de uma fatura
 * física (foto/PDF lido pela IA) e os lançamentos já registrados no app. A IA só
 * transcreve as linhas; a comparação acontece aqui, em código.
 */

export type ExtractedLine = { description: string; amount: number };
export type BookedLine = { id: string; title: string; amount: number };

export type ReconcileResult = {
  matched: Array<{ description: string; amount: number; bookedId: string }>;
  missingInApp: ExtractedLine[]; // na fatura física, mas não lançado no app
  extraInApp: BookedLine[]; // lançado no app, mas ausente na fatura física
};

const AMOUNT_TOLERANCE = 0.01;

/** Casa por valor (±0,01); em empate de valor, prefere título mais parecido. */
export function reconcileInvoice(
  extracted: ExtractedLine[],
  booked: BookedLine[]
): ReconcileResult {
  const remaining = booked.map((b) => ({ ...b, normalized: normalizeTitle(b.title) }));
  const usedIds = new Set<string>();
  const matched: ReconcileResult["matched"] = [];
  const missingInApp: ExtractedLine[] = [];

  for (const line of extracted) {
    const target = roundMoney(line.amount);
    const lineNorm = normalizeTitle(line.description);

    // Candidatos com valor dentro da tolerância e ainda não usados.
    const candidates = remaining.filter(
      (b) => !usedIds.has(b.id) && Math.abs(roundMoney(b.amount) - target) <= AMOUNT_TOLERANCE
    );

    if (candidates.length === 0) {
      missingInApp.push({ description: line.description, amount: target });
      continue;
    }

    // Desempate por similaridade de título (substring/token), senão o primeiro.
    const best =
      candidates.find(
        (b) =>
          b.normalized &&
          lineNorm &&
          (b.normalized.includes(lineNorm) || lineNorm.includes(b.normalized))
      ) ?? candidates[0];

    usedIds.add(best.id);
    matched.push({ description: line.description, amount: target, bookedId: best.id });
  }

  const extraInApp = booked.filter((b) => !usedIds.has(b.id));
  return { matched, missingInApp, extraInApp };
}
