import Link from "next/link";
import Image from "next/image";
import { Home, WalletCards, ArrowLeftRight, PieChart, Sparkles, Settings, TrendingUp, User as UserIcon, Repeat, Target, BarChart3, Bot } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import NotificationBell from "@/components/NotificationBell";
import PushManager from "@/components/PushManager";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <div className="min-h-full flex flex-col md:flex-row bg-[var(--color-background)] text-[var(--color-foreground)] relative">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 border-r border-[var(--color-border)] bg-[var(--color-card)] flex-col h-screen sticky top-0">
        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Finanças</h1>
          <NotificationBell />
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <Home size={18} /> Dashboard
          </Link>
          <Link href="/contas" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <WalletCards size={18} /> Contas
          </Link>
          <Link href="/transacoes" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <ArrowLeftRight size={18} /> Transações
          </Link>
          <Link href="/recorrencias" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <Repeat size={18} /> Recorrências
          </Link>
          <Link href="/orcamentos" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <PieChart size={18} /> Orçamentos
          </Link>
          <Link href="/metas" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <Target size={18} /> Metas
          </Link>
          <Link href="/investimentos" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-blue-400">
            <TrendingUp size={18} /> Investimentos
          </Link>
          <Link href="/relatorios" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
            <BarChart3 size={18} /> Relatórios
          </Link>
          <Link href="/insights" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-emerald-400">
            <Sparkles size={18} /> Insights
          </Link>
          <Link href="/assistente" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-purple-400">
            <Bot size={18} /> Assistente IA
          </Link>
        </nav>

        <div className="p-4 border-t border-[var(--color-border)]">
          <Link href="/configuracoes" className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
            {user?.avatarUrl ? (
              <Image src={user.avatarUrl} alt="Avatar" width={40} height={40} unoptimized className="w-10 h-10 rounded-full border border-zinc-800 object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <UserIcon size={18} className="text-zinc-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || "Usuário"}</p>
              <p className="text-xs text-zinc-500 truncate">Configurações</p>
            </div>
            <Settings size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors" />
          </Link>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 p-4 pb-24 md:p-10 md:pb-10 overflow-y-auto">
        {/* Top bar (Mobile) — sino + atalhos para Recorrências e Metas */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Link href="/recorrencias" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-zinc-300 hover:text-white transition-colors">
              <Repeat size={16} /> Recorrências
            </Link>
            <Link href="/metas" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-zinc-300 hover:text-white transition-colors">
              <Target size={16} /> Metas
            </Link>
            <Link href="/assistente" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-purple-400 hover:text-purple-300 transition-colors">
              <Bot size={16} /> IA
            </Link>
          </div>
          <NotificationBell />
        </div>
        <div className="max-w-5xl mx-auto">
          <div className="mb-4 flex justify-end">
            <PushManager />
          </div>
          {children}
        </div>
      </main>

      {/* Bottom Navigation Bar (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-md z-50 flex justify-around items-center p-3">
        <Link href="/" className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors">
          <Home size={20} />
          <span className="text-[10px] mt-1 font-medium">Início</span>
        </Link>
        <Link href="/contas" className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors">
          <WalletCards size={20} />
          <span className="text-[10px] mt-1 font-medium">Contas</span>
        </Link>
        <Link href="/transacoes" className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors">
          <ArrowLeftRight size={20} />
          <span className="text-[10px] mt-1 font-medium">Extrato</span>
        </Link>
        <Link href="/investimentos" className="flex flex-col items-center text-blue-500 hover:text-blue-400 transition-colors">
          <TrendingUp size={20} />
          <span className="text-[10px] mt-1 font-medium">Investir</span>
        </Link>
        <Link href="/configuracoes" className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors">
          {user?.avatarUrl ? (
            <Image src={user.avatarUrl} alt="Avatar" width={20} height={20} unoptimized className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <UserIcon size={20} />
          )}
          <span className="text-[10px] mt-1 font-medium">Perfil</span>
        </Link>
        <Link href="/insights" className="flex flex-col items-center text-emerald-500 hover:text-emerald-400 transition-colors">
          <Sparkles size={20} />
          <span className="text-[10px] mt-1 font-medium">Insights</span>
        </Link>
      </nav>
    </div>
  );
}
