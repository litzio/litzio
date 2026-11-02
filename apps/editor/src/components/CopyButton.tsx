import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button.tsx";

export function CopyButton({ text, label, preserveSelection = false }: { text: string; label: string; preserveSelection?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useLayoutEffect(() => { setCopied(false); setFailed(false); }, [text]);
  return <span className="code-copy" contentEditable={false} onMouseDown={event => { if (preserveSelection) event.preventDefault(); }} onClick={event => event.stopPropagation()}>
    <Button variant="ghost" size="sm" aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); }
      catch { setCopied(false); setFailed(true); }
    }}>{copied ? t("Copied") : label}</Button>
    {failed ? <span role="alert">{t("Clipboard access is unavailable. Select the plaintext and copy it manually.")}</span> : null}
  </span>;
}
