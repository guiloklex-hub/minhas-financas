"use client"

import { useState } from "react";
import { importTransactionsFromCsv } from "@/actions/importer";
import { Category, Account } from "@prisma/client";

export default function CsvImporter({ categories, accounts }: { categories: Category[], accounts: Account[] }) {
  const [isUploading, setIsUploading] = useState(false);
  const [autoCategorize, setAutoCategorize] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsUploading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    // No modo automático, sobrescreve a categoria pelo marcador especial — o
    // server resolve a categoria de cada linha pelo histórico.
    if (autoCategorize) {
      formData.set("categoryId", "__auto__");
    }
    const result = await importTransactionsFromCsv(formData);

    if (result.success) {
      setMessage({ text: result.message || `${result.count} transações importadas com sucesso!`, type: "success" });
      (e.target as HTMLFormElement).reset();
      setAutoCategorize(false);
    } else {
      setMessage({ text: result.error || "Erro na importação.", type: "error" });
    }

    setIsUploading(false);
  }

  return (
    <form onSubmit={handleImport} className="space-y-4 p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm">
      <h3 className="text-xl font-semibold mb-2 text-white">Importar CSV</h3>
      <p className="text-sm text-zinc-400 mb-4">
        Selecione um arquivo CSV no formato: <code>Data, Título, Valor</code>. Valores positivos serão Receitas, negativos serão Despesas.
      </p>

      {message && (
        <div className={`p-3 text-sm rounded-md ${message.type === "success" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border border-rose-500/20"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="csvFile" className="block text-sm font-medium mb-1 text-zinc-300">Arquivo CSV</label>
          <input 
            required 
            type="file" 
            id="csvFile" 
            name="file" 
            accept=".csv"
            className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 transition-colors" 
          />
        </div>
        <div>
          <label htmlFor="csvAccountId" className="block text-sm font-medium mb-1 text-zinc-300">Conta de Destino</label>
          <select required id="csvAccountId" name="accountId" className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors">
            <option value="">Selecione...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        {!autoCategorize && (
          <div>
            <label htmlFor="csvCategoryId" className="block text-sm font-medium mb-1 text-zinc-300">Categoria Padrão</label>
            <select required id="csvCategoryId" name="categoryId" className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors">
              <option value="">Selecione...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoCategorize}
          onChange={e => setAutoCategorize(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-emerald-600 focus:ring-emerald-500"
        />
        Auto-categorizar pelo histórico
        <span className="text-zinc-500">(usa transações anteriores; sem categoria padrão)</span>
      </label>

      <button
        type="submit" 
        disabled={isUploading}
        className="mt-4 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {isUploading ? "Importando..." : "Importar Arquivo"}
      </button>
    </form>
  );
}
