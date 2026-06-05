"use client";

import { useState, useMemo, useTransition } from "react";
import { Investment } from "@prisma/client";
import { calculateCompoundInterest, calculateBrazilianTaxes } from "@/lib/financial-math";
import { simulateInvestmentScenario } from "@/actions/ai-advisor";
import { createInvestment, deleteInvestment } from "@/actions/investments";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import { TrendingUp, Plus, Trash2, Loader2, Sparkles, Send, ShieldAlert, Landmark, DollarSign } from "lucide-react";

export default function InvestmentDashboardClient({ initialInvestments }: { initialInvestments: Investment[] }) {
  const [investments, setInvestments] = useState<Investment[]>(initialInvestments);
  const [isPendingCreate, startTransitionCreate] = useTransition();
  const [createError, setCreateError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPendingDelete, startTransitionDelete] = useTransition();
  
  // Chatbot State
  const [prompt, setPrompt] = useState("");
  const [simResult, setSimResult] = useState("");
  const [isPendingSimulate, startTransitionSimulate] = useTransition();

  // Projeção Matemática (12 meses)
  const projectionData = useMemo(() => {
    const data = [];
    const today = new Date();
    
    for (let monthOffset = 0; monthOffset <= 12; monthOffset++) {
      let totalAmount = 0;
      
      investments.forEach(inv => {
        // Se já venceu antes desse mês projetado, o valor fica estagnado no máximo alcançado
        // (Para simplificar, vamos projetar juros contínuos até 12 meses a partir de hoje)
        const projected = calculateCompoundInterest(inv.initialAmount, inv.yieldRate, monthOffset);
        totalAmount += projected;
      });
      
      const futureDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      data.push({
        month: futureDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        value: totalAmount
      });
    }
    return data;
  }, [investments]);

  // Resumo
  const totalInvested = investments.reduce((acc, inv) => acc + inv.initialAmount, 0);
  
  // Rendimento projetado para daqui a 12 meses (usando o último ponto do gráfico)
  const projectedTotal12Months = projectionData.length > 0 ? projectionData[projectionData.length - 1].value : 0;
  const grossProfit12Months = projectedTotal12Months - totalInvested;
  
  // Impostos simulando um resgate em 365 dias (1 ano)
  const estimatedTaxes12Months = calculateBrazilianTaxes(grossProfit12Months, 365);
  const netProfit12Months = grossProfit12Months - estimatedTaxes12Months;

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    const target = e.currentTarget;
    startTransitionCreate(async () => {
      const res = await createInvestment(formData);
      
      if (res.success && res.data) {
        setInvestments(prev => [res.data as Investment, ...prev]);
        target.reset();
      } else {
        setCreateError(res.error || "Erro ao criar investimento");
        setTimeout(() => setCreateError(""), 5000);
      }
    });
  }

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const totalPages = Math.ceil(investments.length / itemsPerPage) || 1;
  const currentInvestments = investments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function handleDelete(id: string) {
    if (!confirm("Excluir este ativo?")) return;
    setDeletingId(id);
    startTransitionDelete(async () => {
      const res = await deleteInvestment(id);
      if (res.success) {
        setInvestments(prev => {
          const newInv = prev.filter(i => i.id !== id);
          const newTotalPages = Math.ceil(newInv.length / itemsPerPage) || 1;
          if (currentPage > newTotalPages) setCurrentPage(newTotalPages);
          return newInv;
        });
      }
      setDeletingId(null);
    });
  }

  function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setSimResult("");
    startTransitionSimulate(async () => {
      const res = await simulateInvestmentScenario(prompt);
      if (res.success) {
        setSimResult(res.answer ?? "");
      } else {
        setSimResult("Erro na simulação: " + (res.error || "erro desconhecido"));
      }
    });
  }

  return (
    <div className="space-y-6">
      
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Landmark size={18} />
            <h3 className="text-sm font-medium">Total Investido</h3>
          </div>
          <p className="text-2xl font-bold text-white">
            R$ {totalInvested.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <TrendingUp size={18} className="text-emerald-500" />
            <h3 className="text-sm font-medium">Lucro Bruto (1 Ano)</h3>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            + R$ {grossProfit12Months.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <ShieldAlert size={18} className="text-rose-500" />
            <h3 className="text-sm font-medium">Impostos (IR 20%)</h3>
          </div>
          <p className="text-2xl font-bold text-rose-400">
            - R$ {estimatedTaxes12Months.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-900/50 p-5 rounded-xl">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <DollarSign size={18} />
            <h3 className="text-sm font-medium">Líquido Estimado (1 Ano)</h3>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            R$ {(totalInvested + netProfit12Months).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Gráfico de Projeção */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <TrendingUp size={20} className="text-blue-500"/> Projeção de Juros Compostos (12 Meses)
        </h3>
        <div className="w-full h-[300px] min-w-0 min-h-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={projectionData}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis 
                stroke="#71717a" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `R$ ${val.toLocaleString('pt-BR')}`}
                width={80}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Patrimônio']}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário e Lista de Ativos */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Novo Ativo</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Nome (Ex: Tesouro Selic)</label>
                  <input name="name" required className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Tipo</label>
                  <select name="type" required className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white">
                    <option value="FIXED_INCOME">Renda Fixa</option>
                    <option value="VARIABLE_INCOME">Renda Variável</option>
                    <option value="CRYPTO">Criptomoeda</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Aporte Inicial (R$)</label>
                  <input name="initialAmount" type="number" step="0.01" required className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Taxa Anual (Ex: 10.5 para 10,5%)</label>
                  <input name="yieldRate" type="number" step="0.01" required className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Data Início</label>
                  <input name="startDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Vencimento (Opcional)</label>
                  <input name="maturityDate" type="date" className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white" />
                </div>
              </div>
              <button disabled={isPendingCreate} className="w-full h-[42px] bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                {isPendingCreate ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Cadastrar Investimento
              </button>
              {createError && (
                <div className="p-3 mt-3 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {createError}
                </div>
              )}
            </form>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-white">Sua Carteira</h3>
              <span className="text-xs text-zinc-400">{investments.length} ativos</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {currentInvestments.map(inv => (
                <div key={inv.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div>
                    <h4 className="font-medium text-white">{inv.name}</h4>
                    <p className="text-xs text-zinc-400 mt-1">
                      R$ {inv.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {(inv.yieldRate * 100).toFixed(2)}% a.a.
                    </p>
                  </div>
                  <button onClick={() => handleDelete(inv.id)} disabled={isPendingDelete && deletingId === inv.id} className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors">
                    {isPendingDelete && deletingId === inv.id ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}
                  </button>
                </div>
              ))}
              {investments.length === 0 && (
                <div className="p-8 text-center text-zinc-500 text-sm">Nenhum ativo cadastrado.</div>
              )}
            </div>
            {investments.length > itemsPerPage && (
              <div className="p-3 border-t border-zinc-800 flex items-center justify-between bg-black/20">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-2 py-1 rounded-md text-xs bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors"
                >
                  Anterior
                </button>
                <span className="text-xs text-zinc-400 font-medium">
                  {currentPage} de {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-2 py-1 rounded-md text-xs bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors"
                >
                  Próximo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chatbot Simulador IA */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col h-full min-h-[500px]">
          <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Simulador de Cenários (IA)</h3>
              <p className="text-xs text-zinc-400">Tributação real e Custo de Oportunidade</p>
            </div>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto">
            {simResult ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed bg-black/40 p-4 rounded-xl border border-zinc-800/50">
                  {simResult}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <Sparkles size={48} className="text-purple-500" />
                <p className="text-sm text-zinc-400 max-w-[250px]">
                  Pergunte: &quot;Devo sacar 5 mil do Tesouro Selic hoje ou pegar um empréstimo a 2% ao mês?&quot;
                </p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-zinc-800 bg-black/20">
            <form onSubmit={handleSimulate} className="flex gap-2">
              <input 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Simular cenário financeiro..." 
                className="flex-1 bg-black border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button 
                type="submit" 
                disabled={isPendingSimulate || !prompt}
                className="w-10 h-10 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {isPendingSimulate ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
