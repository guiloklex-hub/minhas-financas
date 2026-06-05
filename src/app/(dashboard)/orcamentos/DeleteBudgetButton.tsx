"use client"

import { useState, useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { deleteBudget } from "@/actions/budgets"

export default function DeleteBudgetButton({ id, categoryName }: { id: string; categoryName: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete() {
    if (!confirm(`Tem certeza que deseja excluir o orçamento de "${categoryName}"?`)) return;

    setError("");
    startTransition(async () => {
      const res = await deleteBudget(id);
      if (!res.success) {
        setError(res.error || "Erro ao excluir orçamento.");
        alert(res.error || "Erro ao excluir orçamento.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-label={`Excluir orçamento de ${categoryName}`}
      title={error || "Excluir orçamento"}
      className="p-2 text-white/40 hover:text-[var(--color-expense)] hover:bg-[var(--color-expense)]/10 rounded-lg transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
    </button>
  );
}
