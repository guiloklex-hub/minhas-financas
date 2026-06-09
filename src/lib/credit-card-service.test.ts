import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>("./__mocks__/prisma");
  return { prisma: mod.prismaMock };
});

import { prismaMock } from "./__mocks__/prisma";
import {
  invoiceItemsTotal,
  recordReward,
  getRewardBalance,
  ensureInvoice,
  closeInvoiceInternal,
} from "./credit-card-service";

const CARD = { id: "card-1", closingDay: 15, dueDay: 25 };

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.$transaction.mockImplementation(async (arg: any) => {
    if (typeof arg === "function") return arg(prismaMock);
    return Promise.all(arg);
  });
});

describe("lib/credit-card-service.ts — invoiceItemsTotal", () => {
  it("soma cargas e abate REFUND, arredondando", () => {
    expect(
      invoiceItemsTotal([
        { type: "PURCHASE", amount: 100.1 },
        { type: "FEE", amount: 9.9 },
        { type: "REFUND", amount: 10 },
      ])
    ).toBe(100);
  });

  it("retorna 0 para fatura vazia", () => {
    expect(invoiceItemsTotal([])).toBe(0);
  });
});

describe("lib/credit-card-service.ts — recordReward", () => {
  it("calcula balanceAfter a partir do saldo atual do ledger", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.cardRewardLedger.aggregate.mockResolvedValue({ _sum: { points: 100 } } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.cardRewardLedger.create.mockResolvedValue({} as any);

    const balance = await recordReward(prismaMock, {
      cardId: "card-1",
      type: "REDEEM",
      points: -30,
    });

    expect(balance).toBe(70);
    expect(prismaMock.cardRewardLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ balanceAfter: 70, points: -30 }) })
    );
  });

  it("getRewardBalance trata ledger vazio como 0", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.cardRewardLedger.aggregate.mockResolvedValue({ _sum: { points: null } } as any);
    expect(await getRewardBalance(prismaMock, "card-1")).toBe(0);
  });
});

describe("lib/credit-card-service.ts — ensureInvoice", () => {
  it("faz upsert idempotente e devolve o id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.creditCardInvoice.upsert.mockResolvedValue({ id: "inv-1" } as any);
    const id = await ensureInvoice(prismaMock, CARD, { month: 6, year: 2026 });
    expect(id).toBe("inv-1");
    const arg = prismaMock.creditCardInvoice.upsert.mock.calls[0][0];
    expect(arg?.where?.cardId_referenceMonth_referenceYear).toEqual({
      cardId: "card-1",
      referenceMonth: 6,
      referenceYear: 2026,
    });
  });
});

describe("lib/credit-card-service.ts — closeInvoiceInternal", () => {
  it("retorna erro quando a fatura não existe", async () => {
    prismaMock.creditCardInvoice.findUnique.mockResolvedValue(null);
    const res = await closeInvoiceInternal("inv-x");
    expect(res).toEqual({ ok: false, error: "Fatura não encontrada." });
  });

  it("marca PAID quando paidAmount cobre o total e abre a próxima competência", async () => {
    prismaMock.creditCardInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      cardId: "card-1",
      referenceMonth: 6,
      referenceYear: 2026,
      paidAmount: 100,
      items: [{ type: "PURCHASE", amount: 100 }],
      card: CARD,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.creditCardInvoice.update.mockResolvedValue({} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.creditCardInvoice.upsert.mockResolvedValue({ id: "inv-2" } as any);

    const res = await closeInvoiceInternal("inv-1");
    expect(res).toEqual({ ok: true, cardId: "card-1" });
    expect(prismaMock.creditCardInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalAmount: 100, status: "PAID" } })
    );
    // Próxima competência (07/2026) materializada via upsert.
    const upsertArg = prismaMock.creditCardInvoice.upsert.mock.calls[0][0];
    expect(upsertArg?.where?.cardId_referenceMonth_referenceYear).toEqual({
      cardId: "card-1",
      referenceMonth: 7,
      referenceYear: 2026,
    });
  });

  it("marca CLOSED quando o pagamento não cobre o total", async () => {
    prismaMock.creditCardInvoice.findUnique.mockResolvedValue({
      id: "inv-1",
      cardId: "card-1",
      referenceMonth: 6,
      referenceYear: 2026,
      paidAmount: 0,
      items: [{ type: "PURCHASE", amount: 100 }],
      card: CARD,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.creditCardInvoice.update.mockResolvedValue({} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.creditCardInvoice.upsert.mockResolvedValue({ id: "inv-2" } as any);

    await closeInvoiceInternal("inv-1");
    expect(prismaMock.creditCardInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalAmount: 100, status: "CLOSED" } })
    );
  });
});
