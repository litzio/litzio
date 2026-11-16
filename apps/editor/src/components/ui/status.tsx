import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
export function Status({tone = "neutral", label, variant = "pill", hideIndicator = false}: {tone: "ok" | "progress" | "warning" | "error" | "neutral"; label: ReactNode; variant?: "pill" | "plain"; hideIndicator?: boolean}) {
  return <span className="screen-status" data-tone={tone} data-variant={variant}>{!hideIndicator && <span aria-hidden="true">{tone === "progress" && <LoaderCircle strokeWidth={3} className="motion-safe:animate-spin" />}</span>}{label}</span>;
}
