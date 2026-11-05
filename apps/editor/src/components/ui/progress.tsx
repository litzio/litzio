import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Determinate progress using the same surface/accent tokens as bundled controls. */
export function Progress({ value, max = 100, className, ...props }: Omit<ComponentProps<"div">, "children"> & { value: number; max?: number }) {
  const maximum = Number.isFinite(max) && max > 0 ? max : 100;
  const current = Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : 0;
  return <div {...props} role="progressbar" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={current}
    className={cn("h-[var(--space-2)] w-full min-w-0 overflow-hidden rounded-md bg-muted", className)}>
    <div className="h-full bg-primary" style={{ width: `${current / maximum * 100}%` }} />
  </div>;
}
