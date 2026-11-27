import { useEffect, useState } from "react";
import { Minimize } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";

export function FullscreenExit({ onExit }: { onExit(): void }) {
  const [preview, setPreview] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setPreview(false), 2500);
    return () => window.clearTimeout(timeout);
  }, []);
  const label = i18n.t("Exit full screen");
  return <div className="fullscreen-exit" data-preview={preview || undefined}>
    <Tooltip>
      <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-keyshortcuts="F11" onClick={onExit} />}>
        <Minimize aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={({ anchor }) => anchor.height}>{label} (F11)</TooltipContent>
    </Tooltip>
  </div>;
}
