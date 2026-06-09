"use client"

import { useState, useRef } from "react";
import { createVirtualCard, updateVirtualCard, archiveVirtualCard } from "@/actions/virtual-cards";

type VirtualCardEditable = {
  id: string;
  name: string;
  lastFour: string | null;
  color: string | null;
  spendingLimit: number | null;
};

interface Props {
  cardId: string;
  virtualCard?: VirtualCardEditable | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function VirtualCardForm({ cardId, virtualCard, onSuccess, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("cardId", cardId);
    const result = virtualCard
      ? await updateVirtualCard(virtualCard.id, formData)
      : await createVirtualCard(formData);
    setLoading(false);
    if (result.success) {
      if (formRef.current) formRef.current.reset();
      onSuccess();
    } else {
      setError(result.error || "Ocorreu um erro desconhecido.");
    }
  };

  const handleArchive = async () => {
    if (!virtualCard) return;
    if (!confirm("Arquivar este cartão virtual? Ele some da lista, mas o histórico das compras é preservado.")) return;
    setLoading(true);
    const result = await archiveVirtualCard(virtualCard.id);
    setLoading(false);
    if (result.success) onSuccess();
    else setError(result.error || "Erro ao arquivar.");
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-5 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
      <h4 className="text-lg font-semibold">{virtualCard ? "Editar cartão virtual" : "Novo cartão virtual"}</h4>

      {error && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="vcName" className="block text-sm font-medium text-muted mb-1">Nome</label>
          <input id="vcName" name="name" required defaultValue={virtualCard?.name || ""} className={inputClass} placeholder="Ex: Assinaturas, Compras online" />
        </div>
        <div>
          <label htmlFor="vcLastFour" className="block text-sm font-medium text-muted mb-1">Últimos 4 dígitos</label>
          <input id="vcLastFour" name="lastFour" inputMode="numeric" maxLength={4} defaultValue={virtualCard?.lastFour || ""} className={inputClass} placeholder="1234" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="vcLimit" className="block text-sm font-medium text-muted mb-1">Sub-limite (opcional)</label>
          <input type="number" id="vcLimit" name="spendingLimit" step="0.01" min="0" defaultValue={virtualCard?.spendingLimit ?? ""} className={inputClass} placeholder="Ex: 500" />
        </div>
        <div>
          <label htmlFor="vcColor" className="block text-sm font-medium text-muted mb-1">Cor</label>
          <input type="color" id="vcColor" name="color" defaultValue={virtualCard?.color || "#38bdf8"} className="w-full h-[42px] px-1 py-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md" />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        {virtualCard ? (
          <button type="button" onClick={handleArchive} disabled={loading} className="px-4 py-2 text-sm font-medium text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-all">
            Arquivar
          </button>
        ) : <div />}
        <div className="space-x-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-all">Cancelar</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all disabled:opacity-50">
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </form>
  );
}
