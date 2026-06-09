import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import PrintButton from "./PrintButton";
import { formatCivilDate } from "@/lib/format-date";

type SearchParams = {
  month?: string;
  year?: string;
};

/** Garante uma string a partir de um valor de searchParams (string | string[] | undefined). */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Formata um número como valor monetário pt-BR (R$). */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Formata Date para "DD/MM/AAAA" no mesmo critério visual da listagem. */
function formatDate(date: Date): string {
  return formatCivilDate(date);
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default async function RelatorioImprimirPage({
  searchParams,
}: {
  // Next 16: searchParams é uma Promise.
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const now = new Date();

  const monthRaw = parseInt(firstValue(sp.month), 10);
  const yearRaw = parseInt(firstValue(sp.year), 10);

  const month =
    Number.isFinite(monthRaw) && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;
  const year =
    Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();

  // Intervalo do mês selecionado (local).
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const where: Prisma.TransactionWhereInput = {
    date: { gte: start, lte: end },
  };

  // Para os TOTAIS, transferências não contam como receita/despesa.
  const totalsWhere: Prisma.TransactionWhereInput = { ...where, isTransfer: false };

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true },
    orderBy: { date: "desc" },
  });

  const totalsTransactions = await prisma.transaction.findMany({
    where: totalsWhere,
    include: { category: true },
    orderBy: { date: "desc" },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const expenseByCategory = new Map<string, { name: string; color: string; amount: number }>();

  for (const t of totalsTransactions) {
    if (t.type === "INCOME") {
      totalIncome += t.amount;
    } else if (t.type === "EXPENSE") {
      totalExpense += t.amount;

      const key = t.categoryId ?? "sem-categoria";
      const existing = expenseByCategory.get(key);
      if (existing) {
        existing.amount += t.amount;
      } else {
        expenseByCategory.set(key, {
          name: t.category?.name ?? "Sem categoria",
          color: t.category?.color ?? "#71717a",
          amount: t.amount,
        });
      }
    }
  }

  const balance = totalIncome - totalExpense;
  const expensesRanking = Array.from(expenseByCategory.values()).sort((a, b) => b.amount - a.amount);

  const periodLabel = `${MONTH_NAMES[month - 1]} de ${year}`;
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(now);

  return (
    <div className="space-y-6 print:space-y-4 print:text-black">
      {/* Cabeçalho da tela (com botão de impressão) */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Relatório Mensal</h2>
          <p className="text-muted mt-2">Período: {periodLabel}</p>
        </div>
        <PrintButton />
      </div>

      {/* Documento imprimível */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none">
        {/* Título do relatório */}
        <div className="mb-6 border-b border-[var(--color-border)] pb-4 print:border-zinc-300">
          <h1 className="text-2xl font-bold text-foreground print:text-black">Relatório Financeiro</h1>
          <p className="text-muted mt-1 print:text-zinc-700">{periodLabel}</p>
          <p className="text-xs text-muted mt-1 print:text-muted">
            Gerado em {generatedAt}
          </p>
        </div>

        {/* Resumo */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3 print:text-black">Resumo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3">
            <div className="rounded-lg border border-[var(--color-border)] p-4 print:border-zinc-300">
              <p className="text-xs uppercase text-muted print:text-muted">Receitas</p>
              <p className="text-xl font-bold text-[var(--color-income)] mt-1 print:text-emerald-700">
                {formatCurrency(totalIncome)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-4 print:border-zinc-300">
              <p className="text-xs uppercase text-muted print:text-muted">Despesas</p>
              <p className="text-xl font-bold text-[var(--color-expense)] mt-1 print:text-rose-700">
                {formatCurrency(totalExpense)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-4 print:border-zinc-300">
              <p className="text-xs uppercase text-muted print:text-muted">Saldo</p>
              <p
                className={`text-xl font-bold mt-1 ${
                  balance >= 0
                    ? "text-[var(--color-income)] print:text-emerald-700"
                    : "text-[var(--color-expense)] print:text-rose-700"
                }`}
              >
                {formatCurrency(balance)}
              </p>
            </div>
          </div>
        </section>

        {/* Despesas por categoria */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-3 print:text-black">
            Despesas por Categoria
          </h2>
          {expensesRanking.length === 0 ? (
            <p className="text-muted text-sm print:text-muted">
              Nenhuma despesa registrada neste período.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-muted uppercase print:border-zinc-300 print:text-zinc-700">
                <tr>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                  <th className="py-2 font-medium text-right">% do total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] print:divide-zinc-200">
                {expensesRanking.map((cat) => (
                  <tr key={cat.name} className="text-foreground print:text-black">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </span>
                    </td>
                    <td className="py-2 text-right font-medium">{formatCurrency(cat.amount)}</td>
                    <td className="py-2 text-right text-muted print:text-zinc-700">
                      {totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Tabela de transações */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3 print:text-black">
            Transações ({transactions.length})
          </h2>
          {transactions.length === 0 ? (
            <p className="text-muted text-sm print:text-muted">
              Nenhuma transação registrada neste período.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] text-muted uppercase print:border-zinc-300 print:text-zinc-700">
                <tr>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Título</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 font-medium">Conta</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] print:divide-zinc-200">
                {transactions.map((t) => (
                  <tr key={t.id} className="text-foreground print:text-black">
                    <td className="py-2 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="py-2">{t.title}</td>
                    <td className="py-2 text-foreground/80 print:text-zinc-700">
                      {t.category?.name ?? "Sem categoria"}
                    </td>
                    <td className="py-2 text-foreground/80 print:text-zinc-700">
                      {t.account?.name ?? "Sem conta"}
                    </td>
                    <td
                      className={`py-2 text-right font-semibold whitespace-nowrap ${
                        t.type === "INCOME"
                          ? "text-[var(--color-income)] print:text-emerald-700"
                          : "text-[var(--color-expense)] print:text-rose-700"
                      }`}
                    >
                      {t.type === "INCOME" ? "+" : "-"}
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
