"use client";

import { useState, useTransition } from "react";
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
import { TrendingUp, FileText, Loader2, Sparkles } from "lucide-react";
import type { ForecastPoint } from "@/lib/forecast";
import { generateMonthlyInsight } from "@/actions/ai-insights";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatAxis = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

/**
 * Mini-gráfico da projeção de caixa dos próximos meses. Os valores chegam já
 * calculados em código (lib/forecast.ts) — a IA não participa.
 *
 * Segue as regras de recharts do projeto: wrapper <div> com altura/largura fixa
 * (h-[260px], w-full) + min-w-0/min-h-0 e ResponsiveContainer 100%/minWidth 0.
 */
export function ForecastCard({ data }: { data: ForecastPoint[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
        <TrendingUp className="text-emerald-500" /> Projeção dos Próximos Meses
      </h3>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
        {data.length === 0 ? (
          <div className="h-[260px] w-full flex items-center justify-center text-muted border border-border rounded-xl bg-card">
            Sem dados suficientes para projetar o fluxo de caixa.
          </div>
        ) : (
          <>
            <div className="w-full h-[260px] min-w-0 min-h-0">
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
                    formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name]}
                  />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} />
                  <Bar dataKey="projectedIncome" name="Receita prevista" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projectedExpense" name="Despesa prevista" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="projectedNet"
                    name="Saldo projetado"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.map((point) => (
                <div key={point.month} className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs font-bold text-muted">{point.month}</div>
                  <div
                    className={`mt-1 text-lg font-bold ${
                      point.projectedNet >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(point.projectedNet)}
                  </div>
                  <div className="text-xs text-muted mt-1">saldo projetado</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Cartão do resumo mensal gerado proativamente (IA ou fallback determinístico).
 * Exibe o último resumo persistido e um botão que dispara
 * generateMonthlyInsight(month, year) — a action recalcula as métricas em código
 * e só usa a IA para narrar. Em falha de IA/budget, o texto vem do fallback.
 */
export function MonthlyInsightSummary({
  month,
  year,
  initialSummary,
  initialCreatedAt,
}: {
  month: number;
  year: number;
  initialSummary: string | null;
  initialCreatedAt: string | null;
}) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [createdAt, setCreatedAt] = useState<string | null>(initialCreatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const res = await generateMonthlyInsight(month, year);
      if (res.success) {
        setSummary(res.insight.summary);
        setCreatedAt(new Date(res.insight.createdAt).toLocaleString("pt-BR"));
      } else {
        setError(res.error ?? "Não foi possível gerar o resumo do mês.");
      }
    });
  };

  return (
    <div className="bg-card/60 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <FileText size={150} />
      </div>

      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="text-blue-400" size={22} />
            Resumo do Mês
          </h2>
          <button
            onClick={handleGenerate}
            disabled={isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="animate-spin" size={16} /> Gerando...
              </>
            ) : (
              <>
                <FileText size={16} /> Gerar resumo do mês
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        {summary ? (
          <div className="bg-zinc-800/50 border border-border/50 rounded-xl p-4">
            <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">{summary}</p>
            {createdAt && (
              <p className="text-xs text-muted mt-3">Atualizado em {createdAt}</p>
            )}
          </div>
        ) : (
          <p className="text-muted text-sm leading-relaxed max-w-xl">
            Gere um resumo textual do mês com os totais, gastos fora do padrão e a projeção de caixa.
            Os números são sempre calculados pelo sistema; a IA apenas redige o texto.
          </p>
        )}
      </div>
    </div>
  );
}
