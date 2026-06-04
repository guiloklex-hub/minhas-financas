import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Home, WalletCards, ArrowLeftRight, PieChart, Sparkles, Settings, TrendingUp } from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gerenciador de Finanças",
  description: "Gerencie suas finanças pessoais de forma minimalista.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col md:flex-row bg-[var(--color-background)] text-[var(--color-foreground)] relative">
        {/* Sidebar (Desktop) */}
        <aside className="hidden md:flex w-64 border-r border-[var(--color-border)] bg-[var(--color-card)] flex-col h-screen sticky top-0">
          <div className="p-6 border-b border-[var(--color-border)]">
            <h1 className="text-xl font-bold tracking-tight">Finanças</h1>
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
            <Link href="/orcamentos" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              <PieChart size={18} /> Orçamentos
            </Link>
            <Link href="/investimentos" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-blue-400">
              <TrendingUp size={18} /> Investimentos
            </Link>
            <Link href="/configuracoes/categorias" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              <Settings size={18} /> Configurações
            </Link>
            <Link href="/insights" className="flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-emerald-400">
              <Sparkles size={18} /> Insights
            </Link>
          </nav>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 p-4 pb-24 md:p-10 md:pb-10 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
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
          <Link href="/configuracoes/categorias" className="flex flex-col items-center text-zinc-400 hover:text-white transition-colors">
            <Settings size={20} />
            <span className="text-[10px] mt-1 font-medium">Configs</span>
          </Link>
          <Link href="/insights" className="flex flex-col items-center text-emerald-500 hover:text-emerald-400 transition-colors">
            <Sparkles size={20} />
            <span className="text-[10px] mt-1 font-medium">Insights</span>
          </Link>
        </nav>
      </body>
    </html>
  );
}
