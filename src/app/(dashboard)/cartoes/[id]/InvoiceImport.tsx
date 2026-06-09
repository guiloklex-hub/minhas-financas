"use client"

import { useState } from "react";
import { Loader2, FileText, Plus, Check, X } from "lucide-react";
import {
  extractInvoiceForImport,
  confirmInvoiceImport,
  type ExtractedInvoiceRow,
  type ExtractedSource,
  type SourceTarget,
} from "@/actions/ai-invoice-import";
import { createCategory } from "@/actions/categories";

type Option = { id: string; name: string };
type EditableRow = ExtractedInvoiceRow & { include: boolean; categoryId: string };

interface Props {
  cardId: string;
  categories: Option[];
  virtualCards: Option[];
  onClose: () => void;
  onImported: () => void;
}

const inputClass =
  "bg-background border border-border rounded-md p-1.5 text-foreground text-sm focus:outline-none focus:border-emerald-500";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(iso));
}

export default function InvoiceImport({ cardId, categories, virtualCards, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [categoryList, setCategoryList] = useState<Option[]>(categories);

  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [sources, setSources] = useState<ExtractedSource[]>([]);
  const [sourceTargets, setSourceTargets] = useState<Record<string, SourceTarget>>({});
  const [invoiceMeta, setInvoiceMeta] = useState<{ referenceMonth: number | null; referenceYear: number | null; total: number | null } | null>(null);

  const [creatingRow, setCreatingRow] = useState<number | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [catPending, setCatPending] = useState(false);

  async function handleAnalyze(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    fd.set("cardId", cardId);
    const result = await extractInvoiceForImport(fd);
    setLoading(false);
    if (!result.success) {
      setMessage({ text: result.error, type: "error" });
      return;
    }
    setRows(result.rows.map((r) => ({ ...r, include: !r.duplicate, categoryId: r.suggestedCategoryId ?? "" })));
    setSources(result.sources);
    setInvoiceMeta(result.invoice);
    const targets: Record<string, SourceTarget> = {};
    for (const s of result.sources) targets[s.key] = { target: s.suggestedVirtualCardId ?? "PHYSICAL" };
    setSourceTargets(targets);
    if (result.aiUsed === false) setMessage({ text: "IA de categorização indisponível — ajuste as categorias manualmente.", type: "error" });
  }

  async function handleConfirm() {
    if (!rows) return;
    setLoading(true);
    setMessage(null);
    const result = await confirmInvoiceImport({
      cardId,
      sourceMap: sourceTargets,
      rows: rows.map((r) => ({
        date: r.date,
        description: r.description,
        amount: r.amount,
        type: r.type,
        categoryId: r.categoryId || null,
        installmentNumber: r.installmentNumber,
        installmentTotal: r.installmentTotal,
        fxCurrency: r.fxCurrency,
        fxAmount: r.fxAmount,
        source: r.source,
        include: r.include,
      })),
    });
    setLoading(false);
    if (result.success) {
      onImported();
    } else {
      setMessage({ text: result.error || "Erro ao importar.", type: "error" });
    }
  }

  async function handleCreateCategory(index: number) {
    const name = newCatName.trim();
    if (!name || catPending) return;
    setCatPending(true);
    const fd = new FormData();
    fd.set("name", name);
    const result = await createCategory(fd);
    setCatPending(false);
    if (result.success && result.data) {
      const created = result.data;
      setCategoryList((prev) => [...prev, created]);
      setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, categoryId: created.id } : r)) : prev));
      setCreatingRow(null);
      setNewCatName("");
    } else {
      setMessage({ text: result.error || "Erro ao criar categoria.", type: "error" });
    }
  }

  const includedSum = rows ? rows.filter((r) => r.include).reduce((a, r) => a + (r.type === "REFUND" ? -r.amount : r.amount), 0) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-sky-400" />
          <h3 className="text-lg font-semibold text-foreground">Importar fatura (PDF) com IA</h3>
        </div>
        <button onClick={onClose} className="text-muted hover:text-foreground transition-colors"><X size={18} /></button>
      </div>

      {message && (
        <div className={`p-3 text-sm rounded-md ${message.type === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"}`}>
          {message.text}
        </div>
      )}

      {!rows ? (
        <form onSubmit={handleAnalyze} className="space-y-3">
          <p className="text-sm text-muted">Envie o PDF (ou foto) da fatura do cartão. A IA lê os lançamentos e você revisa antes de importar.</p>
          <input
            required
            type="file"
            name="file"
            accept=".pdf,image/*"
            className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 transition-colors"
          />
          <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? "Lendo fatura..." : "Analisar fatura"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="text-sm text-muted">
            {invoiceMeta?.referenceMonth && invoiceMeta?.referenceYear && (
              <>Competência {String(invoiceMeta.referenceMonth).padStart(2, "0")}/{invoiceMeta.referenceYear} · </>
            )}
            {rows.filter((r) => r.include).length}/{rows.length} selecionado(s) · Soma {fmtBRL(includedSum)}
            {invoiceMeta?.total != null && (
              <> · Total da fatura {fmtBRL(invoiceMeta.total)}{Math.abs(invoiceMeta.total - includedSum) > 0.5 && <span className="text-amber-400"> (divergente)</span>}</>
            )}
          </div>

          {/* Mapeamento de origens (cartões/virtuais) */}
          {sources.length > 1 && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs text-muted uppercase tracking-wider">Mapear cartões detectados</p>
              {sources.map((s) => {
                const t = sourceTargets[s.key] ?? { target: "PHYSICAL" };
                return (
                  <div key={s.key} className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-foreground w-40">{s.label}</span>
                    <select
                      value={t.target}
                      onChange={(e) => setSourceTargets((prev) => ({ ...prev, [s.key]: { target: e.target.value, newName: prev[s.key]?.newName } }))}
                      className={inputClass}
                    >
                      <option value="PHYSICAL">Cartão físico</option>
                      {virtualCards.map((v) => (
                        <option key={v.id} value={v.id}>{v.name} (virtual)</option>
                      ))}
                      <option value="NEW">+ Criar cartão virtual</option>
                    </select>
                    {t.target === "NEW" && (
                      <input
                        value={t.newName ?? ""}
                        onChange={(e) => setSourceTargets((prev) => ({ ...prev, [s.key]: { target: "NEW", newName: e.target.value } }))}
                        placeholder={s.lastFour ? `Virtual ${s.lastFour}` : "Nome do virtual"}
                        className={inputClass}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Linhas */}
          <div className="rounded-xl border border-border overflow-hidden max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent border-b border-border text-muted uppercase text-xs sticky top-0">
                <tr>
                  <th className="px-2 py-2"></th>
                  <th className="text-left px-2 py-2">Data</th>
                  <th className="text-left px-2 py-2">Descrição</th>
                  <th className="text-left px-2 py-2">Categoria</th>
                  <th className="text-right px-2 py-2">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((r, i) => (
                  <tr key={i} className={`hover:bg-accent ${r.include ? "" : "opacity-50"}`}>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => setRows((prev) => (prev ? prev.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) : prev))}
                      />
                    </td>
                    <td className="px-2 py-2 text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-2 py-2 text-foreground">
                      {r.description}
                      {r.installmentTotal && <span className="text-muted"> ({r.installmentNumber}/{r.installmentTotal})</span>}
                      {r.type === "REFUND" && <span className="ml-1 text-xs text-emerald-400">(estorno)</span>}
                      {r.type === "FEE" && <span className="ml-1 text-xs text-amber-400">(taxa)</span>}
                      {r.duplicate && <span className="ml-1 text-xs text-muted">(duplicada)</span>}
                    </td>
                    <td className="px-2 py-2">
                      {creatingRow === i ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(i); }
                              if (e.key === "Escape") { e.preventDefault(); setCreatingRow(null); setNewCatName(""); }
                            }}
                            placeholder="Nova categoria"
                            className={`w-32 ${inputClass}`}
                          />
                          <button type="button" onClick={() => handleCreateCategory(i)} disabled={catPending || !newCatName.trim()} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-40">
                            {catPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button type="button" onClick={() => { setCreatingRow(null); setNewCatName(""); }} className="p-1 rounded text-muted hover:bg-accent"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            value={r.categoryId}
                            onChange={(e) => setRows((prev) => (prev ? prev.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)) : prev))}
                            className={inputClass}
                          >
                            <option value="">— Sem categoria —</option>
                            {categoryList.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => { setCreatingRow(i); setNewCatName(""); }} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/15" title="Nova categoria"><Plus size={14} /></button>
                        </div>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${r.type === "REFUND" ? "text-emerald-400" : "text-foreground"}`}>
                      {r.type === "REFUND" ? "-" : ""}{fmtBRL(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleConfirm} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? "Importando..." : `Confirmar importação (${rows.filter((r) => r.include).length})`}
            </button>
            <button onClick={() => { setRows(null); setMessage(null); }} disabled={loading} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-all">
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
