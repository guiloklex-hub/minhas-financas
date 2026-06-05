import { prisma } from "@/lib/prisma"
import { computeAccountBalances } from "@/lib/account-balance"
import AccountsList from "./AccountsList"

export const metadata = {
  title: "Gestão de Contas | Gerenciador de Finanças",
}

export default async function ContasPage() {
  const accounts = await prisma.account.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      transactions: {
        select: { accountId: true, type: true, amount: true }
      }
    }
  });

  const withBalances = computeAccountBalances(
    accounts,
    accounts.flatMap(a => a.transactions)
  );

  // Não enviar o array pesado de transações ao client — apenas campos da conta + currentBalance.
  const accountsForClient = withBalances.map((acc) => {
    const { transactions: _transactions, ...account } = acc;
    void _transactions;
    return account;
  });

  return (
    <div className="max-w-5xl mx-auto py-6">
      <AccountsList initialAccounts={accountsForClient} />
    </div>
  );
}
