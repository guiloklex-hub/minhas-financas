"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";

/** Chave pública VAPID exposta ao client (vazia = push desabilitado). */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PushState = "idle" | "subscribing" | "subscribed" | "denied" | "error";

/** Converte uma string base64url (chave VAPID) em Uint8Array para `applicationServerKey`.
 * Usa um `ArrayBuffer` explícito para satisfazer o tipo `BufferSource` esperado.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Corpo enviado para `POST /api/push/subscribe` (subset do PushSubscription). */
type SubscribeBody = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/** Extrai endpoint + chaves de uma PushSubscription do browser em formato serializável. */
function toSubscribeBody(subscription: PushSubscription): SubscribeBody | null {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Registra o service worker no mount e oferece um botão discreto para ativar
 * notificações push. Esconde-se por completo quando não há suporte do browser
 * ou quando a chave VAPID não está configurada.
 */
export default function PushManager() {
  // Detecção de suporte feita no init (componente é client-only) para evitar
  // setState síncrono dentro do efeito.
  const [supported] = useState(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
  );
  const [state, setState] = useState<PushState>("idle");

  // Registra o SW e detecta o estado de inscrição atual (assíncrono).
  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        if (cancelled) return;
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled && existing) {
          setState("subscribed");
        }
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const handleSubscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setState("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "idle");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const body = toSubscribeBody(subscription);
      if (!body) {
        setState("error");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setState(res.ok ? "subscribed" : "error");
    } catch {
      setState("error");
    }
  }, []);

  // Push desabilitado (sem chave) ou browser sem suporte: não renderiza nada.
  if (!VAPID_PUBLIC_KEY || !supported) return null;

  if (state === "subscribed") {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400"
        role="status"
      >
        <BellRing size={14} />
        Notificações ativas
      </div>
    );
  }

  const isSubscribing = state === "subscribing";
  const isDenied = state === "denied";

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={isSubscribing || isDenied}
      title={
        isDenied
          ? "Permissão de notificações bloqueada no navegador"
          : "Ativar notificações push"
      }
      className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs text-foreground/80 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSubscribing ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Bell size={14} />
      )}
      {isDenied ? "Notificações bloqueadas" : "Ativar notificações"}
    </button>
  );
}
