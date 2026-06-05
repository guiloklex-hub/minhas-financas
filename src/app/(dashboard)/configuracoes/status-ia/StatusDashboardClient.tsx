"use client";

import { useState } from "react";
import { Activity, Cpu, CircleDollarSign, AlertTriangle, Timer, Users, Crown, Sparkles, CheckCircle2, Loader2, XCircle, Wallet } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { testGeminiConnection } from "@/actions/ai-advisor";

interface Log {
  id: string;
  feature: string;
  status: string;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  date: string;
}

interface ChartPoint {
  date: string;
  "Lançamento Mágico": number;
  "Conselheiro": number;
}

interface Props {
  metrics: {
    totalCalls: number;
    last7dCalls: number;
    totalTokens: number;
    totalCost: number;
    errorRate: number;
    p50: number;
    p95: number;
  };
  chartData: ChartPoint[];
  recentLogs: Log[];
  budget: {
    spendThisMonthUsd: number;
    monthlyBudgetUsd: number | null;
  };
}

export default function StatusDashboardClient({ metrics, chartData, recentLogs, budget }: Props) {
  const [testStatus, setTestStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [testMessage, setTestMessage] = useState('');

  const [featureFilter, setFeatureFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  };

  const formatUsd = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
  };

  const hasBudget = budget.monthlyBudgetUsd !== null && budget.monthlyBudgetUsd > 0;
  const budgetPercent = hasBudget ? (budget.spendThisMonthUsd / (budget.monthlyBudgetUsd as number)) * 100 : 0;
  const budgetExceeded = hasBudget && budgetPercent >= 100;
  const budgetBarPercent = Math.min(budgetPercent, 100);
  const budgetBarColor = budgetPercent >= 100 ? 'bg-rose-500' : budgetPercent >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const budgetTextColor = budgetPercent >= 100 ? 'text-rose-400' : budgetPercent >= 80 ? 'text-amber-400' : 'text-emerald-400';

  const handleTestConnection = async () => {
    setTestStatus('LOADING');
    setTestMessage('');
    try {
      const res = await testGeminiConnection();
      if (res.success) {
        setTestStatus('SUCCESS');
      } else {
        setTestStatus('ERROR');
        setTestMessage(res.message);
      }
    } catch (e: unknown) {
      setTestStatus('ERROR');
      setTestMessage(e instanceof Error ? e.message : 'Erro inesperado.');
    }
    
    // Reset status after 3 seconds if success
    setTimeout(() => {
      setTestStatus(prev => prev === 'SUCCESS' ? 'IDLE' : prev);
    }, 3000);
  };

  const filteredLogs = recentLogs.filter(log => {
    if (featureFilter !== 'ALL' && log.feature !== featureFilter) return false;
    if (statusFilter !== 'ALL' && log.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-purple-600/20 text-purple-500 border border-purple-500/30">
          <Sparkles size={32} />
        </div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            IA (Gemini)
          </h2>
          <p className="text-zinc-400 mt-1">Uso, custo estimado, erros e saúde da integração de IA</p>
        </div>
      </div>

      {/* Orçamento de IA (mês corrente) */}
      <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Orçamento de IA (mês)</h3>
              <p className="text-[11px] text-zinc-500">Gasto estimado vs. teto mensal configurado (USD)</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">
              {formatUsd(budget.spendThisMonthUsd)}
              {hasBudget ? (
                <span className="text-zinc-500 font-medium"> / {formatUsd(budget.monthlyBudgetUsd as number)}</span>
              ) : null}
            </div>
            <div className="text-[11px] font-semibold">
              {hasBudget ? (
                <span className={budgetTextColor}>{budgetPercent.toFixed(0)}% utilizado</span>
              ) : (
                <span className="text-zinc-500">sem limite</span>
              )}
            </div>
          </div>
        </div>

        {hasBudget ? (
          <div className="mt-4 w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${budgetBarColor}`}
              style={{ width: `${budgetBarPercent}%` }}
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-400">
            Defina <span className="font-mono text-zinc-300">AI_MONTHLY_BUDGET_USD</span> para ativar o teto mensal de gasto com IA.
          </p>
        )}

        {budgetExceeded ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertTriangle size={16} />
            Limite mensal de gasto com IA atingido — as chamadas ao Gemini estão bloqueadas até o próximo mês.
          </div>
        ) : null}
      </div>

      {/* Grid: 5 Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">{metrics.totalCalls}</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Chamadas (30d)</div>
            <div className="text-[10px] text-zinc-500">{metrics.last7dCalls} nos últimos 7d</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
            <Cpu size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">{metrics.totalTokens.toLocaleString('pt-BR')}</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Tokens (30d)</div>
            <div className="text-[10px] text-zinc-500"> </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
            <CircleDollarSign size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">{formatCurrency(metrics.totalCost)}</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Custo estimado (30d)</div>
            <div className="text-[10px] text-zinc-500">estimativa — não é a fatura</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-rose-600/20 text-rose-400 flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">{metrics.errorRate.toFixed(1)}%</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Taxa de erro (30d)</div>
            <div className="text-[10px] text-zinc-500"> </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-orange-600/20 text-orange-400 flex items-center justify-center">
            <Timer size={18} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white mb-1">{metrics.p50} / {metrics.p95}ms</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Latência p50 / p95</div>
            <div className="text-[10px] text-zinc-500">chamadas com sucesso</div>
          </div>
        </div>
      </div>

      {/* Grid: 2 Bottom Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
            <Users size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">1</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Tenants com IA ativa</div>
            <div className="text-[10px] text-zinc-500">opt-in (aiEnabled)</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between h-36">
          <div className="w-8 h-8 rounded-lg bg-yellow-600/20 text-yellow-500 flex items-center justify-center">
            <Crown size={18} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">1</div>
            <div className="text-xs font-semibold text-zinc-400 mb-1">Tenants Premium</div>
            <div className="text-[10px] text-zinc-500">elegíveis à IA</div>
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Chart */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Chamadas de IA por dia (30d)</h3>
          <div className="w-full h-[250px] min-w-0 min-h-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLancemento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConselheiro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d946ef" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#d946ef" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" stroke="#71717a" tick={{ fill: '#71717a', fontSize: 12 }} />
                <YAxis stroke="#71717a" tick={{ fill: '#71717a', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: '#a1a1aa' }} />
                <Area type="monotone" dataKey="Lançamento Mágico" name="Lançamento Mágico" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorLancemento)" />
                <Area type="monotone" dataKey="Conselheiro" name="Conselheiro de Insights" stroke="#d946ef" strokeWidth={2} fillOpacity={1} fill="url(#colorConselheiro)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Info Box */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 flex flex-col">
          <div className="flex justify-between items-start mb-8">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={16} className="text-purple-500" />
              Integração Gemini
            </h3>
            <button 
              onClick={handleTestConnection}
              disabled={testStatus === 'LOADING'}
              className={`text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2
                ${testStatus === 'LOADING' ? 'bg-purple-600/50 cursor-not-allowed' : 
                  testStatus === 'SUCCESS' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  testStatus === 'ERROR' ? 'bg-rose-600 hover:bg-rose-700' :
                  'bg-purple-600 hover:bg-purple-700'}`}
            >
              {testStatus === 'LOADING' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : testStatus === 'SUCCESS' ? (
                <CheckCircle2 size={14} />
              ) : testStatus === 'ERROR' ? (
                <XCircle size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {testStatus === 'LOADING' ? 'TESTANDO...' : 
               testStatus === 'SUCCESS' ? 'SUCESSO!' : 
               testStatus === 'ERROR' ? 'ERRO (VER DETALHE)' : 
               'TESTAR CONEXÃO'}
            </button>
          </div>
          
          {testStatus === 'ERROR' && (
            <div className="mb-4 text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
              {testMessage}
            </div>
          )}

          <div className="space-y-4 text-sm mt-auto">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 font-medium">API key</span>
              <span className="text-emerald-500 flex items-center gap-1 font-semibold">
                <CheckCircle2 size={16} /> Configurada
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 font-medium">Modelo (texto)</span>
              <span className="text-zinc-300 font-mono text-xs">gemini-3.1-flash-lite</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 font-medium">Modelo (áudio)</span>
              <span className="text-zinc-300 font-mono text-xs">gemini-3.1-flash-lite</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <span className="text-zinc-400 font-medium">Preço in/out (USD/1M)</span>
              <span className="text-zinc-300 font-mono text-xs">$0.1 / $0.4</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-medium">Câmbio USD→BRL</span>
              <span className="text-zinc-300 font-mono text-xs">5.4</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Top Tenants por uso (30d)</h3>
        
        <div className="flex justify-between items-center text-sm py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-4">
            <span className="text-zinc-500 font-medium w-4">1</span>
            <span className="text-white font-bold text-base">Usuário Local (Você)</span>
            <span className="text-[10px] bg-orange-500/20 text-orange-500 font-bold px-2 py-0.5 rounded uppercase tracking-wider">Premium</span>
          </div>
          <div className="flex gap-6 text-xs text-zinc-400 font-medium">
            <span>{metrics.totalCalls} chamadas</span>
            <span>{metrics.totalTokens.toLocaleString('pt-BR')} tk</span>
            <span className="text-emerald-500 font-bold">{formatCurrency(metrics.totalCost)}</span>
          </div>
        </div>
      </div>

      {/* Registros de Uso */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mt-8 pt-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Registros de Uso ({filteredLogs.length})</h3>
        <div className="flex gap-2">
          <select 
            value={featureFilter}
            onChange={(e) => setFeatureFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="ALL">Todas as features</option>
            <option value="Lançamento Mágico">Lançamento Mágico</option>
            <option value="Conselheiro">Conselheiro</option>
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="ALL">Todos os status</option>
            <option value="SUCCESS">Sucesso</option>
            <option value="ERROR">Erro</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-zinc-800 uppercase text-white/60">
            <tr>
              <th className="px-6 py-4 font-medium">Data</th>
              <th className="px-6 py-4 font-medium">Feature</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Tokens</th>
              <th className="px-6 py-4 font-medium">Latência</th>
              <th className="px-6 py-4 font-medium">Custo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">Nenhum registro encontrado.</td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-zinc-400">{log.date}</td>
                  <td className="px-6 py-4 font-medium text-white">{log.feature}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${log.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">{log.totalTokens} tk</td>
                  <td className="px-6 py-4 text-zinc-400">{log.latencyMs} ms</td>
                  <td className="px-6 py-4 text-emerald-500">{formatCurrency(log.costUsd)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
