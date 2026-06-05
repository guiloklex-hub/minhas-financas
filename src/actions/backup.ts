"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import type {
  Account,
  Category,
  Budget,
  Transaction,
  Investment,
  RecurringRule,
  Goal,
} from "@/generated/prisma/client";

/**
 * Forma esperada do arquivo de backup gerado por GET /api/backup.
 * As datas chegam como string ISO (JSON) e são reidratadas para Date no restore.
 */
type BackupData = {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  investments: Investment[];
  recurringRules: RecurringRule[];
  goals: Goal[];
};

type BackupFile = {
  version: number;
  exportedAt: string;
  data: BackupData;
};

/** True se `value` é um objeto não-nulo (e não array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valida que todas as chaves listadas existem e são arrays. */
function hasArrayKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Array.isArray(obj[key]));
}

const DATA_KEYS = [
  "accounts",
  "categories",
  "budgets",
  "transactions",
  "investments",
  "recurringRules",
  "goals",
] as const;

/**
 * Type guard do arquivo de backup: confere `version` numérica e que `data`
 * contém todas as tabelas esperadas como arrays. Não valida o shape de cada
 * linha em profundidade — o Prisma rejeita linhas malformadas na recriação.
 */
function isBackupFile(value: unknown): value is BackupFile {
  if (!isRecord(value)) return false;
  if (typeof value.version !== "number") return false;
  if (!isRecord(value.data)) return false;
  return hasArrayKeys(value.data, DATA_KEYS);
}

/** Reidrata campos de data (ISO string ou Date) para Date. */
function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

/** Date opcional: null/undefined permanecem null. */
function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return toDate(value);
}

export async function restoreBackup(
  formData: FormData
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Selecione um arquivo de backup (.json)." };
  }

  // 1) Lê e parseia o JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { success: false, error: "Arquivo inválido: não é um JSON válido." };
  }

  // 2) Valida versão e shape.
  if (!isBackupFile(parsed)) {
    return { success: false, error: "Arquivo de backup inválido ou incompleto." };
  }
  if (parsed.version !== 1) {
    return {
      success: false,
      error: `Versão de backup não suportada (v${parsed.version}). Esperado v1.`,
    };
  }

  const { accounts, categories, budgets, transactions, investments, recurringRules, goals } =
    parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // 3a) Apaga os dados atuais respeitando as FKs:
      // primeiro as tabelas-filhas, depois as tabelas-pai.
      await tx.transaction.deleteMany();
      await tx.budget.deleteMany();
      await tx.recurringRule.deleteMany();
      await tx.goal.deleteMany();
      await tx.account.deleteMany();
      await tx.category.deleteMany();
      await tx.investment.deleteMany();

      // 3b) Recria a partir do backup, preservando ids.
      // Pais primeiro (account, category, investment), depois filhas.
      if (accounts.length > 0) {
        await tx.account.createMany({
          data: accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            initialBalance: a.initialBalance,
            currency: a.currency,
            createdAt: toDate(a.createdAt),
            updatedAt: toDate(a.updatedAt),
          })),
        });
      }

      if (categories.length > 0) {
        await tx.category.createMany({
          data: categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            icon: c.icon,
            sortOrder: c.sortOrder,
            createdAt: toDate(c.createdAt),
            updatedAt: toDate(c.updatedAt),
          })),
        });
      }

      if (investments.length > 0) {
        await tx.investment.createMany({
          data: investments.map((i) => ({
            id: i.id,
            name: i.name,
            type: i.type,
            initialAmount: i.initialAmount,
            currentAmount: i.currentAmount,
            yieldRate: i.yieldRate,
            startDate: toDate(i.startDate),
            maturityDate: toDateOrNull(i.maturityDate),
            createdAt: toDate(i.createdAt),
            updatedAt: toDate(i.updatedAt),
          })),
        });
      }

      if (budgets.length > 0) {
        await tx.budget.createMany({
          data: budgets.map((b) => ({
            id: b.id,
            amountLimit: b.amountLimit,
            month: b.month,
            year: b.year,
            categoryId: b.categoryId,
            createdAt: toDate(b.createdAt),
            updatedAt: toDate(b.updatedAt),
          })),
        });
      }

      if (recurringRules.length > 0) {
        await tx.recurringRule.createMany({
          data: recurringRules.map((r) => ({
            id: r.id,
            title: r.title,
            amount: r.amount,
            type: r.type,
            frequency: r.frequency,
            dayOfMonth: r.dayOfMonth,
            nextRunDate: toDate(r.nextRunDate),
            lastRunDate: toDateOrNull(r.lastRunDate),
            isActive: r.isActive,
            categoryId: r.categoryId,
            accountId: r.accountId,
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          })),
        });
      }

      if (goals.length > 0) {
        await tx.goal.createMany({
          data: goals.map((g) => ({
            id: g.id,
            name: g.name,
            targetAmount: g.targetAmount,
            currentAmount: g.currentAmount,
            deadline: toDateOrNull(g.deadline),
            accountId: g.accountId,
            createdAt: toDate(g.createdAt),
            updatedAt: toDate(g.updatedAt),
          })),
        });
      }

      if (transactions.length > 0) {
        await tx.transaction.createMany({
          data: transactions.map((t) => ({
            id: t.id,
            title: t.title,
            amount: t.amount,
            type: t.type,
            date: toDate(t.date),
            notes: t.notes,
            tags: t.tags,
            reconciled: t.reconciled,
            isTransfer: t.isTransfer,
            transferGroupId: t.transferGroupId,
            recurrenceGroupId: t.recurrenceGroupId,
            categoryId: t.categoryId,
            accountId: t.accountId,
            createdAt: toDate(t.createdAt),
            updatedAt: toDate(t.updatedAt),
          })),
        });
      }

      await tx.auditLog.create({
        data: { action: "BACKUP_RESTORE", entity: "Backup" },
      });
    });
  } catch (error) {
    console.error("Erro ao restaurar backup:", error);
    return {
      success: false,
      error: "Erro ao restaurar o backup. Os dados atuais foram preservados.",
    };
  }

  revalidatePath("/");

  const total =
    accounts.length +
    categories.length +
    budgets.length +
    transactions.length +
    investments.length +
    recurringRules.length +
    goals.length;

  return {
    success: true,
    message:
      `Backup restaurado: ${total} registro(s) — ` +
      `${accounts.length} conta(s), ${categories.length} categoria(s), ` +
      `${transactions.length} transação(ões), ${budgets.length} orçamento(s), ` +
      `${investments.length} investimento(s), ${recurringRules.length} recorrência(s), ` +
      `${goals.length} meta(s).`,
  };
}
