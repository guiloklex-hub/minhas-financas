import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const mod = await vi.importActual<typeof import("./__mocks__/prisma")>("./__mocks__/prisma");
  return { prisma: mod.prismaMock };
});

vi.mock("./notifications", () => ({ createNotification: vi.fn() }));
vi.mock("./credit-card-service", () => ({
  closeInvoiceInternal: vi.fn(),
  ensureInvoiceForDate: vi.fn(),
}));

import { prismaMock } from "./__mocks__/prisma";
import { createNotification } from "./notifications";
import { closeInvoiceInternal } from "./credit-card-service";
import { runCreditCardJobs } from "./credit-card-cron";

const NOW = new Date(2026, 5, 20, 12, 0, 0); // 20/06/2026, horário local

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCardInvoice.findMany.mockResolvedValue([] as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaMock.creditCard.findMany.mockResolvedValue([] as any);
  prismaMock.notification.findFirst.mockResolvedValue(null);
});

describe("lib/credit-card-cron.ts — runCreditCardJobs", () => {
  it("caminho vazio: não fecha faturas nem gera alertas", async () => {
    const result = await runCreditCardJobs(NOW);
    expect(result).toEqual({ invoicesClosed: 0, cardAlerts: 0 });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("fecha uma fatura OPEN vencida e notifica (dedupe por dia)", async () => {
    prismaMock.creditCardInvoice.findMany
      // 1) toClose
      .mockResolvedValueOnce([
        {
          id: "inv-1",
          cardId: "card-1",
          referenceMonth: 5,
          referenceYear: 2026,
          card: { name: "Nubank" },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any)
      // 2) overdueCandidates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce([] as any)
      // 3) dueSoon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce([] as any);

    vi.mocked(closeInvoiceInternal).mockResolvedValue({ ok: true, cardId: "card-1" });

    const result = await runCreditCardJobs(NOW);

    expect(closeInvoiceInternal).toHaveBeenCalledWith("inv-1");
    expect(result.invoicesClosed).toBe(1);
    expect(result.cardAlerts).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createNotification).mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: "Fatura fechada: Nubank (05/2026)", type: "INFO" })
    );
  });

  it("não duplica notificação quando já existe uma com o mesmo título hoje", async () => {
    prismaMock.creditCardInvoice.findMany
      .mockResolvedValueOnce([
        {
          id: "inv-1",
          cardId: "card-1",
          referenceMonth: 5,
          referenceYear: 2026,
          card: { name: "Nubank" },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce([] as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce([] as any);

    vi.mocked(closeInvoiceInternal).mockResolvedValue({ ok: true, cardId: "card-1" });
    // Já existe notificação com o mesmo título hoje.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.notification.findFirst.mockResolvedValue({ id: "n-1" } as any);

    const result = await runCreditCardJobs(NOW);

    expect(result.invoicesClosed).toBe(1);
    expect(result.cardAlerts).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
