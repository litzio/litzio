import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useRef, useState } from "react";
import { CommandMenu } from "./CommandMenu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { referenceCommandItems } from "./cross-reference.tsx";
import { i18n } from "./i18n.ts";

/** The same candidate rows and search as slash reference insertion, inside the Link form. */
export function LinkTargetPicker({ id, doc, onChoose, onClose }: {
  id: string;
  doc: ProseMirrorNode;
  onChoose(id: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const label = i18n.t("Find a target in this document");
  const items = referenceCommandItems(doc, query, true);
  return <div id={id} ref={root} className="form-field link-target-picker">
    <label className="form-label" htmlFor={`${id}-search`}>{label}</label>
    <Input id={`${id}-search`} autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.nativeEvent.isComposing || (event.key !== "Enter" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && items.length) onChoose(items[0].id);
      if (event.key === "ArrowDown") root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }} />
    <CommandMenu label={label} items={items} style={{ position: "relative" }}
      onSelect={onChoose} onClose={event => { if (!event) onClose(); }} />
  </div>;
}
