"use client"

import { useState } from "react";
import { Account } from "@prisma/client";
import AccountForm from "./AccountForm";

interface AccountsListProps {
  initialAccounts: Account[];
}

export default function AccountsList({ initialAccounts }: AccountsListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedAccount(null);
    setIsFormOpen(true);
  };

  const handleSuccess = () => {
    setIsFormOpen(false);
    setSelectedAccount(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Gestão de Contas</h2>
        <button 
          onClick={handleAddNew}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-md transition-all duration-200"
        >
          Nova Conta
        </button>
      </div>

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
            <p className="text-2xl font-bold">
              {formatCurrency(account.initialBalance)}
            </p>
          </div>
        ))}
        {initialAccounts.length === 0 && !isFormOpen && (
          <div className="col-span-full py-12 text-center text-white/50 border border-dashed border-[var(--color-border)] rounded-xl">
            Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.
          </div>
        )}
      </div>
    </div>
  );
}
