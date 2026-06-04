"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tags, Sparkles } from "lucide-react";

export default function ConfiguracoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    { name: "Categorias", href: "/configuracoes/categorias", icon: Tags },
    { name: "Status IA", href: "/configuracoes/status-ia", icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Configurações</h2>
        <p className="text-zinc-400 mt-1">Gerencie suas categorias e as configurações do sistema.</p>
      </div>

      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`
                  flex items-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${isActive 
                    ? "border-emerald-500 text-emerald-500" 
                    : "border-transparent text-zinc-400 hover:text-zinc-300 hover:border-zinc-700"}
                `}
              >
                <Icon size={16} />
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="pt-4">
        {children}
      </div>
    </div>
  );
}
