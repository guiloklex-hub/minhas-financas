"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  CHART_COLORS,
  axisStroke,
  gridStroke,
  formatBRL,
  formatBRLCompact,
  tooltipContentStyle,
  tooltipItemStyle,
} from "./chart-theme";

interface Props {
  data: {
    name: string; // "MM/AAAA"
    comprometido: number;
    projetado: number;
  }[];
}

/** Gráfico "burro": só o gráfico. Card/título vêm da página. */
export function FutureInvoicesBar({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-border bg-card text-muted">
        Sem projeção disponível
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full min-w-0 min-h-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="name" stroke={axisStroke} tick={{ fill: axisStroke }} />
          <YAxis stroke={axisStroke} tick={{ fill: axisStroke }} tickFormatter={formatBRLCompact} width={70} />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={tooltipContentStyle}
            itemStyle={tooltipItemStyle}
            formatter={(value) => [formatBRL(Number(value || 0)), ""]}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          <Bar dataKey="comprometido" name="Comprometido (parcelas)" fill={CHART_COLORS.committed} radius={[4, 4, 0, 0]} />
          <Bar dataKey="projetado" name="Projetado (total)" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
