import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ShieldCheck, ShieldAlert, KeyRound, Lock, History } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Login realizado",
  LOGIN_FAILED: "Falha de login",
  TWO_FACTOR_ENABLED: "2FA ativado",
  TWO_FACTOR_DISABLED: "2FA desativado",
  PASSWORD_RESET_REQUESTED: "Recuperação de senha solicitada",
  PASSWORD_RESET_COMPLETED: "Senha redefinida",
};

function actionStyle(action: string): { icon: React.ReactNode; className: string } {
  switch (action) {
    case "LOGIN_SUCCESS":
      return { icon: <ShieldCheck size={16} />, className: "bg-emerald-500/10 text-emerald-400" };
    case "LOGIN_FAILED":
      return { icon: <ShieldAlert size={16} />, className: "bg-rose-500/10 text-rose-400" };
    case "TWO_FACTOR_ENABLED":
      return { icon: <ShieldCheck size={16} />, className: "bg-emerald-500/10 text-emerald-400" };
    case "TWO_FACTOR_DISABLED":
      return { icon: <ShieldAlert size={16} />, className: "bg-amber-500/10 text-amber-400" };
    case "PASSWORD_RESET_REQUESTED":
      return { icon: <KeyRound size={16} />, className: "bg-sky-500/10 text-sky-400" };
    case "PASSWORD_RESET_COMPLETED":
      return { icon: <Lock size={16} />, className: "bg-emerald-500/10 text-emerald-400" };
    default:
      return { icon: <History size={16} />, className: "bg-zinc-800 text-muted" };
  }
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
});

export default async function AuditoriaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="bg-card/60 border border-border rounded-xl p-8 max-w-3xl">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-foreground">Auditoria</h3>
        <p className="text-sm text-muted">Registro das últimas ações sensíveis da sua conta (logins, 2FA, recuperação de senha).</p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">Nenhum registro de auditoria ainda.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background text-muted">
              <tr>
                <th className="text-left font-medium px-4 py-3">Ação</th>
                <th className="text-left font-medium px-4 py-3">Data</th>
                <th className="text-left font-medium px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => {
                const { icon, className } = actionStyle(log.action);
                return (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className={`p-1.5 rounded-md ${className}`}>{icon}</span>
                        <span className="text-foreground">{ACTION_LABELS[log.action] ?? log.action}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{dateFormatter.format(log.createdAt)}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{log.ipAddress ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
