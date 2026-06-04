"use client"

import { useTransition } from "react"
import { createTransaction } from "@/actions/transactions"
import { Category, Account } from "@prisma/client"

export default function TransactionForm({ categories, accounts }: { categories: Category[], accounts: Account[] }) {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createTransaction(formData);
      if (result.success) {
        (document.getElementById("transaction-form") as HTMLFormElement).reset();
      } else {
        alert(result.error);
      }
    });
  }

  return (
    <form id="transaction-form" action={handleSubmit} className="space-y-4 p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
      <h3 className="text-xl font-semibold mb-4">Nova Transação</h3>
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">Título</label>
        <input required type="text" id="title" name="title" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" placeholder="Ex: Salário Mensal" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium mb-1">Valor (R$)</label>
          <input required type="number" step="0.01" min="0" id="amount" name="amount" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" placeholder="0.00" />
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium mb-1">Data</label>
          <input required type="date" id="date" name="date" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1">Tipo</label>
          <select required id="type" name="type" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors">
            <option value="INCOME">Receita</option>
            <option value="EXPENSE">Despesa</option>
          </select>
        </div>
        <div>
          <label htmlFor="categoryId" className="block text-sm font-medium mb-1">Categoria</label>
          <select required id="categoryId" name="categoryId" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors">
            <option value="">Selecione...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="accountId" className="block text-sm font-medium mb-1">Conta / Carteira</label>
          <select required id="accountId" name="accountId" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors">
            <option value="">Selecione...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full mt-4 bg-white text-black font-semibold py-2 rounded-md hover:bg-white/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Salvando..." : "Adicionar Transação"}
      </button>
    </form>
  );
}
