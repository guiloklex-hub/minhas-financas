import type { LucideIcon } from "lucide-react";
import {
  Home,
  WalletCards,
  CreditCard,
  ArrowLeftRight,
  Repeat,
  PieChart,
  Target,
  TrendingUp,
  BarChart3,
  Sparkles,
  Bot,
  Settings,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** Rótulo completo (sidebar desktop + drawer mobile). */
  label: string;
  /** Rótulo curto para a barra inferior do mobile; cai em `label` se ausente. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Classe Tailwind de cor de destaque (ex.: "text-blue-400"), opcional. */
  accent?: string;
};

/**
 * Fonte única de verdade da navegação. Desktop (sidebar) e mobile (barra
 * inferior + drawer) consomem esta mesma lista para nunca divergirem.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Início", icon: Home },
  { href: "/contas", label: "Contas", icon: WalletCards },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/transacoes", label: "Transações", shortLabel: "Extrato", icon: ArrowLeftRight },
  { href: "/recorrencias", label: "Recorrências", icon: Repeat },
  { href: "/orcamentos", label: "Orçamentos", icon: PieChart },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/investimentos", label: "Investimentos", shortLabel: "Investir", icon: TrendingUp, accent: "text-blue-400" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/insights", label: "Insights", icon: Sparkles, accent: "text-emerald-400" },
  { href: "/assistente", label: "Assistente IA", shortLabel: "IA", icon: Bot, accent: "text-purple-400" },
];

/** Configurações vive separada (rodapé da sidebar / do drawer, junto ao perfil). */
export const SETTINGS_ITEM: NavItem = { href: "/configuracoes", label: "Configurações", icon: Settings };

/**
 * Hrefs fixos como atalho na barra inferior do mobile (núcleo do dia a dia).
 * Os demais destinos ficam acessíveis pelo botão "Menu" → drawer.
 */
export const PRIMARY_MOBILE_HREFS = ["/", "/contas", "/transacoes", "/cartoes"];

/** Marca um item como ativo considerando subrotas (ex.: /contas/[id]). */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
