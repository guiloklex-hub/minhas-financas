"use client"

import { useState, useTransition } from "react"
import { updateProfile } from "@/actions/profile"
import { Loader2, User, Link as LinkIcon, Mail } from "lucide-react"

export default function ProfileFormClient({ initialName, initialAvatar, email }: { initialName: string, initialAvatar: string, email: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result.success) {
        setMessage({ text: result.message || "Perfil salvo!", type: "success" });
      } else {
        setMessage({ text: result.error || "Erro ao salvar", type: "error" });
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

      {/* Exibição do E-mail (Somente leitura) */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400 ml-1">E-mail (Login)</label>
        <div className="relative opacity-60 cursor-not-allowed">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <Mail size={18} />
          </div>
          <input 
            type="email" 
            disabled
            value={email}
            className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none text-sm text-zinc-300"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400 ml-1">Nome de Exibição</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <User size={18} />
          </div>
          <input 
            type="text" 
            name="name" 
            defaultValue={initialName}
            className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm text-white placeholder:text-zinc-600"
            placeholder="Como quer ser chamado?"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-400 ml-1">Foto de Perfil (URL da Imagem)</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
            <LinkIcon size={18} />
          </div>
          <input 
            type="url" 
            name="avatarUrl" 
            defaultValue={initialAvatar}
            className="w-full pl-10 pr-4 py-3 bg-black/40 border border-zinc-800 rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm text-white placeholder:text-zinc-600"
            placeholder="https://exemplo.com/minha-foto.png"
          />
        </div>
      </div>

      <div className="pt-2">
        <button 
          type="submit" 
          disabled={isPending}
          className="h-11 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : "Salvar Alterações"}
        </button>
      </div>
    </form>
  )
}
