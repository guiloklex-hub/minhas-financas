import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

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
      <body className="min-h-full flex flex-col md:flex-row bg-[var(--color-background)] text-[var(--color-foreground)]">
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[var(--color-border)] bg-[var(--color-card)] flex flex-col">
          <div className="p-6 border-b border-[var(--color-border)]">
            <h1 className="text-xl font-bold tracking-tight">Finanças</h1>
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <Link href="/" className="block px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              Dashboard
            </Link>
            <Link href="/contas" className="block px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              Contas
            </Link>
            <Link href="/transacoes" className="block px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              Transações
            </Link>
            <Link href="/orcamentos" className="block px-4 py-2 rounded-md hover:bg-white/10 transition-colors">
              Orçamentos
            </Link>
            <Link href="/insights" className="block px-4 py-2 rounded-md hover:bg-white/10 transition-colors text-emerald-400">
              Insights ✨
            </Link>
          </nav>
        </aside>
        
        {/* Main Content */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
