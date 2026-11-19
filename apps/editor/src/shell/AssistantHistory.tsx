import { useState, type ReactNode } from "react";
import type { AiProvider, AssistantConversationInfo } from "../../shared/assistant.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { i18n } from "../i18n.ts";

export const pathName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path;
export const providerLabel = (provider: AiProvider | undefined) => provider === "copilot" ? "GitHub Copilot" : "Codex";

/** The history list the Assistant panel shows instead of the transcript; the panel owns opening a row. */
export function AssistantHistory({ entries, pending, notices, onResume }: {
  entries: AssistantConversationInfo[]; pending: boolean; notices: ReactNode; onResume(entry: AssistantConversationInfo): void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = entries.filter(entry => !query || entry.title.toLocaleLowerCase().includes(query) ||
    entry.folders.some(folder => pathName(folder).toLocaleLowerCase().includes(query)));
  return <div className="assistant-history">
    <h3 className="type-item-name">{i18n.t("Conversation history")}</h3>
    <Input aria-label={i18n.t("Search conversation history")} className="assistant-history-search" placeholder={i18n.t("Title or folder name")} value={search} disabled={pending} onChange={event => setSearch(event.target.value)} />
    {notices}
    {!matches.length ? <p>{i18n.t(query && entries.length ? "No matching conversations" : "No conversations yet.")}</p> : matches.map(entry => <Button key={entry.id} variant="ghost" disabled={pending} onClick={() => onResume(entry)}>
      <strong className="type-item-name">{entry.title}</strong>
      <span className="type-helper"><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</time>{" · "}{providerLabel(entry.provider)}</span>
      {entry.folders.length ? <small className="type-helper" title={entry.folders.join("\n")}>{entry.folders.map(pathName).join(" · ")}</small> : null}</Button>)}</div>;
}
