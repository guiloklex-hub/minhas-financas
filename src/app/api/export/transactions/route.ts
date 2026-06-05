import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Prisma } from "@prisma/client";

/**
 * GET /api/export/transactions
 *
 * Exporta as transações (respeitando os MESMOS filtros da tela de transações:
 * q, accountId, categoryId, type, from, to) em CSV.
 *
 * Colunas: Data, Título, Tipo, Categoria, Conta, Valor, Conciliada, Tags, Observações.
 */

/** Converte "YYYY-MM-DD" em Date válida (local), ou null se inválida/ausente. */
function parseDateParam(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Escapa um campo para CSV: sempre entre aspas, com aspas duplas escapadas. */
function csvField(value: string | null | undefined): string {
  const str = value ?? "";
  return `"${str.replace(/"/g, '""')}"`;
}

/** Formata Date para "DD/MM/AAAA" no mesmo critério visual da listagem. */
function formatDate(date: Date): string {
  const localDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  return new Intl.DateTimeFormat("pt-BR").format(localDate);
}

/** Formata um número como valor monetário pt-BR (sem símbolo, com vírgula decimal). */
function formatAmount(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function GET(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const accountId = searchParams.get("accountId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const type = searchParams.get("type") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

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

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true },
    orderBy: { date: "desc" },
  });

  const header = [
    "Data",
    "Título",
    "Tipo",
    "Categoria",
    "Conta",
    "Valor",
    "Conciliada",
    "Tags",
    "Observações",
  ]
    .map(csvField)
    .join(",");

  const rows = transactions.map((t) => {
    const tags = t.tags
      ? t.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .join(", ")
      : "";

    return [
      csvField(formatDate(t.date)),
      csvField(t.title),
      csvField(t.type === "INCOME" ? "Receita" : "Despesa"),
      csvField(t.category?.name ?? "Sem categoria"),
      csvField(t.account?.name ?? "Sem conta"),
      csvField(formatAmount(t.amount)),
      csvField(t.reconciled ? "Sim" : "Não"),
      csvField(tags),
      csvField(t.notes ?? ""),
    ].join(",");
  });

  // BOM para o Excel reconhecer UTF-8 corretamente.
  const csv = "﻿" + [header, ...rows].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=transacoes.csv",
    },
  });
}
