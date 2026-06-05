"use client";

import { useState, useTransition } from "react";
import { Goal } from "@/generated/prisma/client";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Target,
  PiggyBank,
  X,
  Check,
  CalendarClock,
  Wallet,
  Trophy,
} from "lucide-react";
import { createGoal, updateGoal, deleteGoal, addToGoal } from "@/actions/goals";

type AccountOption = { id: string; name: string; currency: string };

interface GoalsClientProps {
  initialGoals: Goal[];
  accounts: AccountOption[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

// Converte a deadline (Date | null) para o formato YYYY-MM-DD do <input type="date">.
function toDateInputValue(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function GoalsClient({ initialGoals, accounts }: GoalsClientProps) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formError, setFormError] = useState("");
  const [isSavePending, startSaveTransition] = useTransition();

  // Estado do aporte (qual meta está com o painel de aporte aberto).
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributionValue, setContributionValue] = useState("");
  const [contributionError, setContributionError] = useState("");
  const [isContributePending, startContributeTransition] = useTransition();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState("");

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  function openCreate() {
    setEditingGoal(null);
    setFormError("");
    setIsFormOpen(true);
    setContributingId(null);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setFormError("");
    setIsFormOpen(true);
    setContributingId(null);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingGoal(null);
    setFormError("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const formData = new FormData(e.currentTarget);
    const target = e.currentTarget;
    const current = editingGoal;

    startSaveTransition(async () => {
      const res = current ? await updateGoal(current.id, formData) : await createGoal(formData);

      if (res.success && res.data) {
        const saved = res.data;
        setGoals((prev) =>
          current ? prev.map((g) => (g.id === saved.id ? saved : g)) : [saved, ...prev]
        );
        target.reset();
        closeForm();
      } else {
        setFormError(res.error || "Erro ao salvar meta.");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta meta?")) return;

    setListError("");
    setDeletingId(id);
    startSaveTransition(async () => {
      const res = await deleteGoal(id);
      if (res.success) {
        setGoals((prev) => prev.filter((g) => g.id !== id));
      } else {
        setListError(res.error || "Erro ao excluir meta.");
      }
      setDeletingId(null);
    });
  }

  function openContribution(id: string) {
    setContributingId(id);
    setContributionValue("");
    setContributionError("");
    setIsFormOpen(false);
  }

  function handleContribute(id: string) {
    setContributionError("");

    const formData = new FormData();
    formData.append("amount", contributionValue);

    startContributeTransition(async () => {
      const res = await addToGoal(id, formData);
      if (res.success && res.data) {
        const saved = res.data;
        setGoals((prev) => prev.map((g) => (g.id === saved.id ? saved : g)));
        setContributingId(null);
        setContributionValue("");
      } else {
        setContributionError(res.error || "Erro ao adicionar aporte.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Target size={20} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Metas</h2>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md transition-all duration-200 flex items-center gap-2"
        >
          <Plus size={16} />
          Nova Meta
        </button>
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm"
        >
          <h3 className="text-xl font-semibold mb-2">{editingGoal ? "Editar Meta" : "Nova Meta"}</h3>

          {formError && (
            <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-white/70 mb-1">
              Nome da Meta
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={editingGoal?.name ?? ""}
              placeholder="Ex: Reserva de emergência"
              className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="targetAmount" className="block text-sm font-medium text-white/70 mb-1">
                Valor Alvo (R$)
              </label>
              <input
                type="number"
                id="targetAmount"
                name="targetAmount"
                required
                step="0.01"
                min="0"
                defaultValue={editingGoal ? editingGoal.targetAmount : ""}
                placeholder="10000.00"
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="currentAmount" className="block text-sm font-medium text-white/70 mb-1">
                Valor Atual (R$)
              </label>
              <input
                type="number"
                id="currentAmount"
                name="currentAmount"
                step="0.01"
                min="0"
                defaultValue={editingGoal ? editingGoal.currentAmount : 0}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="deadline" className="block text-sm font-medium text-white/70 mb-1">
                Prazo (opcional)
              </label>
              <input
                type="date"
                id="deadline"
                name="deadline"
                defaultValue={toDateInputValue(editingGoal?.deadline ?? null)}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="accountId" className="block text-sm font-medium text-white/70 mb-1">
                Conta vinculada (opcional)
              </label>
              <select
                id="accountId"
                name="accountId"
                defaultValue={editingGoal?.accountId ?? "none"}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="none">Nenhuma</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end items-center gap-3 pt-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all duration-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavePending}
              className="px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSavePending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {listError && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
          {listError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((goal) => {
          const rawPercent =
            goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
          const percent = Math.min(rawPercent, 100);
          const achieved = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
          const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
          const accountName = goal.accountId ? accountNameById.get(goal.accountId) : null;

          return (
            <div
              key={goal.id}
              className={`p-5 rounded-xl border bg-[var(--color-card)] shadow-sm transition-all duration-200 ${
                achieved
                  ? "border-emerald-500 ring-1 ring-emerald-500/40"
                  : "border-[var(--color-border)] hover:border-emerald-500/30"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="font-semibold text-lg truncate">{goal.name}</h4>
                  {achieved && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      <Trophy size={12} />
                      Concluída
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(goal)}
                    title="Editar"
                    className="p-2 text-white/50 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    disabled={deletingId === goal.id}
                    title="Excluir"
                    className="p-2 text-white/50 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === goal.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-end justify-between mb-2">
                  <p className="text-2xl font-bold text-emerald-400">
                    {formatCurrency(goal.currentAmount)}
                  </p>
                  <p className="text-sm text-white/50">de {formatCurrency(goal.targetAmount)}</p>
                </div>

                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      achieved ? "bg-emerald-400" : "bg-emerald-500"
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span
                    className={`text-xs font-medium ${
                      achieved ? "text-emerald-400" : "text-white/60"
                    }`}
                  >
                    {rawPercent.toFixed(1)}%
                  </span>
                  {!achieved && (
                    <span className="text-xs text-white/50">
                      Faltam {formatCurrency(remaining)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
                {goal.deadline && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock size={14} />
                    Prazo: {formatDate(goal.deadline)}
                  </span>
                )}
                {accountName && (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet size={14} />
                    {accountName}
                  </span>
                )}
              </div>

              {contributingId === goal.id ? (
                <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-2">
                  <label className="block text-xs font-medium text-white/70">
                    Valor do aporte (R$)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={contributionValue}
                      onChange={(e) => setContributionValue(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      onClick={() => handleContribute(goal.id)}
                      disabled={isContributePending}
                      title="Confirmar aporte"
                      className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isContributePending ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Check size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => setContributingId(null)}
                      disabled={isContributePending}
                      title="Cancelar"
                      className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {contributionError && (
                    <p className="text-rose-500 text-xs">{contributionError}</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => openContribution(goal.id)}
                  className="mt-4 w-full px-4 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <PiggyBank size={16} />
                  Adicionar aporte
                </button>
              )}
            </div>
          );
        })}

        {goals.length === 0 && !isFormOpen && (
          <div className="col-span-full py-12 text-center text-white/50 border border-dashed border-[var(--color-border)] rounded-xl">
            Nenhuma meta cadastrada. Clique em &quot;Nova Meta&quot; para começar.
          </div>
        )}
      </div>
    </div>
  );
}
