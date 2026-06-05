import { prisma } from "@/lib/prisma"
import BudgetForm from "./BudgetForm"
import DeleteBudgetButton from "./DeleteBudgetButton"

export default async function OrcamentosPage() {
  const categories = await prisma.category.findMany();
  
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: {
      month: currentMonth,
      year: currentYear
    },
    include: {
      category: {
        include: {
          transactions: {
            where: {
              type: "EXPENSE",
              date: {
                gte: new Date(currentYear, currentMonth - 1, 1),
                lt: new Date(currentYear, currentMonth, 1)
              }
            }
          }
        }
      }
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Orçamentos</h2>
      
      <BudgetForm categories={categories} />

      <div className="space-y-6">
        <h3 className="text-xl font-semibold">Uso de Orçamento ({String(currentMonth).padStart(2, '0')}/{currentYear})</h3>
        
        {budgets.length === 0 ? (
          <div className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-center text-white/50">
            Nenhum orçamento definido para este mês.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {budgets.map((b) => {
              const spent = b.category.transactions.reduce((acc, t) => acc + t.amount, 0);
              const percentage = Math.min((spent / b.amountLimit) * 100, 100);
              const isOverBudget = spent > b.amountLimit;

              return (
                <div key={b.id} className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.category.color || '#fff' }}></div>
                      {b.category.name}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white/70">
                        {formatCurrency(spent)} / {formatCurrency(b.amountLimit)}
                      </span>
                      <DeleteBudgetButton id={b.id} categoryName={b.category.name} />
                    </div>
                  </div>
                  
                  <div className="w-full bg-white/10 rounded-full h-3 mb-2 overflow-hidden">
                    <div 
                      className={`h-3 rounded-full transition-all duration-500 ${isOverBudget ? 'bg-[var(--color-expense)]' : 'bg-white'}`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  
                  {isOverBudget ? (
                    <p className="text-xs text-[var(--color-expense)] font-medium text-right">Limite ultrapassado!</p>
                  ) : (
                    <p className="text-xs text-white/50 text-right">{(100 - percentage).toFixed(1)}% disponível</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
