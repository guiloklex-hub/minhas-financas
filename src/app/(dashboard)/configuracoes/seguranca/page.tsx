import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import SecurityFormClient from "./SecurityFormClient";
import { redirect } from "next/navigation";

export default async function SegurancaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });

  return (
    <div className="bg-card/60 border border-border rounded-xl p-8 max-w-2xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-foreground">Segurança</h3>
        <p className="text-sm text-muted">Altere sua senha e gerencie a verificação em duas etapas.</p>
      </div>

      <SecurityFormClient twoFactorEnabled={dbUser?.twoFactorEnabled ?? false} />
    </div>
  );
}
