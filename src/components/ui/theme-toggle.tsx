"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Alterna entre tema claro e escuro. Os ícones trocam via CSS (`dark:`), o que
 * evita mismatch de hidratação sem precisar de estado `mounted`.
 */
export function ThemeToggle() {
  const { setTheme } = useTheme();

  const toggle = () => {
    const isDark =
      typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted transition-colors hover:bg-accent hover:text-foreground"
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema"
    >
      <Moon size={18} className="block dark:hidden" />
      <Sun size={18} className="hidden dark:block" />
    </button>
  );
}
