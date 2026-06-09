"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ArrowRight, Loader2 } from "lucide-react";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  getCashFlow,
  getCategoryBreakdown,
  type CashFlowPoint,
  type YearComparisonPoint,
  type CategoryBreakdownItem,
} from "@/actions/reports";

type PresetKey = "3m" | "6m" | "12m" | "year" | "custom";

interface Props {
  initialFrom: string;
  initialTo: string;
  initialYear: number;
  initialCashFlow: CashFlowPoint[];
  initialYearComparison: YearComparisonPoint[];
  initialCategoryBreakdown: CategoryBreakdownItem[];
}

/** Formata uma Date para "YYYY-MM-DD" no fuso local. */
function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Retorna o intervalo [from, to] (YYYY-MM-DD) para um preset. */
function rangeForPreset(preset: Exclude<PresetKey, "custom">): { from: string; to: string } {
  const now = new Date();
  if (preset === "year") {
    return {
      from: toISODate(new Date(now.getFullYear(), 0, 1)),
      to: toISODate(new Date(now.getFullYear(), 11, 31)),
    };
  }
  const months = preset === "3m" ? 3 : preset === "6m" ? 6 : 12;
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0); // fim do mês atual
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return { from: toISODate(from), to: toISODate(to) };
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatAxis = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "12m", label: "12 meses" },
  { key: "year", label: "Ano atual" },
];

export default function ReportsClient({
  initialFrom,
  initialTo,
  initialYear,
  initialCashFlow,
  initialYearComparison,
  initialCategoryBreakdown,
}: Props) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [year] = useState(initialYear);
  const [activePreset, setActivePreset] = useState<PresetKey>("12m");

  const [cashFlow, setCashFlow] = useState(initialCashFlow);
  const [categoryBreakdown, setCategoryBreakdown] = useState(initialCategoryBreakdown);
  // O comparativo YoY usa sempre o ano atual; não depende do intervalo selecionado.
  const yearComparison = initialYearComparison;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback((nextFrom: string, nextTo: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const [cf, cb] = await Promise.all([
          getCashFlow(nextFrom, nextTo),
          getCategoryBreakdown(nextFrom, nextTo),
        ]);
        setCashFlow(cf);
        setCategoryBreakdown(cb);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar relatórios.");
      }
    });
  }, []);

  const applyPreset = useCallback(
    (preset: Exclude<PresetKey, "custom">) => {
      const range = rangeForPreset(preset);
      setActivePreset(preset);
      setFrom(range.from);
      setTo(range.to);
      reload(range.from, range.to);
    },
    [reload]
  );

  const applyCustom = useCallback(() => {
    if (!from || !to) {
      setError("Informe as duas datas para o intervalo personalizado.");
      return;
    }
    if (from > to) {
      setError("A data inicial deve ser anterior ou igual à data final.");
      return;
    }
    setActivePreset("custom");
    reload(from, to);
  }, [from, to, reload]);

  const totalExpenses = categoryBreakdown.reduce((acc, c) => acc + c.amount, 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Relatórios</h2>
        <p className="text-muted mt-2">
          Fluxo de caixa, comparativo anual e despesas por categoria.
        </p>
      </div>

      {/* Seletor de período */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                disabled={isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  activePreset === preset.key
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-foreground/80 hover:bg-zinc-700"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-zinc-800 hidden sm:block" />

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="report-from" className="text-xs text-muted">
                De
              </label>
              <input
                id="report-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-zinc-800 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="report-to" className="text-xs text-muted">
                Até
              </label>
              <input
                id="report-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-zinc-800 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
              />
            </div>
            <button
              type="button"
              onClick={applyCustom}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-foreground hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Aplicar
            </button>
          </div>
        </div>
        {error ? <p className="text-sm text-rose-400 mt-3">{error}</p> : null}
      </div>

      {/* Fluxo de caixa */}
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle>Fluxo de Caixa</CardTitle>
        </CardHeader>
        <CardContent>
          <CashFlowChart data={cashFlow} />
        </CardContent>
      </Card>

      {/* Comparativo anual (YoY) */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">Comparativo anual (YoY)</h3>
          <span className="text-sm text-muted">
            {year} vs {year - 1}
          </span>
        </div>
        <div className="w-full h-[320px] min-w-0 min-h-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={yearComparison.map((p) => ({
                month: p.month,
                receitaAtual: p.currentYear.income,
                despesaAtual: p.currentYear.expense,
                receitaAnterior: p.previousYear.income,
                despesaAnterior: p.previousYear.expense,
              }))}
              margin={{ top: 20, right: 0, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
              <XAxis dataKey="month" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
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
              <Bar dataKey="receitaAtual" name={`Receitas ${year}`} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="receitaAnterior" name={`Receitas ${year - 1}`} fill="#34d39955" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesaAtual" name={`Despesas ${year}`} fill="#f43f5e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesaAnterior" name={`Despesas ${year - 1}`} fill="#fb718555" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Despesas por categoria (drill-down) */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm w-full min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">Despesas por categoria</h3>
          <span className="text-sm text-muted">Total: {formatCurrency(totalExpenses)}</span>
        </div>

        {categoryBreakdown.length === 0 ? (
          <p className="text-muted">Nenhuma despesa no período selecionado.</p>
        ) : (
          <ul className="space-y-2">
            {categoryBreakdown.map((cat) => {
              const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
              return (
                <li key={cat.categoryId}>
                  <Link
                    href={`/transacoes?categoryId=${encodeURIComponent(cat.categoryId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
                    className="group flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800/60 transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || "#52525b" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground truncate">{cat.name}</span>
                        <span className="text-sm font-semibold text-foreground shrink-0">
                          {formatCurrency(cat.amount)}
                        </span>
                      </div>
                      <div className="mt-2 w-full bg-background rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: cat.color || "#52525b",
                          }}
                        />
                      </div>
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-muted group-hover:text-foreground/80 transition-colors shrink-0"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
