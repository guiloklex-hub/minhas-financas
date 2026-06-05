"use client";

import { useTransition, useState } from "react";
import { updateTransfer } from "@/actions/transfers";
import { Transaction } from "@prisma/client";
import { X, Loader2, ArrowRightLeft } from "lucide-react";

interface Props {
  transaction: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * As pernas de uma transferência são salvas com sufixo " (Saída)" / " (Entrada)".
 * Removemos o sufixo para o usuário editar apenas o título base.
 */
function stripLegSuffix(title: string): string {
  return title.replace(/\s*\((Saída|Entrada)\)\s*$/u, "").trim();
}

export default function EditTransferModal({ transaction, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!transaction.transferGroupId) {
      setError("Esta transação não é uma transferência válida.");
      return;
    }

    const groupId = transaction.transferGroupId;
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateTransfer(groupId, formData);
      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.error || "Erro ao salvar as alterações.");
      }
    });
  }

  // Formata a data para o input (YYYY-MM-DD), alinhada à mesma conversão usada
  // ao exibir/editar transações.
  const formattedDate = new Date(
    new Date(transaction.date).getTime() - new Date().getTimezoneOffset() * 60000
  )
    .toISOString()
    .split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowRightLeft size={20} className="text-purple-400" />
            Editar Transferência
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
              {error}
            </div>
          )}

          <p className="text-sm text-white/60">
            As alterações são aplicadas às duas pernas da transferência (saída e entrada).
          </p>

          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1 text-zinc-300">Título</label>
            <input
              required
              type="text"
              id="title"
              name="title"
              defaultValue={stripLegSuffix(transaction.title)}
              className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="Ex: Transferência"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium mb-1 text-zinc-300">Valor (R$)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                id="amount"
                name="amount"
                defaultValue={transaction.amount}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium mb-1 text-zinc-300">Data</label>
              <input
                required
                type="date"
                id="date"
                name="date"
                defaultValue={formattedDate}
                className="w-full bg-black/40 border border-zinc-800 rounded-lg p-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {isPending ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
