"use client"

import { useState, useTransition } from "react"
import { changePassword } from "@/actions/profile"
import { startTwoFactorSetup, confirmTwoFactor, disableTwoFactor } from "@/actions/security"
import { Loader2, Lock, ShieldCheck, ShieldOff, KeyRound } from "lucide-react"
import Image from "next/image"

type Feedback = { text: string; type: "success" | "error" } | null;

export default function SecurityFormClient({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  // ── Troca de senha ──────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Feedback>(null);

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

  // ── 2FA ─────────────────────────────────────────────────────────────────────
  const [enabled, setEnabled] = useState(twoFactorEnabled);
  const [twoFaPending, startTwoFaTransition] = useTransition();
  const [twoFaMessage, setTwoFaMessage] = useState<Feedback>(null);

  // Estado de setup (ativação)
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [confirmToken, setConfirmToken] = useState("");

  // Estado de desativação
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  function beginSetup() {
    setTwoFaMessage(null);
    startTwoFaTransition(async () => {
      const result = await startTwoFactorSetup();
      if (result.success && result.secret && result.qrDataUrl) {
        setSetup({ secret: result.secret, qrDataUrl: result.qrDataUrl });
      } else {
        setTwoFaMessage({ text: result.error || "Erro ao iniciar a configuração.", type: "error" });
      }
    });
  }

  function confirmSetup() {
    if (!setup) return;
    setTwoFaMessage(null);
    startTwoFaTransition(async () => {
      const result = await confirmTwoFactor(setup.secret, confirmToken);
      if (result.success) {
        setEnabled(true);
        setSetup(null);
        setConfirmToken("");
        setTwoFaMessage({ text: result.message || "2FA ativado!", type: "success" });
      } else {
        setTwoFaMessage({ text: result.error || "Código inválido.", type: "error" });
      }
    });
  }

  function confirmDisable() {
    setTwoFaMessage(null);
    startTwoFaTransition(async () => {
      const result = await disableTwoFactor(disablePassword);
      if (result.success) {
        setEnabled(false);
        setShowDisable(false);
        setDisablePassword("");
        setTwoFaMessage({ text: result.message || "2FA desativado.", type: "success" });
      } else {
        setTwoFaMessage({ text: result.error || "Erro ao desativar.", type: "error" });
      }
    });
  }

  const inputClass =
    "w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm text-foreground placeholder:text-muted";

  return (
    <div className="space-y-10">
      {/* Troca de senha */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {message && (
          <div className={`p-3 rounded-xl text-sm font-medium border text-center ${message.type === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted ml-1">Senha Atual</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <Lock size={18} />
            </div>
            <input type="password" name="currentPassword" required className={inputClass} placeholder="••••••••" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted ml-1">Nova Senha</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <Lock size={18} />
            </div>
            <input type="password" name="newPassword" required minLength={6} className={inputClass} placeholder="Nova senha (mínimo 6 caracteres)" />
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

      {/* Divisor */}
      <div className="border-t border-border" />

      {/* 2FA */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-muted"}`}>
            {enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Verificação em duas etapas (2FA)</h4>
            <p className="text-xs text-muted">
              {enabled
                ? "Ativada. Um código do app autenticador será exigido no login."
                : "Adicione uma camada extra de segurança usando um app autenticador (Google Authenticator, Authy, etc.)."}
            </p>
          </div>
        </div>

        {twoFaMessage && (
          <div className={`p-3 rounded-xl text-sm font-medium border text-center ${twoFaMessage.type === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
            {twoFaMessage.text}
          </div>
        )}

        {/* Ativada → botão desativar */}
        {enabled && !showDisable && (
          <button
            type="button"
            onClick={() => { setShowDisable(true); setTwoFaMessage(null); }}
            disabled={twoFaPending}
            className="h-11 px-6 bg-rose-600/90 text-white font-medium rounded-xl hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <ShieldOff size={16} /> Desativar 2FA
          </button>
        )}

        {/* Fluxo de desativação: pede senha */}
        {enabled && showDisable && (
          <div className="space-y-3 bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted">Confirme sua senha para desativar a verificação em duas etapas.</p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                <Lock size={18} />
              </div>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className={inputClass}
                placeholder="Sua senha atual"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmDisable}
                disabled={twoFaPending || !disablePassword}
                className="h-10 px-5 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {twoFaPending ? <Loader2 size={16} className="animate-spin" /> : "Confirmar desativação"}
              </button>
              <button
                type="button"
                onClick={() => { setShowDisable(false); setDisablePassword(""); }}
                className="h-10 px-5 bg-zinc-800 text-foreground/80 text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Desativada → botão ativar */}
        {!enabled && !setup && (
          <button
            type="button"
            onClick={beginSetup}
            disabled={twoFaPending}
            className="h-11 px-6 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {twoFaPending ? <Loader2 size={16} className="animate-spin" /> : <><ShieldCheck size={16} /> Ativar 2FA</>}
          </button>
        )}

        {/* Fluxo de ativação: QR + confirmar */}
        {!enabled && setup && (
          <div className="space-y-4 bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-muted">
              1. Escaneie o QR Code com seu app autenticador (ou insira o segredo manualmente).
            </p>
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white p-2 rounded-xl">
                <Image src={setup.qrDataUrl} alt="QR Code 2FA" width={180} height={180} unoptimized />
              </div>
              <code className="text-[11px] text-muted break-all text-center select-all">{setup.secret}</code>
            </div>
            <p className="text-xs text-muted">2. Digite o código de 6 dígitos gerado para confirmar.</p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                <KeyRound size={18} />
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} tracking-[0.4em]`}
                placeholder="000000"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmSetup}
                disabled={twoFaPending || confirmToken.length !== 6}
                className="h-10 px-5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {twoFaPending ? <Loader2 size={16} className="animate-spin" /> : "Confirmar e ativar"}
              </button>
              <button
                type="button"
                onClick={() => { setSetup(null); setConfirmToken(""); setTwoFaMessage(null); }}
                className="h-10 px-5 bg-zinc-800 text-foreground/80 text-sm font-medium rounded-xl hover:bg-zinc-700 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
