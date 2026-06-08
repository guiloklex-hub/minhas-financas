"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Transaction, Category, Account } from "@/generated/prisma/client";
import { Edit2, Trash2, Loader2, Search, Filter, X, ArrowRightLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle, Download } from "lucide-react";
import { deleteTransaction, deleteRecurrenceSeries, toggleReconciled } from "@/actions/transactions";
import { formatCivilDate } from "@/lib/format-date";
import EditTransactionModal from "./EditTransactionModal";
import EditTransferModal from "./EditTransferModal";

type TransactionWithRelations = Transaction & {
  category: Category | null;
  account: Account | null;
};

interface Filters {
  q: string;
  accountId: string;
  categoryId: string;
  type: string;
  from: string;
  to: string;
}

interface Props {
  transactions: TransactionWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  categories: Category[];
  accounts: Account[];
  filters: Filters;
}

export default function TransactionListClient({
  transactions,
  total,
  page,
  pageSize,
  categories,
  accounts,
  filters,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPendingDelete, startTransitionDelete] = useTransition();
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [isPendingReconcile, startTransitionReconcile] = useTransition();
  const [isNavigating, startNavigation] = useTransition();
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithRelations | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<TransactionWithRelations | null>(null);

  // Estado local dos campos de filtro (controlado), inicializado pela URL.
  const [draft, setDraft] = useState<Filters>(filters);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: Date | string) => formatCivilDate(date);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters = Boolean(
    filters.q || filters.accountId || filters.categoryId || filters.type || filters.from || filters.to
  );

  /** Navega para a URL com os filtros/página informados (preserva o resto). */
  function navigate(next: Partial<Filters & { page: number }>) {
    const merged: Filters & { page: number } = {
      q: next.q ?? filters.q,
      accountId: next.accountId ?? filters.accountId,
      categoryId: next.categoryId ?? filters.categoryId,
      type: next.type ?? filters.type,
      from: next.from ?? filters.from,
      to: next.to ?? filters.to,
      page: next.page ?? 1,
    };

    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.accountId) params.set("accountId", merged.accountId);
    if (merged.categoryId) params.set("categoryId", merged.categoryId);
    if (merged.type) params.set("type", merged.type);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.page > 1) params.set("page", String(merged.page));

    const query = params.toString();
    startNavigation(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function applyFilters(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Novo conjunto de filtros sempre volta para a página 1.
    navigate({ ...draft, page: 1 });
  }

  function clearFilters() {
    const empty: Filters = { q: "", accountId: "", categoryId: "", type: "", from: "", to: "" };
    setDraft(empty);
    startNavigation(() => {
      router.push(pathname);
    });
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    navigate({ ...filters, page: nextPage });
  }

  /** Monta a URL de exportação CSV usando os MESMOS filtros ativos (da URL). */
  function buildExportUrl(): string {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.type) params.set("type", filters.type);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const query = params.toString();
    return query ? `/api/export/transactions?${query}` : "/api/export/transactions";
  }

  function handleDelete(t: TransactionWithRelations) {
    // Série recorrente: oferecer exclusão da série inteira.
    if (t.recurrenceGroupId) {
      const deleteWholeSeries = confirm(
        "Esta transação faz parte de uma série recorrente.\n\n" +
          "Clique em OK para excluir TODA a série recorrente, ou em Cancelar para excluir apenas esta transação."
      );

      if (deleteWholeSeries) {
        const groupId = t.recurrenceGroupId;
        setDeletingId(t.id);
        startTransitionDelete(async () => {
          const res = await deleteRecurrenceSeries(groupId);
          if (res.success) {
            router.refresh();
          } else {
            alert(res.error || "Erro ao excluir a série recorrente.");
          }
          setDeletingId(null);
        });
        return;
      }

      // Caiu aqui: usuário escolheu excluir só esta. Segue para o fluxo padrão abaixo.
      setDeletingId(t.id);
      startTransitionDelete(async () => {
        const res = await deleteTransaction(t.id);
        if (res.success) {
          router.refresh();
        } else {
          alert(res.error || "Erro ao excluir transação.");
        }
        setDeletingId(null);
      });
      return;
    }

    // Transferência: ambas as pernas serão removidas.
    const confirmMessage = t.transferGroupId
      ? "Esta é uma transferência. Excluí-la removerá AMBAS as pernas (saída e entrada). Deseja continuar?"
      : "Tem certeza que deseja excluir esta transação?";

    if (!confirm(confirmMessage)) return;

    setDeletingId(t.id);
    startTransitionDelete(async () => {
      const res = await deleteTransaction(t.id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Erro ao excluir transação.");
      }
      setDeletingId(null);
    });
  }

  function handleToggleReconciled(t: TransactionWithRelations) {
    setReconcilingId(t.id);
    startTransitionReconcile(async () => {
      const res = await toggleReconciled(t.id);
      if (res.success) {
        router.refresh();
      } else {
        alert(res.error || "Erro ao alternar conciliação.");
      }
      setReconcilingId(null);
    });
  }

  function handleEditClick(t: TransactionWithRelations) {
    if (t.transferGroupId) {
      setEditingTransfer(t);
    } else {
      setEditingTransaction(t);
    }
  }

  function handleMutationSuccess() {
    // A lista é server-driven: re-busca a página atual do servidor.
    router.refresh();
  }

  const inputClass =
    "w-full bg-black/50 border border-[var(--color-border)] rounded-md p-2 text-sm focus:outline-none focus:border-white/50 transition-colors";

  return (
    <>
      {/* Barra de filtros */}
      <form
        onSubmit={applyFilters}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 text-white/70 text-sm font-medium">
          <Filter size={16} />
          <span>Filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-3">
            <label htmlFor="filter-q" className="block text-xs font-medium mb-1 text-white/60">Buscar por título</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <input
                id="filter-q"
                type="text"
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                placeholder="Ex: Mercado"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="filter-account" className="block text-xs font-medium mb-1 text-white/60">Conta</label>
            <select
              id="filter-account"
              value={draft.accountId}
              onChange={(e) => setDraft((d) => ({ ...d, accountId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Todas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-category" className="block text-xs font-medium mb-1 text-white/60">Categoria</label>
            <select
              id="filter-category"
              value={draft.categoryId}
              onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
              className={inputClass}
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-type" className="block text-xs font-medium mb-1 text-white/60">Tipo</label>
            <select
              id="filter-type"
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="INCOME">Receita</option>
              <option value="EXPENSE">Despesa</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-from" className="block text-xs font-medium mb-1 text-white/60">De</label>
            <input
              id="filter-from"
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="filter-to" className="block text-xs font-medium mb-1 text-white/60">Até</label>
            <input
              id="filter-to"
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isNavigating}
            className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isNavigating ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Aplicar
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              disabled={isNavigating}
              className="px-4 py-2 rounded-md bg-white/5 border border-white/10 text-white/80 text-sm font-medium hover:bg-white/10 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <X size={16} />
              Limpar
            </button>
          )}
          <a
            href={buildExportUrl()}
            download
            className="ml-auto px-4 py-2 rounded-md bg-white/5 border border-white/10 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors flex items-center gap-2"
            title="Exportar transações filtradas em CSV"
          >
            <Download size={16} />
            Exportar CSV
          </a>
        </div>
      </form>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-[var(--color-border)] uppercase text-white/60">
              <tr>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Tags</th>
                <th className="px-6 py-4 font-medium">Conta</th>
                <th className="px-6 py-4 font-medium text-right">Valor</th>
                <th className="px-6 py-4 font-medium text-center w-32">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-white/50">Nenhuma transação encontrada.</td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const tags = t.tags ? t.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-white/80">{formatDate(t.date)}</td>
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-2">
                          {t.transferGroupId && <ArrowRightLeft size={14} className="text-purple-400 shrink-0" />}
                          <span>{t.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white/80">
                        <span
                          className="px-2 py-1 rounded-md text-xs font-medium bg-white/10"
                          style={{ color: t.category?.color || '#fff' }}
                        >
                          {t.category?.name || "Sem categoria"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {tags.length === 0 ? (
                          <span className="text-white/30 text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-white/70 border border-white/10"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white/80">{t.account?.name || "Sem conta"}</td>
                      <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${t.type === 'INCOME' ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                        {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleToggleReconciled(t)}
                            disabled={isPendingReconcile && reconcilingId === t.id}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              t.reconciled
                                ? "text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                : "text-zinc-400 hover:text-white hover:bg-white/10"
                            }`}
                            title={t.reconciled ? "Conciliada — clique para desfazer" : "Marcar como conciliada"}
                          >
                            {isPendingReconcile && reconcilingId === t.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : t.reconciled ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <Circle size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => handleEditClick(t)}
                            disabled={isPendingDelete && deletingId === t.id}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={t.transferGroupId ? "Editar transferência" : "Editar"}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={isPendingDelete && deletingId === t.id}
                            className="p-2 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Excluir"
                          >
                            {isPendingDelete && deletingId === t.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <div className="p-4 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between text-sm gap-4">
            <span className="text-zinc-400">
              Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, total)} de {total} transações
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1 || isNavigating}
                onClick={() => goToPage(page - 1)}
                className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              <span className="px-4 py-1.5 flex items-center justify-center bg-black/20 rounded-md text-zinc-300 font-medium border border-white/5">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages || isNavigating}
                onClick={() => goToPage(page + 1)}
                className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                Próximo
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditingTransaction(null)}
          onSuccess={handleMutationSuccess}
        />
      )}

      {editingTransfer && (
        <EditTransferModal
          transaction={editingTransfer}
          onClose={() => setEditingTransfer(null)}
          onSuccess={handleMutationSuccess}
        />
      )}
    </>
  );
}
