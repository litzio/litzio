import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HostRuntime } from "../host-client.ts";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip.tsx";

export type HostStatusProps = {
  /** A read-only observation; this component never connects or selects a Host. */
  runtime?: Pick<HostRuntime, "state" | "failure" | "reason" | "warning">;
  restartRequired?: boolean;
  showDetails?: boolean;
  compact?: boolean;
};

/** Shared Host status for settings and other Host surfaces, independent of the registry. */
export function HostStatus({ runtime, restartRequired = false, showDetails = true, compact = false }: HostStatusProps) {
  const { t } = useTranslation();
  let status: string = t("Connecting"), tone = "warning";
  const detail = runtime?.reason ?? runtime?.warning;
  if (restartRequired) { status = t("Restart required"); tone = "muted"; }
  else if (runtime?.state === "connecting" || !runtime) status = t("Connecting");
  else if (runtime.failure === "protocol-mismatch") { status = t("Protocol mismatch"); tone = "danger"; }
  else if (runtime.state === "disconnected") { status = t("Unreachable"); tone = "danger"; }
  else if (runtime.warning) { status = t("Version warning"); tone = "warning"; }
  else { status = t("Connected"); tone = "connected"; }
  return <span className="host-status" data-tone={tone} data-compact={compact || undefined} role="status">
    <span className="agent-dot" aria-hidden="true" />{status}
    {showDetails && detail ? <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("Connection details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{detail}</TooltipContent></Tooltip> : null}
  </span>;
}
