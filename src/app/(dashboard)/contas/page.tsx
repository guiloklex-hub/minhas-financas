import { prisma } from "@/lib/prisma"
import AccountsList from "./AccountsList"

export const metadata = {
  title: "Gestão de Contas | Gerenciador de Finanças",
}

export default async function ContasPage() {
  const accounts = await prisma.account.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });

  return (
    <div className="max-w-5xl mx-auto py-6">
      <AccountsList initialAccounts={accounts} />
    </div>
  );
}
