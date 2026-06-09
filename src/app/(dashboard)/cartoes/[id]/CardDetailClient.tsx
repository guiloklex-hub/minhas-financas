"use client"

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeft, Plus, Trash2, CreditCard as CreditCardIcon, Gift, CalendarCheck, Sparkles, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { formatCivilDate } from "@/lib/format-date";
import { computeBestPurchaseDay, getInvoiceCompetence } from "@/lib/credit-card";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { FutureInvoicesBar } from "@/components/charts/FutureInvoicesBar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Repeat } from "lucide-react";
import { deleteCardPurchase } from "@/actions/credit-card-transactions";
import { analyzeInvoice } from "@/actions/ai-card-coach";
import { reconcileInvoiceImage } from "@/actions/ai-invoice-ocr";
import { ScanLine } from "lucide-react";
import CardPurchaseForm from "./CardPurchaseForm";
import PayInvoiceForm from "./PayInvoiceForm";
import RewardRedeemForm from "./RewardRedeemForm";
import VirtualCardForm from "./VirtualCardForm";
import InvoiceImport from "./InvoiceImport";
import CardCsvImport from "./CardCsvImport";
import { Layers, Pencil, FileText, Upload } from "lucide-react";

type InvoiceItem = {
  id: string;
  title: string;
  amount: number;
  date: string;
  type: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  virtualCardId: string | null;
  virtualCardName: string | null;
  virtualCardColor: string | null;
};

type VirtualCardView = {
  id: string;
  name: string;
  lastFour: string | null;
  color: string | null;
  spendingLimit: number | null;
  used: number;
};

type InvoiceView = {
  id: string;
  referenceMonth: number;
  referenceYear: number;
  status: string;
  total: number;
  paidAmount: number;
  outstanding: number;
  closingDate: string;
  dueDate: string;
  items: InvoiceItem[];
};

type CardView = {
  id: string;
  name: string;
  brand: string | null;
  lastFour: string | null;
  color: string | null;
  currency: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string | null;
  rewardType: string;
  rewardBalance: number;
};

type Summary = {
  totalOwed: number;
  currentInvoiceTotal: number;
  committedFuture: number;
  availableLimit: number;
  usagePercent: number;
  nextClosingDate: string;
  nextDueDate: string;
};

type Option = { id: string; name: string };

type SubscriptionView = {
  title: string;
  averageAmount: number;
  months: number;
  lastDate: string;
};

type ForecastPoint = {
  month: number;
  year: number;
  committed: number;
  projected: number;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  OPEN: { label: "Aberta", className: "bg-sky-500/15 text-sky-400" },
  CLOSED: { label: "Fechada", className: "bg-amber-500/15 text-amber-400" },
  PARTIAL: { label: "Parcial", className: "bg-amber-500/15 text-amber-400" },
  PAID: { label: "Paga", className: "bg-emerald-500/15 text-emerald-400" },
  OVERDUE: { label: "Vencida", className: "bg-rose-500/15 text-rose-400" },
};

