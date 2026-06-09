"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado global "ocultar valores" (privacidade), persistido em localStorage e
 * compartilhado entre componentes via useSyncExternalStore — sem context.
 * Mascara valores monetários nas telas quando ativo.
 */
const KEY = "mf_hide_values";
const listeners = new Set<() => void>();
let hidden = false;

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

// Inicializa a partir do localStorage no client (uma vez).
if (typeof window !== "undefined") {
  hidden = read();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function toggleHideValues(): void {
  hidden = !hidden;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, hidden ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

/** Retorna o estado atual (reativo) de ocultar valores. */
export function useHideValues(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false
  );
}

/** Mascara um texto monetário já formatado quando `hidden` é true. */
export function maskValue(formatted: string, hidden: boolean): string {
  return hidden ? "••••" : formatted;
}
