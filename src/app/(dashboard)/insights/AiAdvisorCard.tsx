"use client";

import { useState } from "react";
import { Sparkles, Brain, Loader2 } from "lucide-react";
import { generateFinancialAdvice } from "@/actions/ai-advisor";

export function AiAdvisorCard({ month, year }: { month: number; year: number }) {
  const [advice, setAdvice] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateFinancialAdvice(month, year);
      if (res.success) {
        setAdvice(res.advice ?? []);
      } else {
        setError(res.error || "Ocorreu um erro ao gerar os conselhos.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card/60 border border-purple-500/20 rounded-2xl p-6 mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Brain size={150} />
      </div>
      
      <div className="relative z-10">
        <h2 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Sparkles className="text-purple-500" size={24} />
          Conselheiro Financeiro IA
        </h2>
        
        {advice.length === 0 && !loading && !error && (
          <div>
            <p className="text-muted mb-6 max-w-xl text-sm leading-relaxed">
              Peça para o Gemini analisar todas as suas receitas, despesas e orçamentos do mês atual e gerar dicas personalizadas, alertando sobre riscos ou oportunidades financeiras.
            </p>
            <button 
              onClick={handleAnalyze}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center gap-2 text-sm"
            >
              <Brain size={18} />
              Analisar meu mês com IA
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-purple-400 py-4">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-medium animate-pulse">O Gemini está analisando todos os seus dados...</span>
          </div>
        )}

        {error && (
          <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-4 text-sm max-w-xl">
            {error}
            <button onClick={handleAnalyze} className="underline ml-2 font-semibold hover:text-rose-300">Tentar novamente</button>
          </div>
        )}

        {advice.length > 0 && !loading && (
          <div className="space-y-4 max-w-2xl mt-4">
            {advice.map((item, index) => (
              <div key={index} className="flex gap-3 items-start bg-zinc-800/50 p-4 rounded-xl border border-border/50">
                <div className="bg-purple-600/20 text-purple-400 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                  {index + 1}
                </div>
                <p className="text-foreground/80 text-sm leading-relaxed">{item}</p>
              </div>
            ))}
            <button 
              onClick={handleAnalyze}
              className="text-xs text-purple-400 hover:text-purple-300 mt-4 flex items-center gap-1 transition-colors font-medium"
            >
              <Sparkles size={14} /> Refazer Análise
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
