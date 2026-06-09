import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Label = forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-muted", className)}
      {...props}
    />
  )
);
Label.displayName = "Label";
