"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { getSession } from "@/lib/session"
import { parseRequiredString, parseMoney, parseDate } from "@/lib/validation"
import { roundMoney } from "@/lib/money"
import { invoiceItemsTotal, closeInvoiceInternal } from "@/lib/credit-card-service"

type ActionResult = { success: boolean; error?: string };

/** Garante a categoria "Pagamento de Cartão" usada nas transações de pagamento. */
async function getPaymentCategoryId(): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { name: "Pagamento de Cartão" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: "Pagamento de Cartão", color: "#8b5cf6" },
    select: { id: true },
  });
  return created.id;
}

/**
 * Paga (total ou parcialmente) uma fatura. Cria uma Transaction EXPENSE na conta
 * pagadora com isTransfer=true (fora das KPIs de despesa, pois a despesa real já
 * é a compra no cartão) e creditCardInvoiceId ligando à fatura. Atualiza
 * paidAmount/status atomicamente.
 */
export async function payInvoice(formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const invoiceRes = parseRequiredString(formData.get("invoiceId"), "Fatura");
    if (!invoiceRes.ok) return { success: false, error: invoiceRes.error };

    const fromRes = parseRequiredString(formData.get("fromAccountId"), "Conta de pagamento");
    if (!fromRes.ok) return { success: false, error: fromRes.error };

    const amountRes = parseMoney(formData.get("amount"), "Valor", { min: 0.01 });
    if (!amountRes.ok) return { success: false, error: amountRes.error };

    const dateRes = parseDate(formData.get("date"), "Data");
    if (!dateRes.ok) return { success: false, error: dateRes.error };

    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceRes.value },
      include: {
        items: { select: { type: true, amount: true } },
        card: { select: { name: true } },
      },
    });
    if (!invoice) return { success: false, error: "Fatura não encontrada." };

    const account = await prisma.account.findUnique({ where: { id: fromRes.value } });
    if (!account) return { success: false, error: "Conta de pagamento não encontrada." };

    const total = invoice.totalAmount > 0 ? invoice.totalAmount : invoiceItemsTotal(invoice.items);
    const amount = roundMoney(amountRes.value);
    const newPaid = roundMoney(invoice.paidAmount + amount);
    const status = newPaid >= total ? "PAID" : "PARTIAL";
    const monthLabel = `${String(invoice.referenceMonth).padStart(2, "0")}/${invoice.referenceYear}`;
    const categoryId = await getPaymentCategoryId();

    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          title: `Pagamento fatura ${invoice.card.name} (${monthLabel})`,
          amount,
          type: "EXPENSE",
          date: dateRes.value,
          accountId: account.id,
          categoryId,
          isTransfer: true,
          creditCardInvoiceId: invoice.id,
        },
      }),
      prisma.creditCardInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          status,
          paymentGroupId: invoice.paymentGroupId ?? randomUUID(),
        },
      }),
    ]);

    revalidatePath("/");
    revalidatePath("/contas");
    revalidatePath("/transacoes");
    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${invoice.cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao pagar fatura:", error);
    return { success: false, error: "Erro interno ao pagar a fatura." };
  }
}

/**
 * Fecha uma fatura: snapshot do total, status CLOSED (ou PAID se já quitada) e
 * materializa a fatura da próxima competência. Também é chamado pelo cron.
 */
export async function closeInvoice(invoiceId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Não autorizado. Faça login novamente." };

  try {
    const result = await closeInvoiceInternal(invoiceId);
    if (!result.ok) return { success: false, error: result.error };

    revalidatePath("/cartoes");
    revalidatePath(`/cartoes/${result.cardId}`);
    return { success: true };
  } catch (error) {
    console.error("Erro ao fechar fatura:", error);
    return { success: false, error: "Erro interno ao fechar a fatura." };
  }
}
