"use client";

import { useRef, useState, useTransition } from "react";
import { restoreBackup } from "@/actions/backup";
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";

export default function BackupClient() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleRestore(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setMessage({ text: "Selecione um arquivo de backup (.json).", type: "error" });
      return;
    }

    const confirmed = window.confirm(
      "ATENÇÃO: restaurar um backup APAGA TODOS os dados atuais (contas, categorias, " +
        "transações, orçamentos, investimentos, recorrências e metas) e os substitui pelo " +
        "conteúdo do arquivo. Esta ação é irreversível. Deseja continuar?"
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await restoreBackup(formData);
      if (result.success) {
        setMessage({ text: result.message || "Backup restaurado com sucesso!", type: "success" });
        formRef.current?.reset();
      } else {
        setMessage({ text: result.error || "Erro ao restaurar o backup.", type: "error" });
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {message && (
        <div
          className={`p-3 rounded-xl text-sm font-medium border text-center ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Exportar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white">Baixar backup</h3>
          <p className="text-sm text-zinc-400 mt-1">
            Exporta todos os seus dados (contas, categorias, transações, orçamentos, investimentos,
            recorrências e metas) em um único arquivo JSON.
          </p>
        </div>

        <a
          href="/api/backup"
          download="backup.json"
          className="inline-flex h-11 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 transition-all items-center justify-center gap-2"
        >
          <Download size={18} />
          Baixar backup
        </a>
      </div>

      {/* Restaurar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-8">
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white">Restaurar backup</h3>
          <p className="text-sm text-zinc-400 mt-1">
            Selecione um arquivo de backup (.json) gerado por esta tela para restaurar seus dados.
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm">
            <strong>Ação destrutiva.</strong> Restaurar um backup APAGA todos os dados atuais e os
            substitui pelo conteúdo do arquivo. Esta operação não pode ser desfeita.
          </p>
        </div>

        <form ref={formRef} onSubmit={handleRestore} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="backupFile" className="text-xs font-medium text-zinc-400 ml-1">
              Arquivo de backup (.json)
            </label>
            <input
              required
              id="backupFile"
              type="file"
              name="file"
              accept="application/json,.json"
              className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="h-11 px-6 bg-rose-600 text-white font-medium rounded-xl hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Upload size={18} />
                Restaurar backup
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
