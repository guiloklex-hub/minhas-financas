"use client"

import { useState, useTransition } from "react"
import { changePassword } from "@/actions/profile"
import { Loader2, Lock } from "lucide-react"

export default function SecurityFormClient() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    startTransition(async () => {
      const result = await changePassword(formData);
      if (result.success) {
        setMessage({ text: result.message || "Senha alterada com sucesso!", type: "success" });
        form.reset();
      } else {
        setMessage({ text: result.error || "Erro ao alterar a senha", type: "error" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message && (
        <div className={`p-3 rounded-xl text-sm font-medium border text-center ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400 ml-1">Senha Atual</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <Lock size={18} />
          </div>
          <input 
            type="password" 
            name="currentPassword" 
            required
            className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm text-white placeholder:text-zinc-600"
            placeholder="••••••••"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400 ml-1">Nova Senha</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <Lock size={18} />
          </div>
          <input 
            type="password" 
            name="newPassword" 
            required
            minLength={6}
            className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm text-white placeholder:text-zinc-600"
            placeholder="Nova senha (mínimo 6 caracteres)"
          />
        </div>
      </div>

      <div className="pt-2">
        <button 
          type="submit" 
          disabled={isPending}
          className="h-11 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : "Alterar Senha"}
        </button>
      </div>
    </form>
  )
}
