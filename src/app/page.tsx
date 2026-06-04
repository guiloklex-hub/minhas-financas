import { prisma } from "@/lib/prisma"

export default async function Dashboard() {
  const transactions = await prisma.transaction.findMany();
  const accounts = await prisma.account.findMany({
    include: { transactions: true }
  });

  const income = transactions
    .filter(t => t.type === "INCOME")
    .reduce((acc, t) => acc + t.amount, 0);

  const expense = transactions
    .filter(t => t.type === "EXPENSE")
    .reduce((acc, t) => acc + t.amount, 0);

  const totalInitialBalance = accounts.reduce((acc, account) => acc + account.initialBalance, 0);
  const balance = totalInitialBalance + income - expense;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-6">Resumo Financeiro</h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {/* Balance Card */}
          <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm flex flex-col justify-between">
            <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">Saldo Global</h3>
            <p className="text-4xl font-semibold">{formatCurrency(balance)}</p>
          </div>

          {/* Income Card */}
          <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm flex flex-col justify-between">
            <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">Receitas</h3>
            <p className="text-4xl font-semibold text-[var(--color-income)]">{formatCurrency(income)}</p>
          </div>

          {/* Expense Card */}
          <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm flex flex-col justify-between">
            <h3 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">Despesas</h3>
            <p className="text-4xl font-semibold text-[var(--color-expense)]">{formatCurrency(expense)}</p>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-xl font-bold tracking-tight mb-4">Minhas Contas</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map(acc => {
            const accIncome = acc.transactions.filter(t => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
            const accExpense = acc.transactions.filter(t => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);
            const accBalance = acc.initialBalance + accIncome - accExpense;
            
            return (
              <div key={acc.id} className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-lg">{acc.name}</h4>
                    <span className="text-xs text-white/50 uppercase tracking-wider">{acc.type}</span>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${accBalance >= 0 ? '' : 'text-[var(--color-expense)]'}`}>
                  {formatCurrency(accBalance)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
