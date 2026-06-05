"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Receipt,
  Upload,
  Check,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { askFinancialQuestion } from "@/actions/ai-chat";
import {
  suggestBudgets,
  applySuggestedBudgets,
  type BudgetSuggestion,
} from "@/actions/ai-budget-suggest";
import { parseReceiptImage, type ReceiptData } from "@/actions/ai-receipt";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Renderiza markdown leve (negrito **...**, quebras de linha e itens "- ").
 * Não usa dangerouslySetInnerHTML: tudo passa pelo JSX do React, que já escapa
 * o conteúdo, prevenindo XSS de qualquer texto vindo da IA.
 */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isBullet = /^[-*]\s+/.test(trimmed);
        const content = isBullet ? trimmed.replace(/^[-*]\s+/, "") : line;
        const rendered = renderInline(content);
        if (trimmed.length === 0) return <div key={i} className="h-2" />;
        if (isBullet) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-emerald-400 shrink-0">•</span>
              <span>{rendered}</span>
            </div>
          );
        }
        return <p key={i}>{rendered}</p>;
      })}
    </div>
  );
}

/** Converte trechos **negrito** em <strong>, mantendo o resto como texto. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const match = /^\*\*([^*]+)\*\*$/.exec(part);
    if (match) {
      return (
        <strong key={i} className="font-semibold text-white">
          {match[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function AssistantClient({ month, year }: { month: number; year: number }) {
  return (
    <div className="space-y-6">
      <ChatPanel />
      <BudgetSuggestPanel month={month} year={year} />
      <ReceiptPanel />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || isPending) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");

    startTransition(async () => {
      const res = await askFinancialQuestion(q);
      if (res.success) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
      } else {
        setError(res.error || "Não foi possível obter uma resposta.");
      }
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bot className="text-emerald-400" size={22} />
        <h3 className="text-xl font-bold text-white">Pergunte sobre suas finanças</h3>
      </div>

      <div className="space-y-3 mb-4 max-h-[420px] overflow-y-auto">
        {messages.length === 0 && !isPending && (
          <p className="text-sm text-zinc-500">
            Ex.: &quot;Quanto gastei este mês?&quot;, &quot;Qual minha maior despesa?&quot; ou &quot;Como está meu saldo?&quot;.
            As respostas usam apenas os números reais das suas contas.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "bg-emerald-600/20 border border-emerald-500/30 text-emerald-50"
                  : "bg-zinc-800/70 border border-zinc-700/50 text-zinc-200"
              }`}
            >
              {m.role === "assistant" ? <SimpleMarkdown text={m.content} /> : m.content}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-800/70 border border-zinc-700/50 px-4 py-3 text-sm text-zinc-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="animate-pulse">Analisando seus dados...</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Digite sua pergunta..."
          disabled={isPending}
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sugestão de orçamentos                                                      */
/* -------------------------------------------------------------------------- */

