import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { bodyEndIndex, createDocument, insertParagraph } from "@litzio/core";
import { useRef, useState } from "react";
import { CommandMenu } from "./CommandMenu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { insertSectionLabel, newSectionLabel, referenceCandidates, referenceOfCommand } from "./cross-reference.tsx";
import { i18n } from "./i18n.ts";
import { fragmentTarget, unresolvedLink } from "./link-opening.ts";
import type { UiMessage } from "./ui-message.ts";

type Candidate = ReturnType<typeof referenceCandidates>[number];

export function sectionLinkMatchesHeading(state: EditorState, heading: number, href: string): boolean {
  const labeled = insertSectionLabel(state.tr, heading, href.slice(1)).doc;
  return fragmentTarget(labeled, href) === heading + 1;
}

export function resolveLinkTargetChoice(state: EditorState, { id, blockIndex }: Candidate): { href: string; headingPath?: string } | { error: UiMessage } {
  const { doc } = state;
  const choice = referenceOfCommand(id)!;
  const unlabeled = "heading" in choice;
  const href = `#${unlabeled ? newSectionLabel(doc, choice.heading) : choice.label}`;
  try {
    // A label can be valid for a role but fail the canonical ordinary-link format.
    const empty = createDocument();
    insertParagraph(empty, bodyEndIndex(empty), [{ kind: "link", url: href, children: [{ kind: "text", text: "link" }] }]);
  } catch {
    return { error: { key: "This URL cannot be used as a link." } };
  }
  const target = unlabeled ? undefined : fragmentTarget(doc, href);
  if (!unlabeled && target === undefined) return { error: unresolvedLink(href) };
  if (unlabeled ? !sectionLinkMatchesHeading(state, blockIndex, href) : target !== blockIndex) {
    return { error: { key: "This link does not point to the selected block." } };
  }
  return { href, headingPath: unlabeled ? String(doc.child(choice.heading).attrs.sourcePath) : undefined };
}

/** The same candidate rows and search as slash reference insertion, inside the Link form. */
export function LinkTargetPicker({ id, doc, onChoose, onClose }: {
  id: string;
  doc: ProseMirrorNode;
  onChoose(candidate: Candidate): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const label = i18n.t("Find a target in this document");
  const items = referenceCandidates(doc, query, true);
  const rows = items.map((item, index) => ({ ...item, id: String(index) }));
  return <div id={id} ref={root} className="form-field link-target-picker">
    <label className="form-label" htmlFor={`${id}-search`}>{label}</label>
    <Input id={`${id}-search`} autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.nativeEvent.isComposing || (event.key !== "Enter" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && items.length) onChoose(items[0]);
      if (event.key === "ArrowDown") root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }} />
    <CommandMenu label={label} items={rows} style={{ position: "relative" }}
      onSelect={row => onChoose(items[Number(row)])} onClose={event => { if (!event) onClose(); }} />
  </div>;
}
