"use client"

import { useState, useRef } from "react";
import { createCard, updateCard, archiveCard } from "@/actions/credit-cards";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { CreditCard } from "@/generated/prisma/client";

type AccountOption = { id: string; name: string };

interface CardFormProps {
  card?: CreditCard | null;
  accounts: AccountOption[];
  onSuccess: () => void;
  onCancel: () => void;
}

const BRANDS = ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD", "OTHER"];
const REWARD_TYPES: { value: string; label: string }[] = [
  { value: "NONE", label: "Sem recompensa" },
  { value: "CASHBACK", label: "Cashback" },
  { value: "POINTS", label: "Pontos" },
  { value: "MILES", label: "Milhas" },
];

const inputClass =
  "w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500";

export default function CardForm({ card, accounts, onSuccess, onCancel }: CardFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = card ? await updateCard(card.id, formData) : await createCard(formData);
    setLoading(false);
    if (result.success) {
      if (formRef.current) formRef.current.reset();
      onSuccess();
    } else {
      setError(result.error || "Ocorreu um erro desconhecido.");
    }
  };

  const handleArchive = async () => {
    if (!card) return;
    if (!confirm("Arquivar este cartão? Ele deixará de aparecer na lista, mas o histórico é preservado.")) return;
    setLoading(true);
    const result = await archiveCard(card.id);
    setLoading(false);
    if (result.success) onSuccess();
    else setError(result.error || "Erro ao arquivar cartão.");
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm"
    >
      <h3 className="text-xl font-semibold mb-4">{card ? "Editar Cartão" : "Novo Cartão"}</h3>

      {error && (
        <div className="p-3 mb-4 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-white/70 mb-1">Nome do cartão</label>
        <input id="name" name="name" required defaultValue={card?.name || ""} className={inputClass} placeholder="Ex: Nubank, Inter Black..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="brand" className="block text-sm font-medium text-white/70 mb-1">Bandeira</label>
          <select id="brand" name="brand" defaultValue={card?.brand || "OTHER"} className={inputClass}>
            {BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lastFour" className="block text-sm font-medium text-white/70 mb-1">Últimos 4 dígitos</label>
          <input id="lastFour" name="lastFour" inputMode="numeric" maxLength={4} defaultValue={card?.lastFour || ""} className={inputClass} placeholder="1234" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="creditLimit" className="block text-sm font-medium text-white/70 mb-1">Limite</label>
          <input type="number" id="creditLimit" name="creditLimit" required step="0.01" min="0" defaultValue={card?.creditLimit ?? 0} className={inputClass} />
        </div>
        <div>
          <label htmlFor="closingDay" className="block text-sm font-medium text-white/70 mb-1">Fechamento</label>
          <input type="number" id="closingDay" name="closingDay" required min="1" max="31" defaultValue={card?.closingDay ?? 1} className={inputClass} />
        </div>
        <div>
          <label htmlFor="dueDay" className="block text-sm font-medium text-white/70 mb-1">Vencimento</label>
          <input type="number" id="dueDay" name="dueDay" required min="1" max="31" defaultValue={card?.dueDay ?? 10} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-white/70 mb-1">Moeda</label>
          <select id="currency" name="currency" defaultValue={card?.currency || "BRL"} className={inputClass}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} — {c.code}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="color" className="block text-sm font-medium text-white/70 mb-1">Cor</label>
          <input type="color" id="color" name="color" defaultValue={card?.color || "#7c3aed"} className="w-full h-[42px] px-1 py-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md" />
        </div>
      </div>

      <div>
        <label htmlFor="paymentAccountId" className="block text-sm font-medium text-white/70 mb-1">Conta de pagamento padrão</label>
        <select id="paymentAccountId" name="paymentAccountId" defaultValue={card?.paymentAccountId || ""} className={inputClass}>
          <option value="">— Nenhuma —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="rewardType" className="block text-sm font-medium text-white/70 mb-1">Recompensa</label>
          <select id="rewardType" name="rewardType" defaultValue={card?.rewardType || "NONE"} className={inputClass}>
            {REWARD_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rewardRate" className="block text-sm font-medium text-white/70 mb-1">Taxa (por R$)</label>
          <input type="number" id="rewardRate" name="rewardRate" step="0.01" min="0" defaultValue={card?.rewardRate ?? 0} className={inputClass} placeholder="1 = 1 ponto/R$" />
        </div>
        <div>
          <label htmlFor="annualFee" className="block text-sm font-medium text-white/70 mb-1">Anuidade</label>
          <input type="number" id="annualFee" name="annualFee" step="0.01" min="0" defaultValue={card?.annualFee ?? 0} className={inputClass} />
        </div>
      </div>

      <div className="flex justify-between items-center pt-4">
        {card ? (
          <button type="button" onClick={handleArchive} disabled={loading} className="px-4 py-2 text-sm font-medium text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-all duration-200">
            Arquivar
          </button>
        ) : <div />}
        <div className="space-x-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all duration-200">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </form>
  );
}
