"use client"

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { analyzeCsvForImport, confirmCsvImport, type AnalyzedRow, type CsvCategorizeMode } from "@/actions/importer";
import { Category, Account } from "@/generated/prisma/client";

type EditableRow = AnalyzedRow & { categoryId: string };

type Counts = { total: number; duplicates: number; history: number; ai: number; unresolved: number };

const selectClass =
  "w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors";

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  history: { label: "Histórico", className: "bg-sky-500/15 text-sky-400" },
  ai: { label: "IA", className: "bg-purple-500/15 text-purple-400" },
  default: { label: "Padrão", className: "bg-zinc-700/40 text-zinc-300" },
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function CsvImporter({ categories, accounts }: { categories: Category[]; accounts: Account[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Etapa 1 (config)
  const [accountId, setAccountId] = useState("");
  const [mode, setMode] = useState<CsvCategorizeMode>("ai");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");

  // Etapa 2 (preview)
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [aiUsed, setAiUsed] = useState(false);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  function handleAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    formData.set("mode", mode);

    startTransition(async () => {
      const result = await analyzeCsvForImport(formData);
      if (!result.success || !result.rows) {
        setMessage({ text: result.error || "Erro ao analisar o arquivo.", type: "error" });
        return;
      }
      // Pré-preenche a categoria de cada linha: sugestão ou categoria padrão.
      const editable: EditableRow[] = result.rows.map((r) => ({
        ...r,
        categoryId: r.suggestedCategoryId ?? defaultCategoryId,
      }));
      setRows(editable);
      setCounts(result.counts ?? null);
      setAiUsed(result.aiUsed ?? false);
      if (result.message) setMessage({ text: result.message, type: "success" });
    });
  }

  function handleConfirm() {
    if (!rows) return;
    setMessage(null);
    startTransition(async () => {
      const result = await confirmCsvImport({
        accountId,
        defaultCategoryId,
        rows: rows.map((r) => ({
          date: r.date,
          title: r.title,
          amount: r.amount,
          type: r.type,
          categoryId: r.categoryId || null,
        })),
      });
      if (result.success) {
        setMessage({ text: result.message || `${result.count} transações importadas!`, type: "success" });
        setRows(null);
        setCounts(null);
      } else {
        setMessage({ text: result.error || "Erro ao importar.", type: "error" });
      }
    });
  }

  function updateRowCategory(index: number, categoryId: string) {
    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, categoryId } : r)) : prev));
  }

  function resetToConfig() {
    setRows(null);
    setCounts(null);
    setMessage(null);
  }

  return (
    <div className="space-y-4 p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm">
      <h3 className="text-xl font-semibold text-white">Importar CSV</h3>

      {message && (
        <div className={`p-3 text-sm rounded-md ${message.type === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"}`}>
          {message.text}
        </div>
      )}

      {/* Etapa 1: configuração */}
      {!rows && (
        <form onSubmit={handleAnalyze} className="space-y-4">
          <p className="text-sm text-zinc-400">
            Formato: <code>Data, Título, Valor</code>. Valores positivos = Receitas; negativos = Despesas.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="csvFile" className="block text-sm font-medium mb-1 text-zinc-300">Arquivo CSV</label>
              <input
                required
                type="file"
                id="csvFile"
                name="file"
                accept=".csv"
                className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="csvAccountId" className="block text-sm font-medium mb-1 text-zinc-300">Conta de Destino</label>
              <select required id="csvAccountId" name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectClass}>
                <option value="">Selecione...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="csvMode" className="block text-sm font-medium mb-1 text-zinc-300">Categorização</label>
              <select id="csvMode" value={mode} onChange={(e) => setMode(e.target.value as CsvCategorizeMode)} className={selectClass}>
                <option value="ai">IA (histórico + IA)</option>
                <option value="history">Histórico</option>
                <option value="default">Categoria padrão para tudo</option>
              </select>
            </div>
            <div>
              <label htmlFor="csvDefaultCat" className="block text-sm font-medium mb-1 text-zinc-300">Categoria padrão (fallback)</label>
              <select required id="csvDefaultCat" value={defaultCategoryId} onChange={(e) => setDefaultCategoryId(e.target.value)} className={selectClass}>
                <option value="">Selecione...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {mode === "ai" && (
            <p className="flex items-center gap-1.5 text-xs text-purple-400">
              <Sparkles size={13} /> A IA classifica só os títulos que o histórico não reconhecer (mais barato). Você revisa antes de importar.
            </p>
          )}

          <button type="submit" disabled={pending} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {pending ? <Loader2 size={16} className="animate-spin" /> : null}
            {pending ? "Analisando..." : "Analisar"}
          </button>
        </form>
      )}

      {/* Etapa 2: pré-visualização editável */}
      {rows && (
        <div className="space-y-4">
          {counts && (
            <div className="text-sm text-zinc-400">
              {counts.total} lançamento(s) ·{" "}
              <span className="text-sky-400">{counts.history} histórico</span> ·{" "}
              <span className="text-purple-400">{counts.ai} IA</span> ·{" "}
              <span className="text-zinc-300">{counts.unresolved} sem sugestão</span>
              {counts.duplicates > 0 && <> · {counts.duplicates} duplicada(s) já ignorada(s)</>}
              {mode === "ai" && !aiUsed && <span className="text-amber-400"> · IA não disponível</span>}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 overflow-hidden max-h-[26rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-zinc-800 text-zinc-400 uppercase text-xs sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-left px-3 py-2">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(r.date))}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {r.title}
                      {r.source && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${SOURCE_BADGE[r.source].className}`}>
                          {SOURCE_BADGE[r.source].label}
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${r.type === "INCOME" ? "text-emerald-500" : "text-rose-500"}`}>
                      {r.type === "EXPENSE" ? "-" : ""}{formatBRL(r.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.categoryId}
                        onChange={(e) => updateRowCategory(i, e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-md p-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                        title={categoryName(r.categoryId)}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleConfirm} disabled={pending} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {pending ? <Loader2 size={16} className="animate-spin" /> : null}
              {pending ? "Importando..." : `Confirmar importação (${rows.length})`}
            </button>
            <button onClick={resetToConfig} disabled={pending} className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-all">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
