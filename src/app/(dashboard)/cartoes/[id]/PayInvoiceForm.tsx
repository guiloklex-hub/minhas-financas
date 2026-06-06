"use client"

import { useState } from "react";
import { payInvoice } from "@/actions/credit-card-invoices";

type AccountOption = { id: string; name: string };

interface Props {
  invoiceId: string;
  outstanding: number;
  accounts: AccountOption[];
  defaultAccountId?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PayInvoiceForm({
  invoiceId,
  outstanding,
  accounts,
  defaultAccountId,
  onSuccess,
  onCancel,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await payInvoice(new FormData(e.currentTarget));
    setLoading(false);
    if (result.success) onSuccess();
    else setError(result.error || "Erro ao pagar a fatura.");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
      <h3 className="text-xl font-semibold mb-2">Pagar fatura</h3>
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {error && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">{error}</div>
      )}

      <div>
        <label htmlFor="fromAccountId" className="block text-sm font-medium text-white/70 mb-1">Conta de pagamento</label>
        <select id="fromAccountId" name="fromAccountId" required defaultValue={defaultAccountId || ""} className={inputClass}>
          <option value="" disabled>Selecione…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-white/70 mb-1">Valor</label>
          <input type="number" id="amount" name="amount" required step="0.01" min="0.01" defaultValue={outstanding > 0 ? outstanding : ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-white/70 mb-1">Data</label>
          <input type="date" id="date" name="date" required defaultValue={todayISO()} className={inputClass} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all">Cancelar</button>
        <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all disabled:opacity-50">
          {loading ? "Processando..." : "Confirmar pagamento"}
        </button>
      </div>
    </form>
  );
}
