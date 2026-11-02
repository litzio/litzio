import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { renderAssistantMarkdown } from "../plain-markdown.ts";
import { openExternalLink } from "../link-opening.ts";

export function AssistantAnswer({ source }: { source: string }) {
  const { t } = useTranslation();
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const html = useMemo(() => renderAssistantMarkdown(source, scope), [source, scope]);
  const body = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => { setBlocks(Array.from(body.current!.querySelectorAll<HTMLElement>(".code-block"))); }, [html]);
  return <div className="assistant-answer">
    <div ref={body} className="assistant-markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={event => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) Array.from(event.currentTarget.querySelectorAll("[id]")).find(element => element.id === href.slice(1))?.scrollIntoView({ block: "nearest" });
      else openExternalLink(href);
    }} />
    {blocks.map((block, index) => createPortal(<CopyButton text={block.querySelector("code")?.textContent ?? ""} label={t("Copy code")} />, block, String(index)))}
    <CopyButton text={source} label={t("Copy answer")} />
  </div>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  useLayoutEffect(() => { setCopied(false); setFailed(false); }, [text]);
  return <span className="assistant-copy">
    <Button variant="ghost" size="sm" aria-label={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); }
      catch { setCopied(false); setFailed(true); }
    }}>{copied ? t("Copied") : label}</Button>
    {failed ? <span role="alert">{t("Clipboard access is unavailable. Select the plaintext and copy it manually.")}</span> : null}
  </span>;
}
