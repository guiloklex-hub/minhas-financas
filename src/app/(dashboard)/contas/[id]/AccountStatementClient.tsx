"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface StatementRow {
  id: string;
  title: string;
  type: string;
  amount: number;
  date: Date | string;
  categoryName: string | null;
  categoryColor: string | null;
  balanceAfter: number;
}

interface Props {
  accountName: string;
  accountType: string;
  currency: string;
  initialBalance: number;
  currentBalance: number;
  rows: StatementRow[];
}

const TYPE_LABELS: Record<string, string> = {
  CASH: "Carteira",
  CHECKING: "Conta Corrente",
  CREDIT: "Cartão de Crédito",
};

export default function AccountStatementClient({
  accountName,
  accountType,
  currency,
  initialBalance,
  currentBalance,
  rows,
}: Props) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return new Intl.DateTimeFormat("pt-BR").format(localDate);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/contas"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para contas
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{accountName}</h2>
            <span className="text-xs font-medium px-2 py-1 bg-white/5 text-white/70 rounded-full">
              {TYPE_LABELS[accountType] ?? accountType}
            </span>
          </div>
          <p className="text-xs text-white/40 mt-1">
            Saldo inicial: {formatCurrency(initialBalance)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs text-white/40">Saldo atual</p>
          <p
            className={`text-2xl font-bold ${
              currentBalance >= 0 ? "" : "text-rose-500"
            }`}
          >
            {formatCurrency(currentBalance)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-[var(--color-border)] uppercase text-white/60">
              <tr>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium text-right">Valor</th>
                <th className="px-6 py-4 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-white/50"
                  >
                    Nenhuma transação nesta conta.
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-white/80">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-6 py-4 font-medium">{t.title}</td>
                    <td className="px-6 py-4 text-white/80">
                      <span
                        className="px-2 py-1 rounded-md text-xs font-medium bg-white/10"
                        style={{ color: t.categoryColor || "#fff" }}
                      >
                        {t.categoryName || "Sem categoria"}
                      </span>
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${
                        t.type === "INCOME"
                          ? "text-[var(--color-income)]"
                          : "text-[var(--color-expense)]"
                      }`}
                    >
                      {t.type === "INCOME" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${
                        t.balanceAfter >= 0 ? "text-white/80" : "text-rose-500"
                      }`}
                    >
                      {formatCurrency(t.balanceAfter)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
