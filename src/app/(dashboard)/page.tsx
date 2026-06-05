import { prisma } from "@/lib/prisma"
import { roundMoney } from "@/lib/money"
import { computeAccountBalance } from "@/lib/account-balance"
import { IncomeExpenseBarChart } from "@/components/charts/IncomeExpenseBarChart";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";

export default async function Dashboard() {
  const accounts = await prisma.account.findMany({
    include: { transactions: true }
  });

  // Calculate current month boundaries
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Fetch transactions for the current month to power the charts.
  // Transferências (isTransfer) são movimentações entre contas próprias e NÃO
  // contam como receita/despesa — por isso são excluídas das KPIs e dos gráficos.
  const currentMonthTransactions = await prisma.transaction.findMany({
    where: {
      isTransfer: false,
      date: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      }
    },
    include: { category: true }
  });

  const income = currentMonthTransactions
    .filter(t => t.type === "INCOME")
    .reduce((acc, t) => acc + t.amount, 0);

  const expense = currentMonthTransactions
    .filter(t => t.type === "EXPENSE")
    .reduce((acc, t) => acc + t.amount, 0);

  const totalInitialBalance = accounts.reduce((acc, account) => acc + account.initialBalance, 0);

  // Para o saldo total precisamos de TODAS as transações (não só do mês atual).
  // Aqui mantemos as transferências: como cada transferência tem uma perna de
  // saída (EXPENSE) e uma de entrada (INCOME), elas se anulam no saldo global.
  const allTransactions = await prisma.transaction.findMany();
  const totalIncome = allTransactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = allTransactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
  const balance = roundMoney(totalInitialBalance + totalIncome - totalExpense);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Prepare data for Bar Chart (Current Month)
  const barChartData = [
    {
      name: 'Mês Atual',
      receitas: income,
      despesas: expense,
    }
  ];

  // Prepare data for Pie Chart (Current Month Expenses by Category)
  const expensesByCategory = currentMonthTransactions
    .filter(t => t.type === "EXPENSE")
    .reduce((acc, t) => {
      const catName = t.category?.name || "Sem Categoria";
      if (!acc[catName]) {
        acc[catName] = { name: catName, value: 0, color: t.category?.color || "#52525b" };
      }
      acc[catName].value += t.amount;
      return acc;
    }, {} as Record<string, { name: string, value: number, color: string }>);

  const pieChartData = Object.values(expensesByCategory);

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-6 text-white">Resumo Financeiro</h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {/* Balance Card */}
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm flex flex-col justify-between hover:border-zinc-700 transition-all duration-200">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-2">Saldo Global</h3>
            <p className="text-4xl font-semibold text-white">{formatCurrency(balance)}</p>
          </div>

          {/* Income Card */}
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm flex flex-col justify-between hover:border-emerald-900/30 transition-all duration-200">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-2">Receitas (Mês Atual)</h3>
            <p className="text-4xl font-semibold text-emerald-500">{formatCurrency(income)}</p>
          </div>

          {/* Expense Card */}
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm flex flex-col justify-between hover:border-rose-900/30 transition-all duration-200">
            <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-2">Despesas (Mês Atual)</h3>
            <p className="text-4xl font-semibold text-rose-500">{formatCurrency(expense)}</p>
          </div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm">
          <h3 className="text-lg font-bold tracking-tight mb-2 text-white">Receitas vs Despesas</h3>
          <p className="text-sm text-zinc-400 mb-4">Comparativo do mês atual</p>
          <IncomeExpenseBarChart data={barChartData} />
        </div>
        
        <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm">
          <h3 className="text-lg font-bold tracking-tight mb-2 text-white">Despesas por Categoria</h3>
          <p className="text-sm text-zinc-400 mb-4">Distribuição do mês atual</p>
          <CategoryPieChart data={pieChartData} />
        </div>
      </div>
      
      <div>
        <h3 className="text-xl font-bold tracking-tight mb-4 text-white">Minhas Contas</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map(acc => {
            // Saldo por conta inclui transferências: cada perna afeta a conta de origem/destino.
            const accBalance = computeAccountBalance(acc.initialBalance, acc.transactions);

            return (
              <div key={acc.id} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm hover:border-zinc-700 transition-all duration-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-lg text-white">{acc.name}</h4>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">{acc.type}</span>
                  </div>
                </div>
                <p className={`text-2xl font-bold ${accBalance >= 0 ? 'text-white' : 'text-rose-500'}`}>
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
