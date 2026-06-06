"use client"

import { useState, useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { createCardPurchase } from "@/actions/credit-card-transactions";
import { createCardPurchaseFromText } from "@/actions/ai-card-purchase";

type CategoryOption = { id: string; name: string };

interface Props {
  cardId: string;
  categories: CategoryOption[];
  onSuccess: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CardPurchaseForm({ cardId, categories, onSuccess, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [international, setInternational] = useState(false);
  const [magicText, setMagicText] = useState("");
  const [magicLoading, setMagicLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleMagic = async () => {
    if (!magicText.trim()) return;
    setMagicLoading(true);
    setError(null);
    const result = await createCardPurchaseFromText(magicText, cardId);
    setMagicLoading(false);
    if (result.success) {
      setMagicText("");
      onSuccess();
    } else {
      setError(result.error || "Não foi possível interpretar a compra.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await createCardPurchase(new FormData(e.currentTarget));
    setLoading(false);
    if (result.success) {
      if (formRef.current) formRef.current.reset();
      onSuccess();
    } else {
      setError(result.error || "Erro ao registrar a compra.");
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
      <h3 className="text-xl font-semibold mb-2">Nova compra</h3>
      <input type="hidden" name="cardId" value={cardId} />

      {error && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">{error}</div>
      )}

      {/* Lançamento mágico (IA): texto livre → compra parcelada */}
      <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-purple-300 mb-2">
          <Sparkles size={15} /> Lançamento mágico (IA)
        </label>
        <div className="flex gap-2">
          <input
            value={magicText}
            onChange={(e) => setMagicText(e.target.value)}
            className={inputClass}
            placeholder='Ex: "parcelei a geladeira em 10x de 350"'
          />
          <button
            type="button"
            onClick={handleMagic}
            disabled={magicLoading || !magicText.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 rounded-md transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {magicLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Interpretar
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-white/70 mb-1">Descrição</label>
        <input id="title" name="title" required className={inputClass} placeholder="Ex: Mercado, Geladeira..." />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-white/70 mb-1">Valor total</label>
          <input type="number" id="amount" name="amount" required step="0.01" min="0.01" className={inputClass} />
        </div>
        <div>
          <label htmlFor="installments" className="block text-sm font-medium text-white/70 mb-1">Parcelas</label>
          <input type="number" id="installments" name="installments" min="1" max="72" defaultValue={1} className={inputClass} />
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-white/70 mb-1">Data</label>
          <input type="date" id="date" name="date" required defaultValue={todayISO()} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="categoryId" className="block text-sm font-medium text-white/70 mb-1">Categoria</label>
        <select id="categoryId" name="categoryId" className={inputClass} defaultValue="">
          <option value="">— Sem categoria —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-white/70 mb-1">Observações</label>
        <input id="notes" name="notes" className={inputClass} placeholder="Opcional" />
      </div>

      <div className="pt-1">
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={international} onChange={(e) => setInternational(e.target.checked)} />
          Compra internacional
        </label>
      </div>

      {international && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="fxCurrency" className="block text-sm font-medium text-white/70 mb-1">Moeda</label>
            <input id="fxCurrency" name="fxCurrency" maxLength={3} className={inputClass} placeholder="USD" />
          </div>
          <div>
            <label htmlFor="fxAmount" className="block text-sm font-medium text-white/70 mb-1">Valor (moeda)</label>
            <input type="number" id="fxAmount" name="fxAmount" step="0.01" min="0" className={inputClass} />
          </div>
          <div>
            <label htmlFor="iofAmount" className="block text-sm font-medium text-white/70 mb-1">IOF (R$)</label>
            <input type="number" id="iofAmount" name="iofAmount" step="0.01" min="0" className={inputClass} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all">Cancelar</button>
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all disabled:opacity-50">
          {loading ? "Salvando..." : "Adicionar compra"}
        </button>
      </div>
    </form>
  );
}
