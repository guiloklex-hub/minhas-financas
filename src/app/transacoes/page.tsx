import { prisma } from "@/lib/prisma"
import TransactionForm from "./TransactionForm"
import CsvImporter from "./CsvImporter"
import AiQuickLaunch from "./AiQuickLaunch"

export default async function TransacoesPage() {
  let categories = await prisma.category.findMany();
  
  if (categories.length === 0) {
    await prisma.category.createMany({
      data: [
        { name: "Salário", color: "#10b981" },
        { name: "Alimentação", color: "#f59e0b" },
        { name: "Moradia", color: "#3b82f6" },
        { name: "Transporte", color: "#8b5cf6" },
        { name: "Lazer", color: "#ec4899" },
      ]
    });
    categories = await prisma.category.findMany();
  }

  const accounts = await prisma.account.findMany();

  const transactions = await prisma.transaction.findMany({
    include: { category: true, account: true },
    orderBy: { date: 'desc' }
  });
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: Date) => {
    // Add timezone offset to prevent day shifting when formatting
    const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return new Intl.DateTimeFormat('pt-BR').format(localDate);
  };

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Transações</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <AiQuickLaunch accounts={accounts} />
        <TransactionForm categories={categories} accounts={accounts} />
        <CsvImporter categories={categories} accounts={accounts} />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-[var(--color-border)] uppercase text-white/60">
              <tr>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Conta</th>
                <th className="px-6 py-4 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-white/50">Nenhuma transação encontrada.</td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-white/80">{formatDate(t.date)}</td>
                    <td className="px-6 py-4 font-medium">{t.title}</td>
                    <td className="px-6 py-4 text-white/80">
                      <span 
                        className="px-2 py-1 rounded-md text-xs font-medium bg-white/10"
                        style={{ color: t.category?.color || '#fff' }}
                      >
                        {t.category?.name || "Sem categoria"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/80">{t.account?.name || "Sem conta"}</td>
                    <td className={`px-6 py-4 text-right font-semibold whitespace-nowrap ${t.type === 'INCOME' ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'}`}>
                      {t.type === 'INCOME' ? '+' : '-'}{formatCurrency(t.amount)}
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
