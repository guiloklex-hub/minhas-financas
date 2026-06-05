import { prisma } from "@/lib/prisma"
import { getCategories } from "@/actions/categories"
import { getRecurringRules } from "@/actions/recurring"
import RecurringRulesClient from "./RecurringRulesClient"

export const metadata = {
  title: "Recorrências | Gerenciador de Finanças",
};

export default async function RecorrenciasPage() {
  const [rules, categories, accounts] = await Promise.all([
    getRecurringRules(),
    getCategories(),
    prisma.account.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Envia ao client apenas os campos necessários de cada select.
  const categoriesForClient = categories.map((c) => ({ id: c.id, name: c.name }));
  const accountsForClient = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Recorrências</h2>
        <p className="text-zinc-400 mt-1">
          Regras que geram transações automaticamente na data certa.
        </p>
      </div>

      <RecurringRulesClient
        initialRules={rules}
        categories={categoriesForClient}
        accounts={accountsForClient}
      />
    </div>
  );
}
