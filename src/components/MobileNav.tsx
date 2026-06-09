"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, Settings, User as UserIcon } from "lucide-react";
import {
  NAV_ITEMS,
  SETTINGS_ITEM,
  PRIMARY_MOBILE_HREFS,
  isNavItemActive,
  type NavItem,
} from "./nav-config";

type MobileNavProps = {
  userName: string;
  avatarUrl: string | null;
};

/**
 * Navegação mobile: barra inferior fixa com os atalhos do dia a dia + botão
 * "Menu" que abre um drawer (bottom sheet) com TODOS os destinos — paridade
 * total com a sidebar do desktop.
 */
export default function MobileNav({ userName, avatarUrl }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Trava o scroll do body e fecha com Esc enquanto o drawer está aberto.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const primaryItems: NavItem[] = PRIMARY_MOBILE_HREFS.map(
    (href) => NAV_ITEMS.find((item) => item.href === href)!
  ).filter(Boolean);

  return (
    <>
      {/* Barra de navegação inferior (sempre visível no mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-border bg-background/85 backdrop-blur-md px-1 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {primaryItems.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1 transition-colors ${
                active ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={20} className={active && item.accent ? item.accent : undefined} />
              <span className="text-[10px] font-medium">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1 transition-colors ${
            open ? "text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          <Menu size={20} />
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </nav>

      {/* Drawer (bottom sheet) com todos os destinos */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
        inert={!open}
      >
        {/* Backdrop */}
        <button
          type="button"
          aria-label="Fechar menu"
          tabIndex={open ? 0 : -1}
          onClick={close}
          className={`absolute inset-0 h-full w-full bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Painel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className={`absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-y-0" : "translate-y-full"
          }`}
        >
          {/* Cabeçalho do drawer */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-card)] px-5 pt-3 pb-3">
            <div className="absolute left-1/2 top-1.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-zinc-700" />
            <h2 className="text-base font-semibold text-foreground">Menu</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Fechar"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] text-muted transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          {/* Grade com todos os destinos */}
          <div className="grid grid-cols-3 gap-2 p-4">
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors ${
                    active
                      ? "border-white/20 bg-accent"
                      : "border-transparent hover:border-[var(--color-border)] hover:bg-accent"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-accent ${
                      item.accent ?? "text-foreground"
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <span
                    className={`text-xs font-medium leading-tight ${
                      active ? "text-foreground" : "text-foreground/80"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Rodapé: perfil → Configurações */}
          <div className="border-t border-[var(--color-border)] p-4">
            <Link
              href={SETTINGS_ITEM.href}
              onClick={close}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
                isNavItemActive(pathname, SETTINGS_ITEM.href)
                  ? "border-white/20 bg-accent"
                  : "border-[var(--color-border)] hover:bg-accent"
              }`}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-zinc-800">
                  <UserIcon size={18} className="text-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                <p className="truncate text-xs text-muted">Configurações</p>
              </div>
              <Settings size={16} className="text-muted" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
