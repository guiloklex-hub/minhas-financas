"use client";

import { useState, useTransition } from "react";
import {
  upsertExchangeRate,
  deleteExchangeRate,
  refreshExchangeRates,
} from "@/actions/exchange-rates";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { Plus, Trash2, Loader2, Pencil, Check, X, ArrowRightLeft, RefreshCw } from "lucide-react";
import { ExchangeRate } from "@/generated/prisma/client";

function toDateInput(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // Usa as partes UTC para evitar deslocamento de fuso ao exibir YYYY-MM-DD.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatRateDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

export default function CurrencyClient({
  initialRates,
}: {
  initialRates: ExchangeRate[];
}) {
  const [rates, setRates] = useState(initialRates);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");

  const [isRefreshing, startRefreshTransition] = useTransition();
  const [refreshMsg, setRefreshMsg] = useState("");

  const today = toDateInput(new Date());

  function handleRefresh() {
    setRefreshMsg("");
    startRefreshTransition(async () => {
      const res = await refreshExchangeRates();
      if (res.success && res.data) {
        setRates(res.data);
        setRefreshMsg(res.message ?? "Cotações atualizadas.");
      } else {
        setRefreshMsg(res.error ?? "Erro ao atualizar cotações.");
      }
    });
  }

  function reload(updated: ExchangeRate) {
    setRates((prev) => {
      const exists = prev.some((r) => r.id === updated.id);
      const next = exists
        ? prev.map((r) => (r.id === updated.id ? updated : r))
        : [updated, ...prev];
      return next.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const target = e.currentTarget;
    startTransition(async () => {
      const res = await upsertExchangeRate(formData);

      if (res.success && res.data) {
        reload(res.data);
        target.reset();
      } else {
        setError(res.error || "Erro ao salvar cotação.");
      }
    });
  }

  function startEdit(rate: ExchangeRate) {
    setEditError("");
    setEditingId(rate.id);
    setEditRate(String(rate.rate));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  function handleUpdate(rate: ExchangeRate) {
    setEditError("");

    const formData = new FormData();
    formData.append("base", rate.base);
    formData.append("quote", rate.quote);
    formData.append("rate", editRate);
    formData.append("date", toDateInput(rate.date));

    startEditTransition(async () => {
      const res = await upsertExchangeRate(formData);

      if (res.success && res.data) {
        reload(res.data);
        setEditingId(null);
      } else {
        setEditError(res.error || "Erro ao atualizar cotação.");
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta cotação?")) return;

    setLoadingId(id);
    setError("");
    const res = await deleteExchangeRate(id);

    if (res.success) {
      setRates((prev) => prev.filter((r) => r.id !== id));
    } else {
      setError(res.error || "Erro ao excluir.");
    }
    setLoadingId(null);
  }

  const selectClass =
    "w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-lg font-bold text-foreground">Nova Cotação</h3>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Buscar cotações na API externa (AwesomeAPI)"
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-accent hover:bg-accent text-foreground/80 hover:text-foreground border border-white/10 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Atualizar cotações
          </button>
        </div>
        <p className="text-sm text-muted mb-2">
          Cadastre manualmente a taxa de conversão entre duas moedas, ou use
          &quot;Atualizar cotações&quot; para buscar automaticamente da API externa.
          Uma unidade da moeda de origem equivale à taxa informada na moeda de destino.
        </p>
        {refreshMsg && <p className="text-xs text-muted mb-4">{refreshMsg}</p>}
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              De (origem)
            </label>
            <select name="base" required defaultValue="USD" className={selectClass}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Para (destino)
            </label>
            <select name="quote" required defaultValue="BRL" className={selectClass}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Taxa
            </label>
            <input
              name="rate"
              type="number"
              step="0.000001"
              min="0"
              required
              placeholder="Ex: 5.42"
              className={selectClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Data
            </label>
            <input
              name="date"
              type="date"
              required
              defaultValue={today}
              className={selectClass}
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="h-[42px] px-6 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            Salvar
          </button>
        </form>
        {error && <p className="text-rose-500 text-sm mt-3">{error}</p>}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-accent border-b border-border uppercase text-muted">
            <tr>
              <th className="px-6 py-4 font-medium">Conversão</th>
              <th className="px-6 py-4 font-medium w-48">Taxa</th>
              <th className="px-6 py-4 font-medium w-40">Data</th>
              <th className="px-6 py-4 font-medium w-32 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rates.map((rate) => {
              const isEditing = editingId === rate.id;
              return (
                <tr
                  key={rate.id}
                  className="hover:bg-accent transition-colors align-middle"
                >
                  <td className="px-6 py-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{rate.base}</span>
                      <ArrowRightLeft size={14} className="text-muted" />
                      <span className="font-mono">{rate.quote}</span>
                    </div>
                  </td>
                  {isEditing ? (
                    <>
                      <td className="px-6 py-4">
                        <input
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          type="number"
                          step="0.000001"
                          min="0"
                          autoFocus
                          className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-6 py-4 text-muted">
                        {formatRateDate(rate.date)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleUpdate(rate)}
                            disabled={isEditPending}
                            title="Salvar"
                            className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isEditPending ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Check size={16} />
                            )}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isEditPending}
                            title="Cancelar"
                            className="p-2 text-muted hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-foreground font-mono">
                        {rate.rate}
                      </td>
                      <td className="px-6 py-4 text-muted">
                        {formatRateDate(rate.date)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(rate)}
                            disabled={loadingId === rate.id || isPending}
                            title="Editar"
                            className="p-2 text-muted hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(rate.id)}
                            disabled={loadingId === rate.id || isPending}
                            title="Excluir"
                            className="p-2 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {loadingId === rate.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {rates.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-muted"
                >
                  Nenhuma cotação cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {editError && (
          <p className="text-rose-500 text-sm px-6 py-3 border-t border-border">
            {editError}
          </p>
        )}
      </div>
    </div>
  );
}
