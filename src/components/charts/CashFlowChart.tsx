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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/** Formato compacto para os ticks do eixo Y (ex.: R$ 1,2 mil). */
const formatAxis = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export function CashFlowChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
        <h3 className="text-lg font-bold text-white mb-6">Fluxo de Caixa</h3>
        <div className="h-[300px] w-full flex items-center justify-center text-zinc-500 border border-zinc-800 rounded-xl bg-zinc-900/50">
          Nenhuma movimentação no período
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
      <h3 className="text-lg font-bold text-white mb-6">Fluxo de Caixa</h3>
      <div className="w-full h-[300px] min-w-0 min-h-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
            <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />
            <YAxis
              stroke="#a1a1aa"
              tick={{ fill: "#a1a1aa" }}
              tickFormatter={formatAxis}
              width={80}
            />
            <Tooltip
              cursor={{ fill: "#27272a" }}
              contentStyle={{
                backgroundColor: "#18181b",
                borderColor: "#3f3f46",
                color: "#fff",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "#fff" }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(value, name) => [
                formatCurrency(Number(value ?? 0)),
                name,
              ]}
            />
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Bar dataKey="income" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cumulative"
              name="Saldo acumulado"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: "#3b82f6" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
