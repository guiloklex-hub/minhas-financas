import { prisma } from "@/lib/prisma"
import TransactionForm from "./TransactionForm"
import CsvImporter from "./CsvImporter"
import AiQuickLaunch from "./AiQuickLaunch"
import TransactionListClient from "./TransactionListClient"

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

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold tracking-tight">Transações</h2>
      
      <div className="grid grid-cols-1 gap-6">
        <AiQuickLaunch accounts={accounts} />
        <TransactionForm categories={categories} accounts={accounts} />
        <CsvImporter categories={categories} accounts={accounts} />
      </div>

      <TransactionListClient 
        initialTransactions={transactions}
        categories={categories}
        accounts={accounts}
      />
    </div>
  );
}
