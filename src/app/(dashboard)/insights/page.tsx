import { getInsightsData } from "@/actions/insights";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Wallet, Flame } from "lucide-react";
import { AiAdvisorCard } from "./AiAdvisorCard";

export default async function InsightsPage() {
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const data = await getInsightsData();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const { mom, topExpenses, forecast, budgetAlerts } = data;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Insights Inteligentes</h2>
          <p className="text-zinc-400 mt-2">Uma análise aprofundada das suas tendências financeiras.</p>
        </div>
      </div>

      <AiAdvisorCard month={currentMonth} year={currentYear} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MoM Card */}
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-zinc-400">Comparativo Mensal (MoM)</h3>
            <div className={`p-2 rounded-lg ${mom.direction === 'UP' ? 'bg-rose-500/20 text-rose-500' : mom.direction === 'DOWN' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>
              {mom.direction === 'UP' ? <TrendingUp size={24} /> : mom.direction === 'DOWN' ? <TrendingDown size={24} /> : <Minus size={24} />}
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{formatCurrency(mom.currentMonthTotal)}</p>
          <p className="text-sm text-zinc-400 mt-4 leading-relaxed">{mom.text}</p>
        </div>

        {/* Forecast Card */}
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-zinc-400">Previsão (Forecast)</h3>
            <div className="p-2 rounded-lg bg-orange-500/20 text-orange-500">
              <Flame size={24} />
            </div>
          </div>
          <p className="text-4xl font-bold text-white">{formatCurrency(forecast.estimatedEndOfMonth)}</p>
          <p className="text-sm text-zinc-400 mt-4 leading-relaxed">{forecast.text}</p>
        </div>
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" /> Alertas de Orçamento
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {budgetAlerts.map(alert => (
              <div key={alert.categoryId} className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-rose-400">{alert.categoryName}</span>
                  <span className="text-sm font-bold text-rose-500">{alert.usagePercentage.toFixed(0)}% Utilizado</span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-2">
                  <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${Math.min(alert.usagePercentage, 100)}%` }}></div>
                </div>
                <p className="text-xs text-rose-400/80 mt-1">
                  Limite: {formatCurrency(alert.limit)} | Gasto: {formatCurrency(alert.spent)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Expenses */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <Wallet className="text-blue-500" /> Maiores Despesas do Mês
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {topExpenses.length > 0 ? (
            topExpenses.map((expense, idx) => (
              <div key={expense.categoryId} className="p-5 rounded-xl border border-zinc-800 bg-black/40 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-zinc-500 mb-2">TOP {idx + 1}</div>
                  <h4 className="font-semibold text-lg text-white truncate">{expense.categoryName}</h4>
                </div>
                <div className="mt-4 flex justify-between items-end">
                  <div className="text-white font-bold text-2xl">
                    {formatCurrency(expense.amount)}
                  </div>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: expense.color || '#3b82f6' }}></div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-zinc-500">Ainda não há dados suficientes para este ranking.</p>
          )}
        </div>
      </div>
    </div>
  );
}
