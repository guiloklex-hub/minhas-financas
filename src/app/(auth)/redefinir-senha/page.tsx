"use client"

import { Suspense, useState, useTransition } from "react"
import { resetPassword } from "@/actions/security"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2, Lock, ShieldCheck, ArrowLeft } from "lucide-react"
import Link from "next/link"

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setMessage({ text: "As senhas não coincidem.", type: "error" });
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(token, newPassword);
      if (result.success) {
        setMessage({ text: result.message || "Senha redefinida com sucesso!", type: "success" });
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      } else {
        setMessage({ text: result.error || "Erro ao redefinir a senha.", type: "error" });
      }
    });
  }

  if (!token) {
    return (
      <div className="space-y-5">
        <div className="p-3 rounded-xl text-sm font-medium border text-center bg-rose-500/10 text-rose-400 border-rose-500/20">
          Link inválido ou incompleto. Solicite um novo link de recuperação.
        </div>
        <p className="text-center text-sm text-muted">
          <Link href="/esqueci-senha" className="text-foreground hover:text-emerald-400 transition-colors font-medium">
            Solicitar novo link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {message && (
          <div className={`p-3 rounded-xl text-sm font-medium border text-center ${message.type === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
            {message.text}
          </div>
        )}

        {!done && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted ml-1">Nova senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  name="newPassword"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-black/40 border border-border rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm placeholder:text-muted"
                  placeholder="Nova senha (mínimo 6 caracteres)"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted ml-1">Confirmar nova senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  name="confirmPassword"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 bg-black/40 border border-border rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm placeholder:text-muted"
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 mt-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : "Redefinir senha"}
            </button>
          </>
        )}
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-foreground hover:text-emerald-400 transition-colors font-medium">
          <ArrowLeft size={14} /> Voltar para o login
        </Link>
      </p>
    </>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-accent rounded-2xl border border-white/10 backdrop-blur-md">
            <ShieldCheck size={40} className="text-emerald-400" />
          </div>
        </div>

        <div className="bg-card/60 backdrop-blur-xl border border-border rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-2">Nova senha</h1>
          <p className="text-muted text-center mb-8 text-sm">Defina uma nova senha para a sua conta.</p>

          <Suspense fallback={<div className="h-32 animate-pulse bg-accent rounded-xl" />}>
            <RedefinirSenhaForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
