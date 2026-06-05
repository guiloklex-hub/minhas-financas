"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { createTransactionFromText } from "@/actions/ai-transactions";
import { Account } from "@prisma/client";

interface Props {
  accounts: Account[];
}

export default function AiQuickLaunch({ accounts }: Props) {
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !accountId) return;

    setMessage(null);

    startTransition(async () => {
      const result = await createTransactionFromText(text, accountId);

      if (result.success) {
        setMessage({ type: 'success', text: `Sucesso! Lançado R$ ${result.data?.amount} na categoria selecionada pela IA.` });
        setText("");
      } else {
        setMessage({ type: 'error', text: result.error || "Erro desconhecido." });
      }
      
      // Esconder mensagem após 5 segundos
      setTimeout(() => setMessage(null), 5000);
    });
  };

  return (
    <div className="p-6 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="text-emerald-400" size={24} />
        <h3 className="text-xl font-bold text-white">Lançamento Mágico</h3>
      </div>
      
      <p className="text-zinc-400 text-sm mb-6">
        Descreva sua transação naturalmente. Ex: &quot;Gastei 50 com gasolina no HB20&quot; ou &quot;Recebi 5000 de salário&quot;.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="O que você gastou ou recebeu hoje?"
            className="flex-1 bg-zinc-950 border border-zinc-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            disabled={isPending}
          />
          
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-w-[200px]"
            disabled={isPending}
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isPending || !text.trim() || !accountId}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center min-w-[140px]"
          >
            {isPending ? <Loader2 className="animate-spin" size={20} /> : "Lançar"}
          </button>
        </div>
        
        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}
