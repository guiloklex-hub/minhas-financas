"use client";

import { useState, useTransition } from "react";
import { Transaction, Category, Account } from "@prisma/client";
import { Edit2, Trash2, Loader2 } from "lucide-react";
import { deleteTransaction, deleteRecurrenceSeries } from "@/actions/transactions";
import EditTransactionModal from "./EditTransactionModal";

type TransactionWithRelations = Transaction & { 
  category: Category | null;
  account: Account | null;
};

interface Props {
  initialTransactions: TransactionWithRelations[];
  categories: Category[];
  accounts: Account[];
}

export default function TransactionListClient({ initialTransactions, categories, accounts }: Props) {
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>(initialTransactions);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPendingDelete, startTransitionDelete] = useTransition();
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithRelations | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return new Intl.DateTimeFormat('pt-BR').format(localDate);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(transactions.length / itemsPerPage) || 1;
  const currentTransactions = transactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function removeFromList(predicate: (t: TransactionWithRelations) => boolean) {
    setTransactions(prev => {
      const newTx = prev.filter(t => !predicate(t));
      const newTotalPages = Math.ceil(newTx.length / itemsPerPage) || 1;
      if (currentPage > newTotalPages) setCurrentPage(newTotalPages);
      return newTx;
    });
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
            removeFromList(tx => tx.recurrenceGroupId === groupId);
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
          removeFromList(tx => tx.id === t.id);
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
        if (t.transferGroupId) {
          const groupId = t.transferGroupId;
          removeFromList(tx => tx.transferGroupId === groupId);
        } else {
          removeFromList(tx => tx.id === t.id);
        }
      } else {
        alert(res.error || "Erro ao excluir transação.");
      }
      setDeletingId(null);
    });
  }

  function handleUpdateSuccess(updatedTx: Transaction) {
    // Reconstruct the transaction with relations for the list
    const category = categories.find(c => c.id === updatedTx.categoryId) || null;
    const account = accounts.find(a => a.id === updatedTx.accountId) || null;
    
    const fullUpdatedTx: TransactionWithRelations = {
      ...updatedTx,
      category,
      account
    };

    setTransactions(prev => prev.map(t => t.id === updatedTx.id ? fullUpdatedTx : t));
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-[var(--color-border)] uppercase text-white/60">
              <tr>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Conta</th>
                <th className="px-6 py-4 font-medium text-right">Valor</th>
                <th className="px-6 py-4 font-medium text-center w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {currentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/50">Nenhuma transação encontrada.</td>
                </tr>
              ) : (
                currentTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-white/80">{formatDate(t.date)}</td>
                    <td className="px-6 py-4 font-medium">{t.title}</td>
                    <td className="px-6 py-4 text-white/80">
                      <span 
                        className="px-2 py-1 rounded-md text-xs font-medium bg-white/10"
                        style={{ color: t.category?.color || '#fff' }}
                      >
                        {t.category?.name || "Sem categoria"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/80">{t.account?.name || "Sem conta"}</td>
                    <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${t.type === 'INCOME' ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                      {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingTransaction(t)}
                          disabled={Boolean(t.transferGroupId) || (isPendingDelete && deletingId === t.id)}
                          className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-zinc-400 disabled:hover:bg-transparent"
                          title={t.transferGroupId ? "Transferências não são editáveis individualmente" : "Editar"}
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
                ))
              )}
            </tbody>
          </table>
        </div>
        {transactions.length > itemsPerPage && (
          <div className="p-4 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between text-sm gap-4">
            <span className="text-zinc-400">
              Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, transactions.length)} de {transactions.length} transações
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors"
              >
                Anterior
              </button>
              <span className="px-4 py-1.5 flex items-center justify-center bg-black/20 rounded-md text-zinc-300 font-medium border border-white/5">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-white disabled:opacity-50 hover:bg-white/10 transition-colors"
              >
                Próximo
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
          onSuccess={handleUpdateSuccess}
        />
      )}
    </>
  );
}