function BudgetSuggestPanel({ month, year }: { month: number; year: number }) {
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[] | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [isLoading, startLoad] = useTransition();
  const [isApplying, startApply] = useTransition();

  const handleSuggest = () => {
    setFeedback(null);
    setSuggestions(null);
    startLoad(async () => {
      const res = await suggestBudgets(month, year);
      if (res.success) {
        setSuggestions(res.data);
        if (res.data.length === 0) {
          setFeedback({ type: "error", text: "Nenhuma sugestão disponível." });
        }
      } else {
        setFeedback({ type: "error", text: res.error });
      }
    });
  };

  const handleApply = () => {
    if (!suggestions || suggestions.length === 0) return;
    setFeedback(null);
    startApply(async () => {
      const res = await applySuggestedBudgets(
        suggestions.map((s) => ({ categoryId: s.categoryId, suggestedLimit: s.suggestedLimit })),
        month,
        year
      );
      if (res.success) {
        setFeedback({
          type: "success",
          text: `${res.count} orçamento(s) aplicado(s) para ${String(month).padStart(2, "0")}/${year}.`,
        });
      } else {
        setFeedback({ type: "error", text: res.error || "Falha ao aplicar." });
      }
    });
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="text-purple-400" size={22} />
          <h3 className="text-xl font-bold text-white">Sugerir orçamentos</h3>
        </div>
        <span className="text-xs text-zinc-500">
          Base: média dos últimos 3 meses ({String(month).padStart(2, "0")}/{year})
        </span>
      </div>

      <p className="text-sm text-zinc-400 mb-4">
        Calcula limites por categoria a partir da sua média de gastos. Revise e aplique de uma vez.
      </p>

      {feedback && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            feedback.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {!suggestions && (
        <button
          onClick={handleSuggest}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {isLoading ? "Calculando..." : "Gerar sugestões"}
        </button>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.categoryId}
                className="flex flex-col gap-1 rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{s.name}</p>
                  <p className="text-xs text-zinc-400">{s.rationale}</p>
                </div>
                <span className="shrink-0 rounded-lg bg-purple-500/15 px-3 py-1 text-sm font-bold text-purple-300">
                  {formatBrl(s.suggestedLimit)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {isApplying ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
              {isApplying ? "Aplicando..." : "Aplicar todos"}
            </button>
            <button
              onClick={handleSuggest}
              disabled={isLoading}
              className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              Recalcular
            </button>
            <Link
              href="/orcamentos"
              className="flex items-center gap-1 self-center text-sm text-zinc-400 transition-colors hover:text-white"
            >
              Ver orçamentos <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Leitor de comprovante                                                       */
/* -------------------------------------------------------------------------- */

function ReceiptPanel() {
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResult(null);
    setError(null);
    if (!file) {
      setFileName(null);
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setFileName(null);
      setError("Imagem muito grande. O limite é de 5MB.");
      e.target.value = "";
      return;
    }
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await parseReceiptImage(formData);
      if (res.success) {
        setResult(res.data);
      } else {
        setError(res.error);
      }
    });
    // Permite reenviar o mesmo arquivo depois.
    e.target.value = "";
  };

  // Monta um link para a tela de transações já com os dados extraídos.
  const buildTxLink = (data: ReceiptData): string => {
    const params = new URLSearchParams();
    if (data.title) params.set("title", data.title);
    if (data.amount !== null) params.set("amount", String(data.amount));
    if (data.date) params.set("date", data.date);
    params.set("type", "EXPENSE");
    return `/transacoes?${params.toString()}`;
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="text-blue-400" size={22} />
        <h3 className="text-xl font-bold text-white">Ler comprovante</h3>
      </div>

      <p className="text-sm text-zinc-400 mb-4">
        Envie a foto de uma nota ou recibo (JPEG, PNG ou WEBP, até 5MB). A IA extrai valor, data e
        descrição para você <strong className="text-zinc-200">confirmar</strong> — nada é lançado
        automaticamente.
      </p>

      <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 p-4 text-sm text-zinc-300 transition-colors hover:border-blue-500/50 hover:bg-blue-500/5">
        {isPending ? (
          <Loader2 className="animate-spin text-blue-400" size={20} />
        ) : (
          <Upload className="text-blue-400" size={20} />
        )}
        <span className="truncate">
          {isPending
            ? "Lendo comprovante..."
            : fileName
              ? fileName
              : "Clique para selecionar uma imagem"}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleChange}
          disabled={isPending}
        />
      </label>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-4">
          <p className="mb-3 text-sm font-semibold text-white">Dados extraídos (confira antes de salvar)</p>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Descrição</dt>
              <dd className="text-zinc-200">{result.title ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Valor</dt>
              <dd className="font-semibold text-rose-400">
                {result.amount !== null ? formatBrl(result.amount) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Data</dt>
              <dd className="text-zinc-200">{result.date ?? "—"}</dd>
            </div>
          </dl>

          <Link
            href={buildTxLink(result)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Wallet size={18} />
            Criar transação com esses dados
          </Link>
        </div>
      )}
    </section>
  );
}
