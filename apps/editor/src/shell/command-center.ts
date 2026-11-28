import type { LucideIcon } from "lucide-react";
import { hangulJamo, searchJamo } from "../qwerty-hangul.ts";

/** A view of existing shell actions, rebuilt from the current tab and operation state. */
export type CommandCenterItem = {
  id: string;
  kind: "document" | "file" | "command";
  label: string;
  keywords?: string[];
  detail?: string;
  shortcut?: string;
  icon: LucideIcon;
  disabled?: boolean;
  /** A listed text file, as in the sidebar. */
  /** A command opening another surface owns its focus after the center has closed. */
  takesFocus?: boolean;
  run(): void;
};

export function filterCommandCenterItems(items: readonly CommandCenterItem[], query: string): CommandCenterItem[] {
  const trimmed = query.trim();
  const commandsOnly = trimmed.startsWith(">");
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const typed = (commandsOnly ? trimmed.slice(1) : trimmed).normalize("NFKC").split(/\s+/).filter(Boolean);
  const candidates = commandsOnly ? items.filter(item => item.kind === "command") : items;
  const search = (words: string[], text: (value: string) => string) => {
    const containsAll = (value: string) => { const haystack = text(value); return words.every(word => haystack.includes(word)); };
    const matches = candidates.filter(item => containsAll([item.label, item.detail, ...(item.keywords ?? [])].join(" ")));
    // Stable sort preserves tab/tree/command order inside each match grade.
    return matches.sort((a, b) => Number(containsAll(b.label)) - Number(containsAll(a.label)));
  };
  const matches = search(typed.map(word => word.toLocaleLowerCase()), normalize);
  // Hangul being composed or typed in English mode is tried only when the query as typed found nothing.
  const jamo = typed.map(searchJamo).filter(word => word !== undefined);
  if (matches.length || !typed.length || jamo.length !== typed.length) return matches;
  return search(jamo, value => hangulJamo(normalize(value)));
}
