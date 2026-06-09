import Link from "next/link";
import { Activity, ArrowUpRight, ChevronRight } from "lucide-react";
import type { Anomaly } from "@/lib/anomaly";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/**
 * Lista categorias com gasto fora do padrão no mês. Cada item liga para
 * /transacoes?categoryId=... (drill-down). Componente puramente apresentacional:
 * os números chegam já calculados em código (lib/anomaly.ts).
 */
export function AnomaliesCard({ anomalies }: { anomalies: Anomaly[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Activity className="text-amber-500" /> Gastos Fora do Padrão
      </h3>

      {anomalies.length === 0 ? (
        <div className="p-5 rounded-xl border border-border bg-card text-muted text-sm">
          Nenhuma categoria apresentou gasto anômalo neste mês. Continue assim!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anomalies.map((a) => (
            <Link
              key={a.categoryId}
              href={`/transacoes?categoryId=${a.categoryId}`}
              className="group p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors flex flex-col gap-3"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: a.color || "#f59e0b" }}
                  />
                  {a.name}
                </span>
                <span className="text-sm font-bold text-amber-400 flex items-center gap-1">
                  <ArrowUpRight size={16} />
                  +{a.deltaPct.toFixed(0)}%
                </span>
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xs text-muted">Este mês</div>
                  <div className="text-lg font-bold text-foreground">{formatCurrency(a.currentAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">Média recente</div>
                  <div className="text-sm font-medium text-muted">{formatCurrency(a.average)}</div>
                </div>
              </div>

              <div className="text-xs text-amber-400/80 flex items-center gap-1 group-hover:text-amber-300 transition-colors">
                Ver transações <ChevronRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
