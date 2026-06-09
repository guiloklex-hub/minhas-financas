import { prisma } from "@/lib/prisma"
import { roundMoney } from "@/lib/money"
import { computeAccountBalance } from "@/lib/account-balance"
import { getCardSpendByCategory } from "@/lib/card-spend";
import { IncomeExpenseBarChart } from "@/components/charts/IncomeExpenseBarChart";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

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

  // Gasto do cartão do mês (compras vivem fora da tabela Transaction; o
  // pagamento da fatura é isTransfer e não conta aqui — sem dupla contagem).
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const cardSpendByCategory = await getCardSpendByCategory(firstDayOfMonth, nextMonthStart);
  const cardSpendTotal = Array.from(cardSpendByCategory.values()).reduce((a, b) => a + b, 0);
  const categoriesList = await prisma.category.findMany({ select: { id: true, name: true, color: true } });
  const categoryById = new Map(categoriesList.map((c) => [c.id, c]));

  const income = currentMonthTransactions
    .filter(t => t.type === "INCOME")
    .reduce((acc, t) => acc + t.amount, 0);

  const expense = roundMoney(
    currentMonthTransactions
      .filter(t => t.type === "EXPENSE")
      .reduce((acc, t) => acc + t.amount, 0) + cardSpendTotal
  );

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

  // Soma o gasto do cartão por categoria no gráfico de pizza.
  for (const [categoryId, amount] of cardSpendByCategory) {
    const cat = categoryId ? categoryById.get(categoryId) : undefined;
    const catName = cat?.name || "Sem Categoria";
    if (!expensesByCategory[catName]) {
      expensesByCategory[catName] = { name: catName, value: 0, color: cat?.color || "#52525b" };
    }
    expensesByCategory[catName].value += amount;
  }

  const pieChartData = Object.values(expensesByCategory).filter((c) => c.value > 0);

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-6">Resumo Financeiro</h2>

        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Saldo Global" value={formatCurrency(balance)} index={0} />
          <StatCard label="Receitas (Mês Atual)" value={formatCurrency(income)} valueClassName="text-income" index={1} />
          <StatCard label="Despesas (Mês Atual)" value={formatCurrency(expense)} valueClassName="text-expense" index={2} />
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receitas vs Despesas</CardTitle>
            <CardDescription>Comparativo do mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeExpenseBarChart data={barChartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por Categoria</CardTitle>
            <CardDescription>Distribuição do mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryPieChart data={pieChartData} />
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-xl font-bold tracking-tight mb-4">Minhas Contas</h3>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {accounts.map(acc => {
            // Saldo por conta inclui transferências: cada perna afeta a conta de origem/destino.
            const accBalance = computeAccountBalance(acc.initialBalance, acc.transactions);

            return (
              <Card key={acc.id} className="p-5 hover:border-foreground/20">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-semibold text-lg">{acc.name}</h4>
                    <span className="text-xs text-muted uppercase tracking-wider">{acc.type}</span>
                  </div>
                </div>
                <p className={`text-2xl font-bold tabular-nums ${accBalance >= 0 ? '' : 'text-expense'}`}>
                  {formatCurrency(accBalance)}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
