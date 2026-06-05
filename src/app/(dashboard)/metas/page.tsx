import { prisma } from "@/lib/prisma"
import GoalsClient from "./GoalsClient"

export const metadata = {
  title: "Metas | Gerenciador de Finanças",
}

export default async function MetasPage() {
  const [goals, accounts] = await Promise.all([
    prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.account.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    }),
  ]);

  return (
    <div className="max-w-5xl mx-auto py-6">
      <GoalsClient initialGoals={goals} accounts={accounts} />
    </div>
  );
}
