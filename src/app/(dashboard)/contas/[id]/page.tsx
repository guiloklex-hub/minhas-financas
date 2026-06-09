import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { computeAccountBalance } from "@/lib/account-balance"
import { roundMoney } from "@/lib/money"
import AccountStatementClient from "./AccountStatementClient"

export const metadata = {
  title: "Extrato da Conta | Gerenciador de Finanças",
}

export default async function AccountStatementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      transactions: {
        include: { category: true },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!account) {
    return (
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <Link
          href="/contas"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para contas
        </Link>
        <div className="py-12 text-center text-muted border border-dashed border-[var(--color-border)] rounded-xl">
          Conta não encontrada.
        </div>
      </div>
    );
  }

  // Saldo evolutivo: saldo inicial + acumulado por transação (em ordem
  // cronológica). Receitas somam, despesas subtraem. Usa reduce para evitar
  // reatribuição de variável externa dentro do map.
  const { rows } = account.transactions.reduce(
    (acc, t) => {
      const balanceAfter =
        t.type === "INCOME"
          ? roundMoney(acc.running + t.amount)
          : roundMoney(acc.running - t.amount);

      acc.rows.push({
        id: t.id,
        title: t.title,
        type: t.type,
        amount: t.amount,
        date: t.date,
        categoryName: t.category?.name ?? null,
        categoryColor: t.category?.color ?? null,
        balanceAfter,
      });

      return { running: balanceAfter, rows: acc.rows };
    },
    {
      running: roundMoney(account.initialBalance),
      rows: [] as {
        id: string;
        title: string;
        type: string;
        amount: number;
        date: Date;
        categoryName: string | null;
        categoryColor: string | null;
        balanceAfter: number;
      }[],
    }
  );

  // Saldo atual consolidado da conta (consistente com /contas).
  const currentBalance = computeAccountBalance(
    account.initialBalance,
    account.transactions.map((t) => ({ type: t.type, amount: t.amount }))
  );

  return (
    <div className="max-w-5xl mx-auto py-6">
      <AccountStatementClient
        accountName={account.name}
        accountType={account.type}
        currency={account.currency}
        initialBalance={account.initialBalance}
        currentBalance={currentBalance}
        rows={rows}
      />
    </div>
  );
}
