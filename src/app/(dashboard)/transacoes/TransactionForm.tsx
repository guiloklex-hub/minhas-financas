"use client"

import { useTransition, useState } from "react"
import { toast } from "sonner"
import { createTransaction } from "@/actions/transactions"
import { Category, Account } from "@/generated/prisma/client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

export default function TransactionForm({ categories, accounts }: { categories: Category[], accounts: Account[] }) {
  const [isPending, startTransition] = useTransition();
  const [isRecurring, setIsRecurring] = useState(false);

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createTransaction(formData);
      if (result.success) {
        (document.getElementById("transaction-form") as HTMLFormElement).reset();
        setIsRecurring(false);
        toast.success("Transação adicionada!");
      } else {
        toast.error(result.error || "Erro ao adicionar transação.");
      }
    });
  }

  return (
    <Card className="p-6">
      <form id="transaction-form" action={handleSubmit} className="space-y-4">
        <h3 className="text-xl font-semibold mb-2">Nova Transação</h3>

        <div className="space-y-1.5">
          <Label htmlFor="title">Título</Label>
          <Input required type="text" id="title" name="title" placeholder="Ex: Salário Mensal" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input required type="number" step="0.01" min="0" id="amount" name="amount" placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Data</Label>
            <Input required type="date" id="date" name="date" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="type">Tipo</Label>
            <Select required id="type" name="type">
              <option value="INCOME">Receita</option>
              <option value="EXPENSE">Despesa</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">Categoria</Label>
            <Select required id="categoryId" name="categoryId" defaultValue="">
              <option value="">Selecione...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountId">Conta / Carteira</Label>
            <Select required id="accountId" name="accountId" defaultValue="">
              <option value="">Selecione...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tags">Tags</Label>
          <Input type="text" id="tags" name="tags" placeholder="Separadas por vírgula. Ex: casa, contas" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Observações</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            className="flex w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Detalhes adicionais (opcional)"
          />
        </div>

        <div className="flex flex-col gap-4 rounded-md border border-border bg-accent/40 p-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              name="isRecurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-ring"
            />
            <span className="text-sm font-medium text-foreground/90">Transação Recorrente?</span>
          </label>

          {isRecurring && (
            <div className="space-y-1.5">
              <Label htmlFor="recurrenceMonths">Repetir por quantos meses?</Label>
              <Input type="number" id="recurrenceMonths" name="recurrenceMonths" min="2" max="24" defaultValue="2" className="md:w-1/3" />
              <p className="text-xs text-muted">Gera cópias desta transação para os meses seguintes.</p>
            </div>
          )}
        </div>

        <Button type="submit" loading={isPending} className="w-full">
          {isPending ? "Salvando..." : "Adicionar Transação"}
        </Button>
      </form>
    </Card>
  );
}
