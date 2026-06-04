"use client"

import { useState, useRef } from "react";
import { createAccount, updateAccount, deleteAccount } from "@/actions/accounts";
import { Account } from "@prisma/client";

interface AccountFormProps {
  account?: Account | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    let result;

    if (account) {
      result = await updateAccount(account.id, formData);
    } else {
      result = await createAccount(formData);
    }

    setLoading(false);

    if (result.success) {
      if (formRef.current) formRef.current.reset();
      onSuccess();
    } else {
      setError(result.error || "Ocorreu um erro desconhecido.");
    }
  };

  const handleDelete = async () => {
    if (!account) return;
    if (!confirm("Tem certeza que deseja excluir esta conta? Todas as transações associadas também serão apagadas!")) return;
    
    setLoading(true);
    const result = await deleteAccount(account.id);
    setLoading(false);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error || "Erro ao excluir conta.");
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
      <h3 className="text-xl font-semibold mb-4">{account ? "Editar Conta" : "Nova Conta"}</h3>
      
      {error && (
        <div className="p-3 mb-4 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-white/70 mb-1">Nome da Conta</label>
        <input 
          type="text" 
          id="name" 
          name="name" 
          required 
          defaultValue={account?.name || ""}
          className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder="Ex: Nubank, Carteira..."
        />
      </div>

      <div>
        <label htmlFor="type" className="block text-sm font-medium text-white/70 mb-1">Tipo</label>
        <select 
          id="type" 
          name="type" 
          required
          defaultValue={account?.type || "CHECKING"}
          className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="CHECKING">Conta Corrente</option>
          <option value="CREDIT">Cartão de Crédito</option>
          <option value="CASH">Dinheiro (Carteira)</option>
        </select>
      </div>

      <div>
        <label htmlFor="initialBalance" className="block text-sm font-medium text-white/70 mb-1">Saldo Inicial (R$)</label>
        <input 
          type="number" 
          id="initialBalance" 
          name="initialBalance" 
          required 
          step="0.01"
          defaultValue={account?.initialBalance || 0}
          className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      <div className="flex justify-between items-center pt-4">
        {account ? (
          <button 
            type="button" 
            onClick={handleDelete}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-all duration-200"
          >
            Excluir
          </button>
        ) : <div></div>}
        
        <div className="space-x-3">
          <button 
            type="button" 
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all duration-200"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </form>
  );
}
