"use client";

import { useState, useTransition } from "react";
import { createCategory, deleteCategory, updateCategory, reorderCategories } from "@/actions/categories";
import { Plus, Trash2, Tag, Loader2, Pencil, Check, X, ArrowUp, ArrowDown } from "lucide-react";
import { Category } from "@/generated/prisma/client";

export default function CategoryListClient({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#10b981");
  const [editIcon, setEditIcon] = useState("");

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta categoria?")) return;

    setLoadingId(id);
    setError("");
    const res = await deleteCategory(id);

    if (res.success) {
      setCategories(prev => {
        const newCats = prev.filter(c => c.id !== id);
        const newTotalPages = Math.ceil(newCats.length / itemsPerPage) || 1;
        if (currentPage > newTotalPages) setCurrentPage(newTotalPages);
        return newCats;
      });
    } else {
      setError(res.error || "Erro ao excluir.");
    }
    setLoadingId(null);
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const target = e.currentTarget;
    startTransition(async () => {
      const res = await createCategory(formData);

      if (res.success && res.data) {
        setCategories(prev => {
          const newCats = [...prev, res.data as Category].sort((a, b) => a.name.localeCompare(b.name));
          return newCats;
        });
        target.reset();
      } else {
        setError(res.error || "Erro ao criar.");
      }
    });
  }

  function startEdit(cat: Category) {
    setEditError("");
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color && /^#[0-9a-fA-F]{6}$/.test(cat.color) ? cat.color : "#10b981");
    setEditIcon(cat.icon ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  function handleUpdate(id: string) {
    setEditError("");

    const formData = new FormData();
    formData.append("name", editName);
    formData.append("color", editColor);
    formData.append("icon", editIcon);

    startEditTransition(async () => {
      const res = await updateCategory(id, formData);

      if (res.success && res.data) {
        const updated = res.data as Category;
        setCategories(prev => prev.map(c => (c.id === id ? updated : c)));
        setEditingId(null);
      } else {
        setEditError(res.error || "Erro ao atualizar.");
      }
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const previous = categories;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setCategories(reordered);
    setError("");
    setReorderingId(reordered[target].id);

    startTransition(async () => {
      const res = await reorderCategories(reordered.map(c => c.id));
      if (!res.success) {
        setCategories(previous);
        setError(res.error || "Erro ao reordenar.");
      }
      setReorderingId(null);
    });
  }

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const totalPages = Math.ceil(categories.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentCategories = categories.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">Nova Categoria</h3>
        <form onSubmit={handleCreate} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted mb-1">Nome da Categoria</label>
            <input
              name="name"
              required
              placeholder="Ex: Mercado"
              className="w-full bg-background border border-border rounded-lg p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-muted mb-1">Cor</label>
            <input
              name="color"
              type="color"
              defaultValue="#10b981"
              className="w-full h-[42px] bg-background border border-border rounded-lg cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="h-[42px] px-6 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </form>
        {error && <p className="text-rose-500 text-sm mt-3">{error}</p>}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-accent border-b border-border uppercase text-muted">
            <tr>
              <th className="px-6 py-4 font-medium w-20">Ordem</th>
              <th className="px-6 py-4 font-medium">Categoria</th>
              <th className="px-6 py-4 font-medium w-40">Cor</th>
              <th className="px-6 py-4 font-medium w-32 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {currentCategories.map((cat, i) => {
              const absoluteIndex = startIndex + i;
              const isEditing = editingId === cat.id;
              return (
                <tr key={cat.id} className="hover:bg-accent transition-colors align-middle">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMove(absoluteIndex, -1)}
                        disabled={absoluteIndex === 0 || isPending || isEditing}
                        title="Mover para cima"
                        className="p-1.5 text-muted hover:text-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        {reorderingId === cat.id ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
                      </button>
                      <button
                        onClick={() => handleMove(absoluteIndex, 1)}
                        disabled={absoluteIndex === categories.length - 1 || isPending || isEditing}
                        title="Mover para baixo"
                        className="p-1.5 text-muted hover:text-foreground hover:bg-accent rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </td>

                  {isEditing ? (
                    <>
                      <td className="px-6 py-4">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          placeholder="Nome"
                          className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <input
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            type="color"
                            className="h-9 w-12 bg-background border border-border rounded-lg cursor-pointer"
                          />
                          <input
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            placeholder="Ícone (ex: 🛒)"
                            className="w-24 bg-background border border-border rounded-lg p-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleUpdate(cat.id)}
                            disabled={isEditPending}
                            title="Salvar"
                            className="p-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isEditPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isEditPending}
                            title="Cancelar"
                            className="p-2 text-muted hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 font-medium text-foreground">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800 text-sm" style={{ color: cat.color || '#fff' }}>
                            {cat.icon ? <span>{cat.icon}</span> : <Tag size={14} />}
                          </div>
                          {cat.name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#52525b' }} />
                          <span className="text-muted font-mono text-xs">{cat.color || '#52525b'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(cat)}
                            disabled={loadingId === cat.id || isPending}
                            title="Editar"
                            className="p-2 text-muted hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            disabled={loadingId === cat.id || isPending}
                            title="Excluir"
                            className="p-2 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {loadingId === cat.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted">Nenhuma categoria cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
        {editError && <p className="text-rose-500 text-sm px-6 py-3 border-t border-border">{editError}</p>}
        {categories.length > itemsPerPage && (
          <div className="p-3 border-t border-border flex items-center justify-between bg-accent/40">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-3 py-1.5 rounded-md text-xs bg-accent border border-white/10 text-foreground disabled:opacity-50 hover:bg-accent transition-colors"
            >
              Anterior
            </button>
            <span className="text-xs text-muted font-medium">
              {currentPage} de {totalPages}
            </span>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-3 py-1.5 rounded-md text-xs bg-accent border border-white/10 text-foreground disabled:opacity-50 hover:bg-accent transition-colors"
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
