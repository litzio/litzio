import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../components/CopyButton.tsx";
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
  </div>;
}
