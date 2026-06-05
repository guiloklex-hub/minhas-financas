import { prisma } from "@/lib/prisma"

/**
 * Quantas transações do histórico carregamos para aprender o padrão de
 * categorização. É um limite de segurança: para finanças single-user esse
 * volume é mais que suficiente e mantém a operação barata (uma query, em
 * memória, sem custo de IA).
 */
const HISTORY_LIMIT = 5000;

/**
 * Tamanho mínimo de um token para ser considerado "significativo".
 * Tokens curtos (preposições/artigos como "de", "da", "no", "e") geram ruído
 * e casariam com praticamente qualquer título, então são descartados.
 */
const MIN_TOKEN_LENGTH = 3;

/**
 * Normaliza um título para comparação determinística:
 * - minúsculas;
 * - remove acentos (decompõe em NFD e tira os diacríticos combinantes);
 * - remove dígitos e pontuação (mantém apenas letras e espaços);
 * - colapsa espaços repetidos e apara as pontas.
 *
 * Ex.: "Pão de Açúcar #1234" -> "pao de acucar".
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    // Remove os diacríticos (faixa de combining marks do Unicode, U+0300–U+036F).
    .replace(/[̀-ͯ]/g, "")
    // Tudo que não for letra (a-z) ou espaço vira espaço — remove dígitos e pontuação.
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai os tokens significativos de um título já normalizado.
 * Mantém apenas tokens com comprimento >= MIN_TOKEN_LENGTH e remove
 * duplicatas (a contagem de frequência é por correspondência de transação,
 * não por repetição de token dentro do mesmo título).
 */
function significantTokens(normalized: string): string[] {
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(t => t.length >= MIN_TOKEN_LENGTH);
  return Array.from(new Set(tokens));
}

/**
 * Decide se dois títulos normalizados são "parecidos" o bastante para que a
 * categoria de um sirva de sugestão para o outro. O critério é determinístico:
 *
 * 1. Se um título normalizado contém o outro como substring (ex.: "uber" em
 *    "uber trip help"), consideramos correspondência.
 * 2. Caso contrário, exigimos sobreposição de pelo menos um token
 *    significativo (>= 3 letras) entre os dois.
 *
 * Não há IA nem heurística estocástica: mesmos inputs -> mesma decisão.
 */
function titlesMatch(
  targetNormalized: string,
  targetTokens: Set<string>,
  candidateNormalized: string,
  candidateTokens: string[],
): boolean {
  if (!targetNormalized || !candidateNormalized) return false;

  // Substring em qualquer direção (cobre prefixos/sufixos e títulos contidos).
  if (
    candidateNormalized.includes(targetNormalized) ||
    targetNormalized.includes(candidateNormalized)
  ) {
    return true;
  }

  // Sobreposição de ao menos um token significativo.
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) return true;
  }

  return false;
}

/**
 * Dado um conjunto de transações do histórico (título + categoria), retorna o
 * categoryId mais frequente entre as que casam com o título alvo. Empate é
 * resolvido de forma estável pela primeira categoria a atingir a contagem
 * máxima na ordem de iteração do histórico (que vem ordenado por data desc).
 *
 * Retorna null se nada casar.
 */
function mostFrequentCategoryForTitle(
  title: string,
  history: Array<{ title: string; categoryId: string }>,
): string | null {
  const targetNormalized = normalizeTitle(title);
  if (!targetNormalized) return null;

  const targetTokens = new Set(significantTokens(targetNormalized));

  const counts = new Map<string, number>();
  let bestCategoryId: string | null = null;
  let bestCount = 0;

  for (const row of history) {
    const candidateNormalized = normalizeTitle(row.title);
    const candidateTokens = significantTokens(candidateNormalized);

    if (!titlesMatch(targetNormalized, targetTokens, candidateNormalized, candidateTokens)) {
      continue;
    }

    const next = (counts.get(row.categoryId) ?? 0) + 1;
    counts.set(row.categoryId, next);

    // Atualiza o vencedor apenas quando supera estritamente o atual, mantendo
    // o desempate estável (primeiro a alcançar a contagem máxima).
    if (next > bestCount) {
      bestCount = next;
      bestCategoryId = row.categoryId;
    }
  }

  return bestCategoryId;
}

/**
 * Carrega um conjunto recente do histórico de transações (título + categoria)
 * para alimentar a categorização aprendida. Uma única query, limitada e
 * ordenada por data desc para priorizar o comportamento mais atual.
 */
async function loadHistory(): Promise<Array<{ title: string; categoryId: string }>> {
  return prisma.transaction.findMany({
    select: { title: true, categoryId: true },
    orderBy: { date: "desc" },
    take: HISTORY_LIMIT,
  });
}

/**
 * Sugere o categoryId para um título com base no histórico de transações já
 * categorizadas. Determinístico e sem custo de IA: normaliza o título, busca
 * transações cujo título compartilhe tokens significativos (ou seja substring)
 * e retorna a categoria MAIS FREQUENTE entre as correspondências.
 *
 * Retorna null se o título for vazio após normalização ou se nada casar.
 */
export async function suggestCategoryIdByHistory(title: string): Promise<string | null> {
  const targetNormalized = normalizeTitle(title);
  if (!targetNormalized) return null;

  const history = await loadHistory();
  return mostFrequentCategoryForTitle(title, history);
}

/**
 * Versão em lote de suggestCategoryIdByHistory: carrega o histórico UMA única
 * vez e resolve a sugestão para cada título informado. Ideal para o importador
 * de CSV, que precisa categorizar muitas linhas sem repetir a query.
 *
 * Retorna um Map título -> categoryId sugerido (ou null). Títulos repetidos no
 * input compartilham a mesma chave no Map (chaveado pelo título original).
 */
export async function suggestCategoriesForTitles(
  titles: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (titles.length === 0) return result;

  const history = await loadHistory();

  for (const title of titles) {
    if (result.has(title)) continue;
    result.set(title, mostFrequentCategoryForTitle(title, history));
  }

  return result;
}
