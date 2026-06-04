"use client"

import { useTransition } from "react"
import { upsertBudget } from "@/actions/budgets"
import { Category } from "@prisma/client"

export default function BudgetForm({ categories }: { categories: Category[] }) {
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await upsertBudget(formData);
      if (result.success) {
        (document.getElementById("budget-form") as HTMLFormElement).reset();
      } else {
        alert(result.error);
      }
    });
  }

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  return (
    <form id="budget-form" action={handleSubmit} className="space-y-4 p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
      <h3 className="text-xl font-semibold mb-4">Definir Orçamento Mensal</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="categoryId" className="block text-sm font-medium mb-1">Categoria</label>
          <select required id="categoryId" name="categoryId" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors">
            <option value="">Selecione...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amountLimit" className="block text-sm font-medium mb-1">Teto (R$)</label>
          <input required type="number" step="0.01" min="0" id="amountLimit" name="amountLimit" className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" placeholder="0.00" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="month" className="block text-sm font-medium mb-1">Mês</label>
            <input required type="number" min="1" max="12" id="month" name="month" defaultValue={currentMonth} className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" />
          </div>
          <div>
            <label htmlFor="year" className="block text-sm font-medium mb-1">Ano</label>
            <input required type="number" min="2000" id="year" name="year" defaultValue={currentYear} className="w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 focus:outline-none focus:border-white/50 transition-colors" />
          </div>
        </div>
      </div>

      <button 
        type="submit" 
        disabled={isPending}
        className="w-full mt-4 bg-white text-black font-semibold py-2 rounded-md hover:bg-white/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Salvando..." : "Definir Orçamento"}
      </button>
    </form>
  );
}
