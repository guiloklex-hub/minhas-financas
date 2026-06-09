"use client"

import { useState } from "react";
import { redeemRewards } from "@/actions/card-rewards";

interface Props {
  cardId: string;
  balance: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function RewardRedeemForm({ cardId, balance, onSuccess, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await redeemRewards(new FormData(e.currentTarget));
    setLoading(false);
    if (result.success) onSuccess();
    else setError(result.error || "Erro ao resgatar.");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
      <h3 className="text-lg font-semibold">Resgatar recompensa</h3>
      <input type="hidden" name="cardId" value={cardId} />
      {error && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="points" className="block text-sm font-medium text-muted mb-1">Pontos (máx. {balance.toLocaleString("pt-BR")})</label>
          <input type="number" id="points" name="points" required step="0.01" min="0.01" max={balance} className={inputClass} />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-muted mb-1">Descrição</label>
          <input id="description" name="description" className={inputClass} placeholder="Ex: Milhas, desconto..." />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-all">Cancelar</button>
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all disabled:opacity-50">
          {loading ? "Processando..." : "Resgatar"}
        </button>
      </div>
    </form>
  );
}
