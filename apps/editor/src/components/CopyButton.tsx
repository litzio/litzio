import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip.tsx";
import { Button } from "./ui/button.tsx";

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Try the click-initiated browser fallback when permission is denied. */ }
  const active = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  const start = input?.selectionStart, end = input?.selectionEnd, direction = input?.selectionDirection;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;top:0;left:0";
  document.body.append(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard copy failed");
  } finally {
    textarea.remove();
    if (active instanceof HTMLElement) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
    if (input && start != null && end != null) input.setSelectionRange(start, end, direction ?? undefined);
  }
}

export function CopyButton({ text, label, preserveSelection = false, iconOnly = false }: { text: string; label: string; preserveSelection?: boolean; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useLayoutEffect(() => { setCopied(false); setFailed(false); }, [text]);
  const button = <Button variant="ghost" size={iconOnly ? "icon-sm" : "sm"} aria-label={label} onClick={async () => {
    try { await copyText(text); setCopied(true); setFailed(false); }
    catch { setCopied(false); setFailed(true); }
  }}>{iconOnly ? (copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />) : copied ? t("Copied") : label}</Button>;
  return <span className="code-copy" contentEditable={false} onMouseDown={event => { if (preserveSelection) event.preventDefault(); }} onClick={event => event.stopPropagation()}>
    {iconOnly ? <Tooltip><TooltipTrigger render={button} /><TooltipContent>{copied ? t("Copied") : label}</TooltipContent></Tooltip> : button}
    {iconOnly && copied ? <span className="sr-only" role="status">{t("Copied")}</span> : null}
    {failed ? <span role="alert">{t("Clipboard access is unavailable. Select the plaintext and copy it manually.")}</span> : null}
  </span>;
}
