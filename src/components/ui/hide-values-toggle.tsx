"use client";

import { Eye, EyeOff } from "lucide-react";
import { useHideValues, toggleHideValues } from "@/lib/use-hide-values";

/** Botão de privacidade: oculta/exibe valores monetários nas telas. */
export function HideValuesToggle() {
  const hidden = useHideValues();
  return (
    <button
      type="button"
      onClick={toggleHideValues}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted transition-colors hover:bg-accent hover:text-foreground"
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      aria-pressed={hidden}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
    >
      {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
