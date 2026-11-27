import { useEffect, useRef, useState } from "react";
import { Minimize } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";

export function FullscreenExit({ onExit }: { onExit(): void }) {
  const [preview, setPreview] = useState(true);
  const [hintOpen, setHintOpen] = useState(false);
  const exit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      // The tooltip was already open during the preview, so hover/focus may not have emitted an open event.
      setHintOpen(exit.current?.matches(":hover, :focus-visible") ?? false);
      setPreview(false);
    }, 2500);
    return () => window.clearTimeout(timeout);
  }, []);
  const label = i18n.t("Exit full screen");
  return <div className="fullscreen-exit" data-preview={preview || undefined}>
    <Tooltip open={preview || hintOpen} onOpenChange={(open, details) => {
      if (preview && details.reason === "escape-key") details.allowPropagation();
      setHintOpen(open);
    }}>
      <TooltipTrigger render={<Button ref={exit} type="button" variant="ghost" size="icon-sm" aria-label={label} aria-keyshortcuts="F11" onClick={onExit} />}>
        <Minimize aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={({ anchor }) => anchor.height}>{label} (F11)</TooltipContent>
    </Tooltip>
  </div>;
}