function usageColor(pct: number): string {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function CardDetailClient({
  card,
  summary,
  invoices,
  accounts,
  categories,
  subscriptions,
  forecast,
  virtualCards,
}: {
  card: CardView;
  summary: Summary;
  invoices: InvoiceView[];
  accounts: Option[];
  categories: Option[];
  subscriptions: SubscriptionView[];
  forecast: ForecastPoint[];
  virtualCards: VirtualCardView[];
}) {
  const router = useRouter();
  // Abre na fatura da competência atual (não na mais futura). As faturas vêm em
  // ordem desc (mais recente primeiro); se a do mês corrente não existir, cai na
  // fatura passada mais recente.
  const [index, setIndex] = useState(() => {
    if (invoices.length === 0) return 0;
    const comp = getInvoiceCompetence(new Date(), card.closingDay);
    const exact = invoices.findIndex((i) => i.referenceYear === comp.year && i.referenceMonth === comp.month);
    if (exact >= 0) return exact;
    const target = comp.year * 12 + (comp.month - 1);
    const notFuture = invoices.findIndex((i) => i.referenceYear * 12 + (i.referenceMonth - 1) <= target);
    return notFuture >= 0 ? notFuture : invoices.length - 1;
  });
  const [showPurchase, setShowPurchase] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [showVcForm, setShowVcForm] = useState(false);
  const [editingVc, setEditingVc] = useState<VirtualCardView | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  // Filtro da fatura por cartão: "ALL" | "PHYSICAL" | <virtualCardId>
  const [cardFilter, setCardFilter] = useState<string>("ALL");
  const [insights, setInsights] = useState<string[] | null>(null);
  const [coachPending, startCoach] = useTransition();
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{
    matched: { description: string; amount: number }[];
    missingInApp: { description: string; amount: number }[];
    extraInApp: { id: string; title: string; amount: number }[];
  } | null>(null);

  const bestDay = computeBestPurchaseDay(card.closingDay);
  const rewardLabel =
    card.rewardType === "CASHBACK" ? "Cashback" :
    card.rewardType === "MILES" ? "Milhas" :
    card.rewardType === "POINTS" ? "Pontos" : null;

  const fmt = (v: number) => formatMoney(v, card.currency);
  const fmtDate = (iso: string) => formatCivilDate(iso);

  const invoice = invoices[index];

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Excluir este lançamento? Se for parcelado, todas as parcelas serão removidas.")) return;
    const result = await deleteCardPurchase(itemId);
    if (result.success) router.refresh();
    else alert(result.error || "Erro ao excluir.");
  };

  const runCoach = (invoiceId: string) => {
    startCoach(async () => {
      const result = await analyzeInvoice(invoiceId);
      setInsights(result.success && "insights" in result ? result.insights ?? null : null);
    });
  };

  const handleOcr = async (invoiceId: string, file: File) => {
    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    fd.set("file", file);
    const result = await reconcileInvoiceImage(fd);
    setOcrLoading(false);
    if (result.success) setOcrResult(result.result);
    else setOcrError(result.error || "Erro ao ler a fatura.");
  };

  // Itens da fatura filtrados pelo cartão selecionado (físico/virtual).
  const visibleItems = invoice
    ? invoice.items.filter((it) => {
        if (cardFilter === "ALL") return true;
        if (cardFilter === "PHYSICAL") return !it.virtualCardId;
        return it.virtualCardId === cardFilter;
      })
    : [];

  const pieData = Object.values(
    visibleItems
      .filter((it) => it.type !== "REFUND")
      .reduce((acc, it) => {
        const name = it.categoryName || "Sem categoria";
        if (!acc[name]) acc[name] = { name, value: 0, color: it.categoryColor || "#52525b" };
        acc[name].value += it.amount;
        return acc;
      }, {} as Record<string, { name: string; value: number; color: string }>)
  );

  // Total por cartão (físico + cada virtual) na fatura selecionada.
  const sign = (t: string) => (t === "REFUND" ? -1 : 1);
  const physicalTotal = invoice
    ? invoice.items.filter((it) => !it.virtualCardId).reduce((a, it) => a + sign(it.type) * it.amount, 0)
    : 0;
  const totalsByVirtual = new Map<string, number>();
  if (invoice) {
    for (const it of invoice.items) {
      if (!it.virtualCardId) continue;
      totalsByVirtual.set(it.virtualCardId, (totalsByVirtual.get(it.virtualCardId) ?? 0) + sign(it.type) * it.amount);
    }
  }

  return (
    <div className="space-y-8">
      <Link href="/cartoes" className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
        <ArrowLeft size={16} /> Voltar para cartões
      </Link>

      {/* Cabeçalho: visual do cartão + limite */}
      <div
        className="rounded-2xl p-6 text-foreground shadow-lg border border-white/10"
        style={{ background: `linear-gradient(135deg, ${card.color || "#7c3aed"} 0%, rgba(0,0,0,0.65) 130%)` }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{card.name}</h2>
            <p className="text-xs uppercase tracking-widest opacity-80">
              {card.brand || "CARD"} {card.lastFour ? `•••• ${card.lastFour}` : ""}
            </p>
          </div>
          <CreditCardIcon size={26} className="opacity-80" />
        </div>
        <div className="mt-6">
          <div className="flex justify-between text-sm opacity-90 mb-1">
            <span>Utilizado {fmt(summary.totalOwed)}</span>
            <span>Limite {fmt(card.creditLimit)}</span>
          </div>
          <div className="w-full bg-background rounded-full h-2.5 overflow-hidden">
            <div className={`h-2.5 rounded-full ${usageColor(summary.usagePercent)}`} style={{ width: `${Math.min(100, Math.max(0, summary.usagePercent))}%` }} />
          </div>
          <p className="text-xs opacity-90 mt-1">Disponível: {fmt(summary.availableLimit)} ({summary.usagePercent.toFixed(0)}% usado)</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-5 rounded-xl border border-border bg-card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Fatura atual</h3>
          <p className="text-2xl font-semibold text-rose-500">{fmt(summary.currentInvoiceTotal)}</p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Parcelas futuras</h3>
          <p className="text-2xl font-semibold text-foreground">{fmt(summary.committedFuture)}</p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card">
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider mb-1">Próximo vencimento</h3>
          <p className="text-2xl font-semibold text-foreground">{fmtDate(summary.nextDueDate)}</p>
        </div>
      </div>

      {/* Melhor dia de compra + recompensas */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-5 rounded-xl border border-border bg-card flex items-center gap-3">
          <CalendarCheck size={22} className="text-emerald-400 shrink-0" />
          <div>
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Melhor dia de compra</h3>
            <p className="text-lg font-semibold text-foreground">Dia {bestDay}</p>
            <p className="text-xs text-muted">Logo após o fechamento (dia {card.closingDay}) — maior prazo até o vencimento.</p>
          </div>
        </div>
        {rewardLabel && (
          <div className="p-5 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Gift size={22} className="text-purple-400 shrink-0" />
              <div>
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider">{rewardLabel}</h3>
                <p className="text-lg font-semibold text-foreground">{card.rewardBalance.toLocaleString("pt-BR")}</p>
              </div>
            </div>
            {card.rewardBalance > 0 && (
              <button onClick={() => setShowRedeem((s) => !s)} className="px-3 py-1.5 text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md transition-all">
                Resgatar
              </button>
            )}
          </div>
        )}
      </div>

      {showRedeem && (
        <RewardRedeemForm
          cardId={card.id}
          balance={card.rewardBalance}
          onSuccess={() => { setShowRedeem(false); router.refresh(); }}
          onCancel={() => setShowRedeem(false)}
        />
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => { setShowPurchase((s) => !s); setShowPay(false); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all">
          <Plus size={16} /> Nova compra
        </button>
        {invoice && invoice.outstanding > 0 && (
          <button onClick={() => { setShowPay((s) => !s); setShowPurchase(false); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-all">
            Pagar fatura
          </button>
        )}
        <button onClick={() => { setShowImport((s) => !s); setShowCsvImport(false); setShowPurchase(false); setShowPay(false); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded-md transition-all">
          <FileText size={16} /> Importar fatura
        </button>
        <button onClick={() => { setShowCsvImport((s) => !s); setShowImport(false); setShowPurchase(false); setShowPay(false); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded-md transition-all">
          <Upload size={16} /> Importar CSV
        </button>
      </div>

      {showImport && (
        <InvoiceImport
          cardId={card.id}
          categories={categories}
          virtualCards={virtualCards.map((v) => ({ id: v.id, name: v.name }))}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); router.refresh(); }}
        />
      )}

      {showCsvImport && (
        <CardCsvImport
          cardId={card.id}
          categories={categories}
          virtualCards={virtualCards.map((v) => ({ id: v.id, name: v.name }))}
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); router.refresh(); }}
        />
      )}

      {showPurchase && (
        <CardPurchaseForm
          cardId={card.id}
          categories={categories}
          virtualCards={virtualCards.map((v) => ({ id: v.id, name: v.name }))}
          onSuccess={() => { setShowPurchase(false); router.refresh(); }}
          onCancel={() => setShowPurchase(false)}
        />
      )}

      {/* Cartões virtuais */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-sky-400" />
            <h3 className="text-lg font-semibold text-foreground">Cartões virtuais</h3>
          </div>
          <button
            onClick={() => { setEditingVc(null); setShowVcForm((s) => !s); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded-md transition-all"
          >
            <Plus size={15} /> Novo cartão virtual
          </button>
        </div>

        {showVcForm && (
          <div className="mb-4">
            <VirtualCardForm
              cardId={card.id}
              virtualCard={editingVc}
              onSuccess={() => { setShowVcForm(false); setEditingVc(null); router.refresh(); }}
              onCancel={() => { setShowVcForm(false); setEditingVc(null); }}
            />
          </div>
        )}

        {virtualCards.length === 0 ? (
          <p className="text-sm text-muted">Nenhum cartão virtual. Crie um para separar gastos (ex.: assinaturas) na mesma fatura.</p>
        ) : (
          <ul className="space-y-3">
            {virtualCards.map((vc) => {
              const pct = vc.spendingLimit && vc.spendingLimit > 0 ? Math.min(100, (vc.used / vc.spendingLimit) * 100) : null;
              return (
                <li key={vc.id} className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: vc.color || "#38bdf8" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-foreground truncate">
                        {vc.name}
                        {vc.lastFour && <span className="text-muted"> •••• {vc.lastFour}</span>}
                      </p>
                      <span className="text-sm text-foreground/80 whitespace-nowrap">
                        {fmt(vc.used)}{vc.spendingLimit ? ` / ${fmt(vc.spendingLimit)}` : ""}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="w-full bg-accent rounded-full h-1.5 mt-1 overflow-hidden">
                        <div className={`h-1.5 rounded-full ${usageColor(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setEditingVc(vc); setShowVcForm(true); }}
                    className="p-1.5 rounded-md text-muted hover:bg-accent shrink-0"
                    title="Editar cartão virtual"
                  >
                    <Pencil size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showPay && invoice && (
        <PayInvoiceForm
          invoiceId={invoice.id}
          outstanding={invoice.outstanding}
          accounts={accounts}
          defaultAccountId={card.paymentAccountId}
          onSuccess={() => { setShowPay(false); router.refresh(); }}
          onCancel={() => setShowPay(false)}
        />
      )}

      {/* Navegador de faturas */}
      {invoices.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted">
          Nenhuma fatura ainda. Registre uma compra para começar.
        </div>
      ) : invoice ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <button
              disabled={index >= invoices.length - 1}
              onClick={() => { setIndex((i) => Math.min(invoices.length - 1, i + 1)); setInsights(null); setOcrResult(null); setOcrError(null); setCardFilter("ALL"); }}
              className="p-2 rounded-md hover:bg-accent disabled:opacity-30 transition-colors"
              aria-label="Fatura anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {String(invoice.referenceMonth).padStart(2, "0")}/{invoice.referenceYear}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${STATUS_LABELS[invoice.status]?.className || "bg-zinc-700 text-foreground/80"}`}>
                  {STATUS_LABELS[invoice.status]?.label || invoice.status}
                </span>
              </p>
              <p className="text-sm text-muted">
                Total {fmt(invoice.total)} · Vence {fmtDate(invoice.dueDate)}
                {invoice.paidAmount > 0 && ` · Pago ${fmt(invoice.paidAmount)}`}
              </p>
            </div>
            <button
              disabled={index <= 0}
              onClick={() => { setIndex((i) => Math.max(0, i - 1)); setInsights(null); setOcrResult(null); setOcrError(null); setCardFilter("ALL"); }}
              className="p-2 rounded-md hover:bg-accent disabled:opacity-30 transition-colors"
              aria-label="Próxima fatura"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Filtro + totais por cartão (quando há virtuais) */}
          {virtualCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setCardFilter("ALL")}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${cardFilter === "ALL" ? "bg-white text-black border-white" : "border-border text-foreground/80 hover:bg-accent"}`}
              >
                Todos
              </button>
              <button
                onClick={() => setCardFilter("PHYSICAL")}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${cardFilter === "PHYSICAL" ? "bg-white text-black border-white" : "border-border text-foreground/80 hover:bg-accent"}`}
              >
                Físico · {fmt(physicalTotal)}
              </button>
              {virtualCards.map((vc) => (
                <button
                  key={vc.id}
                  onClick={() => setCardFilter(vc.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${cardFilter === vc.id ? "bg-white text-black border-white" : "border-border text-foreground/80 hover:bg-accent"}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: vc.color || "#38bdf8" }} />
                  {vc.name} · {fmt(totalsByVirtual.get(vc.id) ?? 0)}
                </button>
              ))}
            </div>
          )}

          {/* Itens da fatura */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {visibleItems.length === 0 ? (
              <p className="p-6 text-center text-muted">Sem lançamentos nesta fatura.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-accent border-b border-border text-muted uppercase text-xs">
                  <tr>
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3">Cartão</th>
                    <th className="text-left px-4 py-3">Categoria</th>
                    <th className="text-right px-4 py-3">Valor</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {visibleItems.map((it) => (
                    <tr key={it.id} className="hover:bg-accent transition-colors">
                      <td className="px-4 py-3 text-muted">{fmtDate(it.date)}</td>
                      <td className="px-4 py-3 text-foreground">
                        {it.title}
                        {it.type === "REFUND" && <span className="ml-2 text-xs text-emerald-400">(estorno)</span>}
                        {it.type === "INTEREST" && <span className="ml-2 text-xs text-rose-400">(juros)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {it.virtualCardId ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: it.virtualCardColor || "#38bdf8" }} />
                            {it.virtualCardName || "Virtual"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Físico</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{it.categoryName || "—"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${it.type === "REFUND" ? "text-emerald-400" : "text-foreground"}`}>
                        {it.type === "REFUND" ? "-" : ""}{fmt(it.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDeleteItem(it.id)} className="text-muted hover:text-rose-400 transition-colors" aria-label="Excluir lançamento">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pieData.length > 0 && (
            <Card className="w-full min-w-0">
              <CardHeader>
                <CardTitle className="text-base">Despesas por categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryPieChart data={pieData} />
              </CardContent>
            </Card>
          )}

          {/* Coach de IA da fatura */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-400" />
                <h3 className="text-lg font-semibold text-foreground">Coach da fatura (IA)</h3>
              </div>
              <button
                onClick={() => runCoach(invoice.id)}
                disabled={coachPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 rounded-md transition-all disabled:opacity-50"
              >
                {coachPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {coachPending ? "Analisando..." : "Analisar fatura"}
              </button>
            </div>
            {insights ? (
              <ul className="space-y-2">
                {insights.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground/80">
                    <span className="text-purple-400">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Gere uma análise inteligente com riscos e oportunidades desta fatura.</p>
            )}
          </div>

          {/* Conciliação por foto da fatura (OCR + IA) */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ScanLine size={18} className="text-sky-400" />
                <h3 className="text-lg font-semibold text-foreground">Conferir fatura por foto (IA)</h3>
              </div>
              <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded-md transition-all cursor-pointer">
                {ocrLoading ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}
                {ocrLoading ? "Lendo..." : "Enviar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={ocrLoading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleOcr(invoice.id, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-sm text-muted mb-3">Envie a foto/print da fatura física: a IA extrai as linhas e apontamos divergências com o que está lançado aqui.</p>
            {ocrError && <p className="text-sm text-rose-400">{ocrError}</p>}
            {ocrResult && (
              <div className="space-y-3 text-sm">
                <p className="text-emerald-400">{ocrResult.matched.length} lançamento(s) conferem.</p>
                {ocrResult.missingInApp.length > 0 && (
                  <div>
                    <p className="text-amber-400 mb-1">Na fatura, mas não lançado aqui:</p>
                    <ul className="space-y-1">
                      {ocrResult.missingInApp.map((m, i) => (
                        <li key={i} className="flex justify-between text-foreground/80">
                          <span>{m.description}</span><span>{fmt(m.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ocrResult.extraInApp.length > 0 && (
                  <div>
                    <p className="text-rose-400 mb-1">Lançado aqui, mas ausente na foto:</p>
                    <ul className="space-y-1">
                      {ocrResult.extraInApp.map((m) => (
                        <li key={m.id} className="flex justify-between text-foreground/80">
                          <span>{m.title}</span><span>{fmt(m.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ocrResult.missingInApp.length === 0 && ocrResult.extraInApp.length === 0 && (
                  <p className="text-emerald-400">Tudo certo: nenhuma divergência encontrada.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Assinaturas detectadas */}
      {subscriptions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Repeat size={18} className="text-amber-400" />
            <h3 className="text-lg font-semibold text-foreground">Assinaturas detectadas</h3>
          </div>
          <p className="text-sm text-muted mb-4">
            Cobranças recorrentes identificadas no histórico (valor parecido, cadência mensal).
          </p>
          <ul className="divide-y divide-zinc-800">
            {subscriptions.map((s, i) => (
              <li key={`${s.title}-${i}`} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-foreground">{s.title}</p>
                  <p className="text-xs text-muted">{s.months} meses · último em {fmtDate(s.lastDate)}</p>
                </div>
                <span className="font-medium text-foreground">{fmt(s.averageAmount)}/mês</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Projeção de faturas futuras */}
      {forecast.length > 0 && (
        <Card className="w-full min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Projeção de faturas futuras</CardTitle>
          </CardHeader>
          <CardContent>
            <FutureInvoicesBar
              data={forecast.map((p) => ({
                name: `${String(p.month).padStart(2, "0")}/${p.year}`,
                comprometido: p.committed,
                projetado: p.projected,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
