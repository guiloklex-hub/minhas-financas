"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  aggregatePie,
  formatBRL,
  tooltipContentStyle,
  tooltipItemStyle,
  type PieSlice,
} from "./chart-theme";

interface Props {
  data: PieSlice[];
}

/** Gráfico "burro": só a pizza + legenda custom. Card/título vêm da página. */
export function CategoryPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-border bg-card text-muted">
        Nenhuma despesa no período
      </div>
    );
  }

  const slices = aggregatePie(data);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="h-[240px] w-full min-w-0 min-h-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {slices.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || "#52525b"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipContentStyle}
              itemStyle={tooltipItemStyle}
              formatter={(value) => [formatBRL(Number(value || 0)), "Valor"]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda custom: lista enxuta com valor e percentual, agregando "Outros". */}
      <ul className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto pr-1 text-sm">
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-foreground">{s.name}</span>
              <span className="shrink-0 tabular-nums text-muted">{pct.toFixed(0)}%</span>
              <span className="shrink-0 tabular-nums text-foreground">{formatBRL(s.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
