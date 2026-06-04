"use client"

import { useState } from "react";
import { Account } from "@prisma/client";
import { createTransfer } from "@/actions/transfers";

interface Props {
  accounts: Account[];
  onSuccess: () => void;
  onCancel: () => void;
}

export default function TransferForm({ accounts, onSuccess, onCancel }: Props) {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    const res = await createTransfer(formData);
    
    if (res.success) {
      onSuccess();
    } else {
      setError(res.error || "Erro desconhecido");
    }
    
    setIsSubmitting(false);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
      
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-white">Nova Transferência</h3>
        <button type="button" onClick={onCancel} className="text-zinc-500 hover:text-white transition-colors">
          ✕
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fromAccountId" className="block text-sm font-medium text-zinc-400 mb-1">
              De (Conta de Origem)
            </label>
            <select
              id="fromAccountId"
              name="fromAccountId"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="toAccountId" className="block text-sm font-medium text-zinc-400 mb-1">
              Para (Conta de Destino)
            </label>
            <select
              id="toAccountId"
              name="toAccountId"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-zinc-400 mb-1">
              Valor
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500">R$</span>
              <input
                type="number"
                id="amount"
                name="amount"
                step="0.01"
                min="0.01"
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2.5 pl-10 pr-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="0.00"
              />
            </div>
          </div>
          
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-zinc-400 mb-1">
              Data
            </label>
            <input
              type="date"
              id="date"
              name="date"
              required
              defaultValue={today}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors [color-scheme:dark]"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-zinc-700 hover:bg-zinc-800 text-white font-medium rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Transferindo..." : "Transferir"}
          </button>
        </div>
      </form>
    </div>
  );
}
