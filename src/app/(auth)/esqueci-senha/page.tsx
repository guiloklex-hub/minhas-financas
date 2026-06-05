"use client"

import { useState, useTransition } from "react"
import { requestPasswordReset } from "@/actions/security"
import { Loader2, Mail, KeyRound, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function EsqueciSenhaPage() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setMessage({ text: result.message || "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.", type: "success" });
      } else {
        setMessage({ text: result.error || "Erro ao solicitar recuperação.", type: "error" });
      }
    });
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
            <KeyRound size={40} className="text-emerald-400" />
          </div>
        </div>

        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-2">Recuperar acesso</h1>
          <p className="text-zinc-400 text-center mb-8 text-sm">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {message && (
              <div className={`p-3 rounded-xl text-sm font-medium border text-center ${message.type === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                {message.text}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-400 ml-1">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm placeholder:text-zinc-600"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 mt-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 size={18} className="animate-spin" /> : "Enviar link de recuperação"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-500">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-white hover:text-emerald-400 transition-colors font-medium">
              <ArrowLeft size={14} /> Voltar para o login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
