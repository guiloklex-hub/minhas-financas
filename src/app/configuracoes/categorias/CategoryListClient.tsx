"use client";

import { useState } from "react";
import { createCategory, deleteCategory } from "@/actions/categories";
import { Plus, Trash2, Tag, Loader2 } from "lucide-react";
import { Category } from "@prisma/client";

export default function CategoryListClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;
    
    setLoadingId(id);
    setError("");
    const res = await deleteCategory(id);
    
    if (res.success) {
      setCategories(prev => prev.filter(c => c.id !== id));
    } else {
      setError(res.error || "Erro ao excluir.");
    }
    setLoadingId(null);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsCreating(true);
    setError("");
    
    const formData = new FormData(e.currentTarget);
    const res = await createCategory(formData);
    
    if (res.success && res.data) {
      setCategories(prev => [...prev, res.data as Category].sort((a, b) => a.name.localeCompare(b.name)));
      (e.target as HTMLFormElement).reset();
    } else {
      setError(res.error || "Erro ao criar.");
    }
    setIsCreating(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Nova Categoria</h3>
        <form onSubmit={handleCreate} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Nome da Categoria</label>
            <input 
              name="name" 
              required 
              placeholder="Ex: Mercado" 
              className="w-full bg-black/40 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Cor</label>
            <input 
              name="color" 
              type="color"
              defaultValue="#10b981"
              className="w-full h-[42px] bg-black/40 border border-zinc-800 rounded-lg cursor-pointer"
            />
          </div>
          <button 
            type="submit" 
            disabled={isCreating}
            className="h-[42px] px-6 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2"
          >
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </form>
        {error && <p className="text-rose-500 text-sm mt-3">{error}</p>}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-zinc-800 uppercase text-white/60">
            <tr>
              <th className="px-6 py-4 font-medium">Categoria</th>
              <th className="px-6 py-4 font-medium w-32">Cor</th>
              <th className="px-6 py-4 font-medium w-24 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800" style={{ color: cat.color || '#fff' }}>
                    <Tag size={14} />
                  </div>
                  {cat.name}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#52525b' }} />
                    <span className="text-zinc-400 font-mono text-xs">{cat.color || '#52525b'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => handleDelete(cat.id)}
                    disabled={loadingId === cat.id}
                    className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingId === cat.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">Nenhuma categoria cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
