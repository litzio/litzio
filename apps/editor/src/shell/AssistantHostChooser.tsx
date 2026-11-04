import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hostRegistry, hostLabel } from "../host-client.ts";
import { i18n } from "../i18n.ts";
import { HostStatus } from "../components/HostStatus.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";

export function AssistantHostChooser({ onChoose, onClose }: { onChoose(hostId: string): void; onClose(): void }) {
  useTranslation();
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  const states = hostRegistry.list().map(host => hostRegistry.get(host.hostId).state).join(",");
  const hosts = hostRegistry.list();
  const available = hosts.filter(host => hostRegistry.get(host.hostId).state === "connected");
  // Wait for initial observations before deciding that there is only one available candidate.
  const only = !states.includes("connecting") && available.length === 1 ? available[0]!.hostId : undefined;
  useEffect(() => { if (only) onChoose(only); }, [only, onChoose]);
  if (only) return null;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>{i18n.t("Select Host")}</DialogTitle></DialogHeader>
      {hosts.map(host => {
        const state = hostRegistry.get(host.hostId).state;
        const disabled = state !== "connected";
        const row = <Button className="host-choice-row" variant="secondary" disabled={disabled} onClick={() => onChoose(host.hostId)}>
          <span className="sidebar-tree-name">{hostLabel(host.hostId)}</span><HostStatus runtime={hostRegistry.get(host.hostId)} showDetails={false} compact />
        </Button>;
        return disabled ? <Tooltip key={host.hostId}>
          <TooltipTrigger render={<span className="host-choice-trigger" tabIndex={0} />}>
            {row}
          </TooltipTrigger>
          <TooltipContent>{i18n.t(state === "connecting" ? "Wait for the Host connection before starting a conversation." : "This Host is unreachable. A new conversation cannot be started.")}</TooltipContent>
        </Tooltip> : <span className="host-choice-trigger" key={host.hostId}>{row}</span>;
      })}
    </DialogContent>
  </Dialog>;
}
