import Link from "next/link";
import Image from "next/image";
import { Settings, User as UserIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import NotificationBell from "@/components/NotificationBell";
import PushManager from "@/components/PushManager";
import MobileNav from "@/components/MobileNav";
import { NAV_ITEMS, SETTINGS_ITEM } from "@/components/nav-config";

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
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-md hover:bg-white/10 transition-colors ${item.accent ?? ""}`}
              >
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[var(--color-border)]">
          <Link href={SETTINGS_ITEM.href} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group">
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
        {/* Top bar (Mobile) — identidade + notificações */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold tracking-tight">Finanças</h1>
          <NotificationBell />
        </div>
        <div className="max-w-5xl mx-auto">
          <div className="mb-4 flex justify-end">
            <PushManager />
          </div>
          {children}
        </div>
      </main>

      {/* Navegação Mobile (barra inferior + drawer com todos os destinos) */}
      <MobileNav userName={user?.name || "Usuário"} avatarUrl={user?.avatarUrl ?? null} />
    </div>
  );
}
