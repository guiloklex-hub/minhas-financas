"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CHART_COLORS,
  axisStroke,
  gridStroke,
  formatBRL,
  formatBRLCompact,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "./chart-theme";

interface CashFlowDatum {
  month: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
}

interface Props {
  data: CashFlowDatum[];
}

/** Gráfico "burro": só o gráfico. Card/título vêm da página. */
export function CashFlowChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-border bg-card text-muted">
        Nenhuma movimentação no período
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full min-w-0 min-h-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey="month" stroke={axisStroke} tick={{ fill: axisStroke }} />
          <YAxis stroke={axisStroke} tick={{ fill: axisStroke }} tickFormatter={formatBRLCompact} width={80} />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={tooltipContentStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
            formatter={(value, name) => [formatBRL(Number(value ?? 0)), name]}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          <Bar dataKey="income" name="Receitas" fill={CHART_COLORS.income} radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Despesas" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="cumulative"
            name="Saldo acumulado"
            stroke={CHART_COLORS.net}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.net }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
