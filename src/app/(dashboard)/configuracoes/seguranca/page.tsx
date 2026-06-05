import { getCurrentUser } from "@/lib/session";
import SecurityFormClient from "./SecurityFormClient";
import { redirect } from "next/navigation";

export default async function SegurancaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8 max-w-2xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-white">Segurança</h3>
        <p className="text-sm text-zinc-400">Altere sua senha de acesso ao sistema.</p>
      </div>

      <SecurityFormClient />
    </div>
  );
}
