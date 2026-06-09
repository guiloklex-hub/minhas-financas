"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2, Trash2, ExternalLink, Inbox } from "lucide-react";

type NotificationType = "INFO" | "WARNING" | "SUCCESS" | "DANGER";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  type: NotificationType;
  read: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const TYPE_DOT: Record<NotificationType, string> = {
  INFO: "bg-blue-400",
  WARNING: "bg-amber-400",
  SUCCESS: "bg-emerald-400",
  DANGER: "bg-red-500",
};

const TYPE_RING: Record<NotificationType, string> = {
  INFO: "border-l-blue-400",
  WARNING: "border-l-amber-400",
  SUCCESS: "border-l-emerald-400",
  DANGER: "border-l-red-500",
};

/** Formata a diferença de tempo em pt-BR de forma compacta (ex.: "5min", "2h", "3d"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mês`;
  return `${Math.floor(days / 365)}a`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const applyData = useCallback((data: NotificationsResponse) => {
    setItems(data.notifications);
    setUnreadCount(data.unreadCount);
  }, []);

  const fetchNotifications = useCallback(() => {
    // setState vive dentro do callback do .then() (e não no caminho síncrono),
    // espelhando o padrão de fetch-on-mount já usado no projeto e evitando o
    // alerta react-hooks/set-state-in-effect.
    return fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<NotificationsResponse>) : null))
      .then((data) => {
        if (data) applyData(data);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [applyData]);

  // Busca a contagem (e a lista) ao montar.
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Fecha o painel ao clicar fora ou pressionar Esc.
  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) void fetchNotifications();
      return next;
    });
  }, [fetchNotifications]);

  const markOneRead = useCallback(async (id: string) => {
    // Atualização otimista. Os updaters de estado permanecem puros (sem chamar
    // outro setState dentro deles); o ajuste de contagem usa o updater funcional
    // do próprio contador, calculando o delta a partir do item atual.
    setUnreadCount((c) =>
      items.some((n) => n.id === id && !n.read) ? Math.max(0, c - 1) : c
    );
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // Em caso de falha, ressincroniza.
      void fetchNotifications();
    }
  }, [items, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", { method: "PATCH" });
    } catch {
      void fetchNotifications();
    }
  }, [fetchNotifications]);

  const remove = useCallback(async (id: string) => {
    setUnreadCount((c) =>
      items.some((n) => n.id === id && !n.read) ? Math.max(0, c - 1) : c
    );
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    } catch {
      void fetchNotifications();
    }
  }, [items, fetchNotifications]);

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificações"
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white h-[18px]">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={14} /> Marcar todas
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
                <Loader2 size={16} className="animate-spin" /> Carregando…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
                <Inbox size={22} className="text-muted" />
                Nenhuma notificação
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`group relative border-l-2 ${TYPE_RING[n.type]} px-4 py-3 transition-colors hover:bg-accent ${
                      n.read ? "opacity-70" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[n.type]} ${
                          n.read ? "opacity-30" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-muted">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted break-words">{n.body}</p>

                        <div className="mt-2 flex items-center gap-3">
                          {n.url && (
                            <Link
                              href={n.url}
                              onClick={() => {
                                void markOneRead(n.id);
                                setOpen(false);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
                            >
                              <ExternalLink size={12} /> Abrir
                            </Link>
                          )}
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => void markOneRead(n.id)}
                              className="text-[11px] font-medium text-muted hover:text-foreground"
                            >
                              Marcar como lida
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void remove(n.id)}
                            aria-label="Remover notificação"
                            className="ml-auto text-muted transition-colors hover:text-red-400"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
