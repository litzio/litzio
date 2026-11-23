import type { ScreenItemListItem, ScreenItemListProps } from "@litzio/plugin-sdk";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./button.tsx";
import { Status } from "./status.tsx";
import "./item-list.css";

/**
 * Rows share one grid through subgrids, so each details position is one column in every row.
 * Group expansion belongs to this instance: the caller supplies only the initial state.
 */
export function ItemList({ items, groups, onOpen, hideStatusLabel = false }: ScreenItemListProps) {
  const id = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!items.length) return null;
  const statusColumn = !hideStatusLabel && items.some(item => item.status);
  const detailColumns = Math.max(0, ...items.map(item => item.details?.length ?? 0));
  const metaColumns = Number(statusColumn) + detailColumns;
  const style = metaColumns ? { "--item-list-meta-columns": `repeat(${metaColumns}, auto)` } as CSSProperties : undefined;
  const known = new Set(groups?.map(group => group.id));
  const rows = (members: readonly ScreenItemListItem[]) => members.map(item => <li key={item.id}>
    <Button variant="ghost" className="item-list-row" data-item-list-target="" onClick={() => onOpen(item)}>
      <span className="item-list-name type-item-name">{item.label}</span>
      <span className="item-list-mark">{item.status ? <Status tone={item.status.tone} variant="plain" label="" /> : null}</span>
      {item.status && !statusColumn ? <span className="sr-only">{item.status.label}</span> : null}
      <span className="item-list-meta">
        {statusColumn ? <span className="item-list-cell" style={{ "--item-list-column": 3 } as CSSProperties}>{item.status ? <Status tone={item.status.tone} variant="plain" hideIndicator label={item.status.label} /> : null}</span> : null}
        {item.details?.map((detail, index) => detail ? <span key={index} className="item-list-cell type-helper" style={{ "--item-list-column": 3 + Number(statusColumn) + index } as CSSProperties}>{detail}</span> : null)}
      </span>
    </Button>
  </li>);
  const loose = groups ? items.filter(item => !item.group || !known.has(item.group)) : items;
  return <div className="item-list"><div className="item-list-body" style={style} onKeyDown={moveFocus}>
    {loose.length ? <ul className="item-list-items">{rows(loose)}</ul> : null}
    {groups?.map((group, index) => {
      const members = items.filter(item => item.group === group.id);
      if (!members.length) return null;
      const open = expanded[group.id] ?? !group.collapsed;
      const listId = `${id}-${index}`;
      return <div key={group.id} className="item-list-group">
        <Button variant="ghost" size="sm" id={`${listId}-title`} className="item-list-group-title type-group-title" data-item-list-target=""
          aria-expanded={open} aria-controls={listId} onClick={event => {
            const list = document.getElementById(listId);
            // Keep keyboard focus visible: a focused row inside the group moves to its title before hiding.
            if (open && list?.contains(document.activeElement)) event.currentTarget.focus();
            setExpanded(state => ({ ...state, [group.id]: !open }));
          }}>
          {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <span className="item-list-group-label">{group.title}{open ? null : <span className="type-helper">{members.length}</span>}</span>
        </Button>
        <ul id={listId} className="item-list-items" aria-labelledby={`${listId}-title`} hidden={!open}>{rows(members)}</ul>
      </div>;
    })}
  </div></div>;
}

/** Arrow keys, Home and End move between visible rows and group titles, as in the document outline. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const targets = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-item-list-target]")].filter(target => !target.closest("[hidden]"));
  const index = targets.indexOf(event.target as HTMLElement);
  if (index < 0) return;
  const next = event.key === "Home" ? 0 : event.key === "End" ? targets.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
  event.preventDefault();
  targets[Math.max(0, Math.min(targets.length - 1, next))]?.focus();
}
