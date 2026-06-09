"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { useHideValues, maskValue } from "@/lib/use-hide-values";

interface StatCardProps {
  label: string;
  value: string;
  /** Cor de destaque do valor (ex.: "text-income", "text-expense"). */
  valueClassName?: string;
  hint?: string;
  /** Mascara o valor quando o modo privacidade estiver ativo. Padrão: true. */
  sensitive?: boolean;
  className?: string;
  index?: number;
}

export function StatCard({
  label,
  value,
  valueClassName,
  hint,
  sensitive = true,
  className,
  index = 0,
}: StatCardProps) {
  const hidden = useHideValues();
  const shown = sensitive ? maskValue(value, hidden) : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className={cn(
        "flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-foreground/20",
        className
      )}
    >
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{label}</h3>
      <p className={cn("text-3xl font-semibold tabular-nums md:text-4xl", valueClassName)}>{shown}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </motion.div>
  );
}
