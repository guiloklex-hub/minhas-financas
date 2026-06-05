"use client"

import { useState } from "react";
import Link from "next/link";
import { Account } from "@/generated/prisma/client";
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Gestão de Contas</h2>
        <div className="flex gap-3">
          <button 
            onClick={handleTransfer}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-all duration-200"
          >
            Transferência
          </button>
          <button 
            onClick={handleAddNew}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md transition-all duration-200"
          >
            Nova Conta
          </button>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {initialAccounts.map(account => (
          <div
            key={account.id}
            className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm hover:border-emerald-500/30 transition-all duration-200 cursor-pointer flex flex-col justify-between h-32"
            onClick={() => handleEdit(account)}
          >
            <div>
              <div className="flex justify-between items-start">
                <h4 className="font-semibold text-lg">{account.name}</h4>
                <span className="text-xs font-medium px-2 py-1 bg-white/5 text-white/70 rounded-full">
                  {account.type === 'CASH' ? 'Carteira' : account.type === 'CHECKING' ? 'Conta Corrente' : 'Cartão de Crédito'}
                </span>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className={`text-2xl font-bold ${account.currentBalance >= 0 ? '' : 'text-rose-500'}`}>
                  {formatCurrency(account.currentBalance)}
                </p>
                <p className="text-xs text-white/40 mt-1">
                  Saldo inicial: {formatCurrency(account.initialBalance)}
                </p>
              </div>
              <Link
                href={`/contas/${account.id}`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
              >
                Ver extrato
              </Link>
            </div>
          </div>
        ))}
        {initialAccounts.length === 0 && !isFormOpen && (
          <div className="col-span-full py-12 text-center text-white/50 border border-dashed border-[var(--color-border)] rounded-xl">
            Nenhuma conta cadastrada. Clique em &quot;Nova Conta&quot; para começar.
          </div>
        )}
      </div>
    </div>
  );
}
