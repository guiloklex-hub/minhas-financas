"use client"

import { useState, useTransition, useEffect } from "react"
import { authenticateUser, hasRegisteredUser } from "@/actions/auth"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Mail, ShieldCheck, KeyRound } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [canRegister, setCanRegister] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const router = useRouter();

  useEffect(() => {
    hasRegisteredUser().then((hasUser) => {
      setCanRegister(!hasUser);
      setMounted(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await authenticateUser(formData);
      if (result.success) {
        // Redirecionamento após sucesso
        router.push("/");
        router.refresh();
      } else {
        if (result.requiresTwoFactor) {
          setRequiresTwoFactor(true);
        }
        if (result.error) {
          setError(result.error);
        } else if (result.requiresTwoFactor) {
          setError("");
        } else {
          setError("Erro ao realizar login");
        }
      }
    });
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorativo */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
            <ShieldCheck size={40} className="text-emerald-400" />
          </div>
        </div>
        
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-2">Bem-vindo de volta</h1>
          <p className="text-zinc-400 text-center mb-8 text-sm">Acesse sua conta para gerenciar suas finanças</p>

          {mounted ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-3 rounded-xl text-sm font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 text-center">
                    {error}
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

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-400 ml-1">Senha</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      name="password"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm placeholder:text-zinc-600"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {requiresTwoFactor && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-400 ml-1">Código de verificação (2FA)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                        <KeyRound size={18} />
                      </div>
                      <input
                        type="text"
                        name="token"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoFocus
                        className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm tracking-[0.4em] placeholder:tracking-normal placeholder:text-zinc-600"
                        placeholder="000000"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 ml-1 pt-1">Digite o código de 6 dígitos do seu app autenticador.</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 mt-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending ? <Loader2 size={18} className="animate-spin" /> : (requiresTwoFactor ? "Verificar e Entrar" : "Entrar na Conta")}
                </button>

                <div className="text-center">
                  <Link href="/esqueci-senha" className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors">
                    Esqueci minha senha
                  </Link>
                </div>
              </form>

              {canRegister && (
                <p className="mt-8 text-center text-sm text-zinc-500">
                  Ainda não tem conta?{" "}
                  <Link href="/registro" className="text-white hover:text-emerald-400 transition-colors font-medium">
                    Crie uma agora
                  </Link>
                </p>
              )}
            </>
          ) : (
            <div className="space-y-5 animate-pulse">
              <div className="h-16 bg-white/5 rounded-xl w-full"></div>
              <div className="h-16 bg-white/5 rounded-xl w-full"></div>
              <div className="h-12 mt-4 bg-white/10 rounded-xl w-full"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
