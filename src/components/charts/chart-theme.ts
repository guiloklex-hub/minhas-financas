/**
 * Tema compartilhado dos gráficos (Recharts). Usa CSS variables dos tokens
 * semânticos para acompanhar tema claro/escuro automaticamente. Os componentes
 * de gráfico são "burros": renderizam só o gráfico; card + título vêm da página.
 */

export const CHART_COLORS = {
  income: "var(--income)",
  expense: "var(--expense)",
  net: "#3b82f6",
  committed: "#7c3aed",
} as const;

/** Paleta de fallback para categorias sem cor definida. */
export const CATEGORY_PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f43f5e", "#84cc16", "#06b6d4", "#a855f7",
];

/** Cor neutra para a fatia agregada "Outros". */
export const OTHERS_COLOR = "#52525b";

/** Props comuns de eixo/grid (CSS vars trocam com o tema). */
export const axisStroke = "var(--muted)";
export const gridStroke = "var(--border)";

/** Estilo do tooltip do Recharts (theme-aware). */
export const tooltipContentStyle: React.CSSProperties = {
  backgroundColor: "var(--popover)",
  borderColor: "var(--border)",
  color: "var(--popover-foreground)",
  borderRadius: "8px",
  fontSize: "0.8125rem",
};

export const tooltipItemStyle: React.CSSProperties = { color: "var(--popover-foreground)" };
export const tooltipLabelStyle: React.CSSProperties = { color: "var(--muted)" };

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatBRLCompact(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export type PieSlice = { name: string; value: number; color: string };

/**
 * Agrega fatias pequenas em "Outros" para uma legenda/pizza limpa: mantém as
 * `maxSlices - 1` maiores e soma o resto numa fatia "Outros". Pura/testável.
 */
export function aggregatePie(data: PieSlice[], maxSlices = 6): PieSlice[] {
  const valid = data.filter((d) => d.value > 0);
  const sorted = [...valid].sort((a, b) => b.value - a.value);
  if (sorted.length <= maxSlices) return sorted;

  const top = sorted.slice(0, maxSlices - 1);
  const rest = sorted.slice(maxSlices - 1);
  const othersValue = rest.reduce((sum, d) => sum + d.value, 0);
  if (othersValue > 0) {
    top.push({ name: "Outros", value: othersValue, color: OTHERS_COLOR });
  }
  return top;
}
