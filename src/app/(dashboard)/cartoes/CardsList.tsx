"use client"

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, CreditCard as CreditCardIcon } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { formatCivilDate } from "@/lib/format-date";
import CardForm from "./CardForm";

type CardView = {
  id: string;
  name: string;
  brand: string | null;
  lastFour: string | null;
  color: string | null;
  currency: string;
  creditLimit: number;
  totalOwed: number;
  currentInvoiceTotal: number;
  availableLimit: number;
  usagePercent: number;
  nextDueDate: string;
};

type AccountOption = { id: string; name: string };

function usageColor(pct: number): string {
  if (pct >= 100) return "bg-rose-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function CardsList({ cards, accounts }: { cards: CardView[]; accounts: AccountOption[] }) {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const totalOpenInvoice = cards.reduce((acc, c) => acc + c.currentInvoiceTotal, 0);
  const totalAvailable = cards.reduce((acc, c) => acc + c.availableLimit, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Cartões de Crédito</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-white hover:bg-neutral-200 rounded-md transition-all duration-200"
        >
          <Plus size={16} /> Novo cartão
        </button>
      </div>

      {showForm && (
        <CardForm
          accounts={accounts}
          onSuccess={() => {
            setShowForm(false);
            router.refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {cards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Faturas abertas (total)</h3>
            <p className="text-3xl font-semibold text-rose-500">{formatMoney(totalOpenInvoice, "BRL")}</p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-card">
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Limite disponível (total)</h3>
            <p className="text-3xl font-semibold text-emerald-500">{formatMoney(totalAvailable, "BRL")}</p>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted">
          <CreditCardIcon size={40} className="mx-auto mb-3 opacity-50" />
          <p>Nenhum cartão cadastrado ainda.</p>
          <p className="text-sm">Clique em &quot;Novo cartão&quot; para começar.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.id}
              href={`/cartoes/${card.id}`}
              className="group rounded-2xl p-5 shadow-lg border border-white/10 hover:border-white/30 transition-all duration-200 text-foreground flex flex-col justify-between min-h-44"
              style={{
                background: `linear-gradient(135deg, ${card.color || "#7c3aed"} 0%, rgba(0,0,0,0.65) 130%)`,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-lg">{card.name}</p>
                  <p className="text-xs uppercase tracking-widest opacity-80">
                    {card.brand || "CARD"} {card.lastFour ? `•••• ${card.lastFour}` : ""}
                  </p>
                </div>
                <CreditCardIcon size={22} className="opacity-80" />
              </div>

              <div className="mt-6">
                <div className="flex justify-between text-xs opacity-90 mb-1">
                  <span>Fatura atual</span>
                  <span>{formatMoney(card.currentInvoiceTotal, card.currency)}</span>
                </div>
                <div className="w-full bg-background rounded-full h-2 overflow-hidden mb-2">
                  <div
                    className={`h-2 rounded-full ${usageColor(card.usagePercent)}`}
                    style={{ width: `${Math.min(100, Math.max(0, card.usagePercent))}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs opacity-90">
                  <span>Disponível {formatMoney(card.availableLimit, card.currency)}</span>
                  <span>Vence {formatCivilDate(card.nextDueDate)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
