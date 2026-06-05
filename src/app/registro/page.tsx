"use client"

import { useState, useTransition, useEffect } from "react"
import { registerUser, hasRegisteredUser } from "@/actions/auth"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Mail, UserPlus } from "lucide-react"
import Link from "next/link"

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    hasRegisteredUser().then((hasUser) => {
      if (hasUser) {
        router.push("/login");
      } else {
        setMounted(true);
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await registerUser(formData);
      if (result.success) {
        // Redirecionamento após sucesso
        router.push("/");
        router.refresh();
      } else {
        setError(result.error || "Erro ao realizar cadastro");
      }
    });
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorativo */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
            <UserPlus size={40} className="text-emerald-400" />
          </div>
        </div>
        
        <div className="bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-center mb-2">Criar Conta</h1>
          <p className="text-zinc-400 text-center mb-8 text-sm">Comece a transformar sua vida financeira</p>

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
                  <label className="text-xs font-medium text-zinc-400 ml-1">Senha (mín. 6 caracteres)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                      <Lock size={18} />
                    </div>
                    <input 
                      type="password" 
                      name="password" 
                      required
                      minLength={6}
                      className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm placeholder:text-zinc-600"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isPending}
                  className="w-full h-12 mt-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending ? <Loader2 size={18} className="animate-spin" /> : "Criar Minha Conta"}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-zinc-500">
                Já tem uma conta?{" "}
                <Link href="/login" className="text-white hover:text-emerald-400 transition-colors font-medium">
                  Faça login
                </Link>
              </p>
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
