import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent text-foreground/70",
        success: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
        danger: "bg-rose-500/10 text-rose-500 border border-rose-500/20",
        warning: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
        info: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
