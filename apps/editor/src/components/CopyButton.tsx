import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip.tsx";
import { Button } from "./ui/button.tsx";

export function CopyButton({ text, label, preserveSelection = false, iconOnly = false }: { text: string; label: string; preserveSelection?: boolean; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useLayoutEffect(() => { setCopied(false); setFailed(false); }, [text]);
  const button = <Button variant="ghost" size={iconOnly ? "icon-sm" : "sm"} aria-label={label} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); }
    catch { setCopied(false); setFailed(true); }
  }}>{iconOnly ? (copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />) : copied ? t("Copied") : label}</Button>;
  return <span className="code-copy" contentEditable={false} onMouseDown={event => { if (preserveSelection) event.preventDefault(); }} onClick={event => event.stopPropagation()}>
    {iconOnly ? <Tooltip><TooltipTrigger render={button} /><TooltipContent>{copied ? t("Copied") : label}</TooltipContent></Tooltip> : button}
    {iconOnly && copied ? <span className="sr-only" role="status">{t("Copied")}</span> : null}
    {failed ? <span role="alert">{t("Clipboard access is unavailable. Select the plaintext and copy it manually.")}</span> : null}
  </span>;
}
