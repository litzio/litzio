import { Info } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { i18n } from "../i18n.ts";

/** Shared scope and resource limits for Save and recovery comparison. */
export default function ComparisonInfo({ recovery = false }: { recovery?: boolean }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("About this comparison")} />}><Info /></TooltipTrigger>
    <TooltipContent><div className="grid gap-2">
      <p>{i18n.t(recovery
        ? "Read-only preview of the last recorded applied content. Comparison does not restore or save it."
        : "Read-only preview of applied content. Unapplied drafts are excluded. Close to keep editing.")}</p>
      <p>{i18n.t("Visual compares block meaning. Formatting-only source changes appear in Source.")}</p>
      <p>{i18n.t("Images use current Host files. Historical image bytes are not preserved; past appearance cannot be verified.")}</p>
      <p>{i18n.t("Bibliography uses the current Host resource context. Historical .bib contents are not preserved.")}</p>
    </div></TooltipContent>
  </Tooltip>;
}
