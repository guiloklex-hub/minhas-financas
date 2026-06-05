"use client"

import { useState, useTransition } from "react";
import { RecurringRule } from "@prisma/client";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Pause,
  Play,
  ArrowUpCircle,
  ArrowDownCircle,
  CalendarClock,
} from "lucide-react";
import {
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  toggleRecurringRule,
} from "@/actions/recurring";

interface Option {
  id: string;
  name: string;
}

interface RecurringRulesClientProps {
  initialRules: RecurringRule[];
  categories: Option[];
  accounts: Option[];
}

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(date));
}

/**
 * Converte uma Date em "YYYY-MM-DD" (em UTC) para preencher inputs type=date
 * sem deslocamento de fuso.
 */
function toDateInputValue(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

export default function RecurringRulesClient({
  initialRules,
  categories,
  accounts,
}: RecurringRulesClientProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [frequency, setFrequency] = useState<string>("MONTHLY");
  const [error, setError] = useState<string | null>(null);

  const [isPendingSave, startTransitionSave] = useTransition();
  const [isPendingDelete, startTransitionDelete] = useTransition();
  const [isPendingToggle, startTransitionToggle] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingRule(null);
    setFrequency("MONTHLY");
    setError(null);
    setIsFormOpen(true);
  };

  const openEdit = (rule: RecurringRule) => {
    setEditingRule(rule);
    setFrequency(rule.frequency);
    setError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingRule(null);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransitionSave(async () => {
      const result = editingRule
        ? await updateRecurringRule(editingRule.id, formData)
        : await createRecurringRule(formData);

      if (result.success) {
        closeForm();
      } else {
        setError(result.error);
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta regra de recorrência?")) return;
    setBusyId(id);
    startTransitionDelete(async () => {
      const result = await deleteRecurringRule(id);
      setBusyId(null);
      if (!result.success) setError(result.error);
    });
  };

  const handleToggle = (id: string) => {
    setBusyId(id);
    startTransitionToggle(async () => {
      const result = await toggleRecurringRule(id);
      setBusyId(null);
      if (!result.success) setError(result.error);
    });
  };

  const needsDayOfMonth = frequency === "MONTHLY" || frequency === "YEARLY";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {initialRules.length} regra{initialRules.length === 1 ? "" : "s"} cadastrada
          {initialRules.length === 1 ? "" : "s"}.
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md transition-colors"
        >
          <Plus size={16} /> Nova Recorrência
        </button>
      </div>

      {error && !isFormOpen && (
        <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
          {error}
        </div>
      )}

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm"
        >
          <h3 className="text-xl font-semibold">
            {editingRule ? "Editar Recorrência" : "Nova Recorrência"}
          </h3>

          {error && (
            <div className="p-3 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="title" className="block text-sm font-medium text-white/70 mb-1">
                Título
              </label>
              <input
                type="text"
                id="title"
                name="title"
                required
                maxLength={120}
                defaultValue={editingRule?.title ?? ""}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Ex: Salário, Aluguel, Assinatura..."
              />
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-white/70 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                id="amount"
                name="amount"
                required
                step="0.01"
                min="0"
                defaultValue={editingRule?.amount ?? ""}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="type" className="block text-sm font-medium text-white/70 mb-1">
                Tipo
              </label>
              <select
                id="type"
                name="type"
                required
                defaultValue={editingRule?.type ?? "EXPENSE"}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </select>
            </div>

            <div>
              <label htmlFor="frequency" className="block text-sm font-medium text-white/70 mb-1">
                Frequência
              </label>
              <select
                id="frequency"
                name="frequency"
                required
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensal</option>
                <option value="YEARLY">Anual</option>
              </select>
            </div>

            {needsDayOfMonth && (
              <div>
                <label htmlFor="dayOfMonth" className="block text-sm font-medium text-white/70 mb-1">
                  Dia do mês
                </label>
                <input
                  type="number"
                  id="dayOfMonth"
                  name="dayOfMonth"
                  required={needsDayOfMonth}
                  min="1"
                  max="31"
                  defaultValue={editingRule?.dayOfMonth ?? ""}
                  className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="1 a 31"
                />
              </div>
            )}

            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-white/70 mb-1">
                Próxima execução
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                required
                defaultValue={
                  editingRule ? toDateInputValue(editingRule.nextRunDate) : ""
                }
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium text-white/70 mb-1">
                Categoria
              </label>
              <select
                id="categoryId"
                name="categoryId"
                required
                defaultValue={editingRule?.categoryId ?? ""}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="accountId" className="block text-sm font-medium text-white/70 mb-1">
                Conta
              </label>
              <select
                id="accountId"
                name="accountId"
                required
                defaultValue={editingRule?.accountId ?? ""}
                className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPendingSave}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPendingSave ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editingRule ? (
                <Pencil size={16} />
              ) : (
                <Plus size={16} />
              )}
              {isPendingSave ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {initialRules.length === 0 && !isFormOpen ? (
          <div className="py-12 text-center text-white/50 border border-dashed border-[var(--color-border)] rounded-xl">
            Nenhuma regra de recorrência cadastrada. Clique em &quot;Nova Recorrência&quot; para
            começar.
          </div>
        ) : (
          initialRules.map((rule) => {
            const isBusy = busyId === rule.id && (isPendingDelete || isPendingToggle);
            const isIncome = rule.type === "INCOME";

            return (
              <div
                key={rule.id}
                className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isIncome ? (
                    <ArrowUpCircle className="text-emerald-500 shrink-0" size={28} />
                  ) : (
                    <ArrowDownCircle className="text-rose-500 shrink-0" size={28} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold truncate">{rule.title}</h4>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          rule.isActive
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-white/10 text-white/50"
                        }`}
                      >
                        {rule.isActive ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 mt-1">
                      <span>{FREQUENCY_LABELS[rule.frequency] ?? rule.frequency}</span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={12} /> Próxima: {formatDate(rule.nextRunDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`font-semibold tabular-nums ${
                      isIncome ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {isIncome ? "+" : "-"}
                    {formatCurrency(rule.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(rule.id)}
                      disabled={isBusy}
                      className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                      aria-label={rule.isActive ? "Pausar regra" : "Retomar regra"}
                      title={rule.isActive ? "Pausar" : "Retomar"}
                    >
                      {isBusy && isPendingToggle ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : rule.isActive ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(rule)}
                      className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      aria-label="Editar regra"
                      title="Editar"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={isBusy}
                      className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                      aria-label="Excluir regra"
                      title="Excluir"
                    >
                      {isBusy && isPendingDelete ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
