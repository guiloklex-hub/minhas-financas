"use client"

import { useState } from "react";
import Link from "next/link";
import { Account } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useHideValues, maskValue } from "@/lib/use-hide-values";
import { Wallet } from "lucide-react";
import AccountForm from "./AccountForm";
import TransferForm from "./TransferForm";

type AccountWithBalance = Account & { currentBalance: number };

interface AccountsListProps {
  initialAccounts: AccountWithBalance[];
}

export default function AccountsList({ initialAccounts }: AccountsListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountWithBalance | null>(null);

  const hidden = useHideValues();
  const formatCurrency = (value: number) =>
    maskValue(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), hidden);

  const handleEdit = (account: AccountWithBalance) => {
    setSelectedAccount(account);
    setIsFormOpen(true);
    setIsTransferFormOpen(false);
  };

  const handleAddNew = () => {
    setSelectedAccount(null);
    setIsFormOpen(true);
    setIsTransferFormOpen(false);
  };

  const handleTransfer = () => {
    setIsTransferFormOpen(true);
    setIsFormOpen(false);
  };

  const handleSuccess = () => {
    setIsFormOpen(false);
    setIsTransferFormOpen(false);
    setSelectedAccount(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Gestão de Contas</h2>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleTransfer}>Transferência</Button>
          <Button onClick={handleAddNew}>Nova Conta</Button>
        </div>
      </div>

      {isTransferFormOpen && (
        <div className="mb-8">
          <TransferForm 
            accounts={initialAccounts}
            onSuccess={handleSuccess}
            onCancel={() => setIsTransferFormOpen(false)}
          />
        </div>
      )}

      {isFormOpen && (
        <div className="mb-8">
          <AccountForm 
            account={selectedAccount} 
            onSuccess={handleSuccess} 
            onCancel={() => setIsFormOpen(false)} 
          />
        </div>
      )}

      {initialAccounts.length === 0 && !isFormOpen ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta cadastrada"
          description='Clique em "Nova Conta" para começar.'
          action={<Button onClick={handleAddNew}>Nova Conta</Button>}
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {initialAccounts.map(account => (
            <div
              key={account.id}
              className="flex h-32 cursor-pointer flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/40"
              onClick={() => handleEdit(account)}
            >
              <div className="flex items-start justify-between">
                <h4 className="font-semibold text-lg">{account.name}</h4>
                <span className="rounded-full bg-accent px-2 py-1 text-xs font-medium text-muted">
                  {account.type === 'CASH' ? 'Carteira' : account.type === 'CHECKING' ? 'Conta Corrente' : 'Cartão de Crédito'}
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className={`truncate text-2xl font-bold tabular-nums ${account.currentBalance >= 0 ? '' : 'text-expense'}`}>
                    {formatCurrency(account.currentBalance)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Saldo inicial: {formatCurrency(account.initialBalance)}
                  </p>
                </div>
                <Link
                  href={`/contas/${account.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 rounded-md border border-border bg-accent px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  Ver extrato
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
