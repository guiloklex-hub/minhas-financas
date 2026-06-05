import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import TransactionForm from "./TransactionForm"
import CsvImporter from "./CsvImporter"
import AiQuickLaunch from "./AiQuickLaunch"
import TransactionListClient from "./TransactionListClient"

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  accountId?: string;
  categoryId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** Garante uma string a partir de um valor de searchParams (string | string[] | undefined). */
function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Converte "YYYY-MM-DD" em Date válida (local), ou null se inválida/ausente. */
function parseDateParam(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function TransacoesPage({
  searchParams,
}: {
  // Next 16: searchParams é uma Promise.
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const q = firstValue(sp.q).trim();
  const accountId = firstValue(sp.accountId);
  const categoryId = firstValue(sp.categoryId);
  const type = firstValue(sp.type);
  const from = firstValue(sp.from);
  const to = firstValue(sp.to);
  const pageRaw = parseInt(firstValue(sp.page), 10);
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

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

  // Monta o filtro Prisma a partir dos searchParams validados.
  const where: Prisma.TransactionWhereInput = {};

  if (q) {
    // SQLite: LIKE é case-insensitive para ASCII; não há `mode` no provider.
    where.title = { contains: q };
  }
  if (accountId) where.accountId = accountId;
  if (categoryId) where.categoryId = categoryId;
  if (type === "INCOME" || type === "EXPENSE") where.type = type;

  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);
  if (fromDate || toDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (fromDate) dateFilter.gte = fromDate;
    if (toDate) {
      // Inclui o dia inteiro do "to": até o fim do dia (23:59:59.999).
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    where.date = dateFilter;
  }

  const total = await prisma.transaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true },
    orderBy: { date: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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
        transactions={transactions}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        categories={categories}
        accounts={accounts}
        filters={{ q, accountId, categoryId, type, from, to }}
      />
    </div>
  );
}
