import NotificationBell from "@/components/NotificationBell";
import PushManager from "@/components/PushManager";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HideValuesToggle } from "@/components/ui/hide-values-toggle";

/**
 * Barra de ações no topo do conteúdo (sticky). Consolida sino, push, tema e
 * privacidade num só lugar — evita o botão flutuante/cortado anterior.
 * O título da identidade no mobile fica aqui; no desktop a sidebar já o exibe.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-6 flex items-center justify-between gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:-mx-10 md:px-10">
      <h1 className="text-lg font-bold tracking-tight md:hidden">Finanças</h1>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2">
        <PushManager />
        <HideValuesToggle />
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}
