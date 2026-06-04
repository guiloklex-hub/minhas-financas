"use client";

import { useTransition, useState } from "react";
import { updateTransaction } from "@/actions/transactions";
import { Category, Account, Transaction } from "@prisma/client";
import { X, Loader2 } from "lucide-react";

interface Props {
  transaction: Transaction;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSuccess: (updatedTx: Transaction) => void;
}

export default function EditTransactionModal({ transaction, categories, accounts, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await updateTransaction(transaction.id, formData);
      if (result.success && result.data) {
        onSuccess(result.data as Transaction);
        onClose();
      } else {
        setError(result.error || "Erro ao salvar as alterações.");
      }
    });
  }

  // Format date for the input (YYYY-MM-DD)
  const formattedDate = new Date(new Date(transaction.date).getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h2 className="text-xl font-bold text-white">Editar Transação</h2>
          <button 
            onClick={onClose} 
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1 text-zinc-300">Título</label>
            <input 
              required 
              type="text" 
              id="title" 
              name="title" 
              defaultValue={transaction.title}
              className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors" 
              placeholder="Ex: Salário Mensal" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium mb-1 text-zinc-300">Valor (R$)</label>
              <input 
                required 
                type="number" 
                step="0.01" 
                min="0" 
                id="amount" 
                name="amount" 
                defaultValue={transaction.amount}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors" 
                placeholder="0.00" 
              />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium mb-1 text-zinc-300">Data</label>
              <input 
                required 
                type="date" 
                id="date" 
                name="date" 
                defaultValue={formattedDate}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium mb-1 text-zinc-300">Tipo</label>
              <select 
                required 
                id="type" 
                name="type" 
                defaultValue={transaction.type}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
            </div>
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium mb-1 text-zinc-300">Categoria</label>
              <select 
                required 
                id="categoryId" 
                name="categoryId" 
                defaultValue={transaction.categoryId}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="">Selecione...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="accountId" className="block text-sm font-medium mb-1 text-zinc-300">Conta / Carteira</label>
              <select 
                required 
                id="accountId" 
                name="accountId" 
                defaultValue={transaction.accountId}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="">Selecione...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <button 
              type="button" 
              onClick={onClose}
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {isPending ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
