import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditorVisible } from "./editor-visibility.ts";
import { useOverlayBounds, type OverlayAnchor } from "./ui/use-overlay-bounds.ts";

export type CommandMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  /** Consecutive items of one group are divided from the previous group by a separator. */
  group?: string;
  /** A short secondary text, such as the Markdown shortcut for the same block. */
  hint?: string;
  icon?: LucideIcon;
  /** A single-choice row; false still reserves its radio semantics. */
  checked?: boolean;
};

type CommandMenuProps = {
  label: string;
  items: CommandMenuItem[];
  style: CSSProperties;
  anchor?: OverlayAnchor;
  /** Controlled highlight while focus stays in the editor (slash command). */
  activeIndex?: number;
  /** Move focus into the menu when opened from a button. */
  focusOnOpen?: boolean;
  /** A context menu returns to its editor rather than a button opener. */
  onReturnFocus?(): void;
  emptyText?: string;
  onSelect(id: string): void;
  onClose(event?: MouseEvent): void;
};

/** Presentational menu shared by the insert menu (`+` and `/`) and the block menu. */
export function CommandMenu({ label, items, style, anchor, activeIndex, focusOnOpen, onReturnFocus, emptyText, onSelect, onClose }: CommandMenuProps) {
  useTranslation();
  const visible = useEditorVisible();
  // Table menus already live inside the shared Popover's portal/positioner.
  const portaled = style.position !== "relative";
  const origin = useRef<HTMLSpanElement>(null);
  const root = useOverlayBounds<HTMLDivElement>(true, anchor, portaled ? origin : undefined);
  const returnFocus = useRef<Element | null>(null);
  useLayoutEffect(() => {
    // Retain the existing endnote interaction boundary across the DOM portal.
    const owner = origin.current?.closest("[data-endnote-owner][data-endnote-editor]");
    for (const name of ["data-endnote-owner", "data-endnote-editor"]) {
      const value = owner?.getAttribute(name);
      if (value !== null && value !== undefined) root.current?.setAttribute(name, value);
      else root.current?.removeAttribute(name);
    }
  });
  useLayoutEffect(() => {
    const menu = root.current;
    if (!menu || activeIndex === undefined) return;
    const reveal = () => {
      const active = menu.querySelector<HTMLElement>(".command-menu-item.active")?.getBoundingClientRect();
      if (!active) return;
      const rect = menu.getBoundingClientRect();
      const top = rect.top + menu.clientTop, bottom = top + menu.clientHeight;
      if (active.top < top) menu.scrollTop -= top - active.top;
      else if (active.bottom > bottom) menu.scrollTop += active.bottom - bottom;
    };
    reveal();
    const resize = new ResizeObserver(reveal);
    resize.observe(menu);
    return () => resize.disconnect();
  });
  useEffect(() => {
    // StrictMode repeats effects; never replace the opener with our own first item.
    if (!root.current?.contains(document.activeElement)) returnFocus.current = document.activeElement;
    if (focusOnOpen) root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose(event);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  const content = (
    <div
      ref={root}
      className="command-menu"
      role="menu"
      aria-label={label}
      style={portaled ? { ...style, position: "fixed", left: 0, top: 0 } : style}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          if (focusOnOpen && onReturnFocus) onReturnFocus();
          else if (focusOnOpen && returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) returnFocus.current.focus();
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {items.length === 0 ? <p className="command-menu-empty">{emptyText ?? i18n.t("No matches")}</p> : null}
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Fragment key={item.id}>
            {index > 0 && item.group !== items[index - 1].group
              ? <div className="command-menu-separator" role="separator" aria-label={item.group} />
              : null}
            <button
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={item.checked}
              // The hint is secondary text; the item is named by its label alone.
              aria-label={item.label}
              className={`command-menu-item${index === activeIndex ? " active" : ""}${item.danger ? " danger" : ""}`}
              disabled={item.disabled}
              title={item.disabledReason}
              aria-description={item.disabled ? item.disabledReason : undefined}
              // Keep the editor selection for slash commands.
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelect(item.id)}
            >
              {Icon ? <Icon className="command-menu-icon" aria-hidden="true" size={16} /> : null}
              <span className="command-menu-label">{item.label}</span>
              {item.checked ? <Check className="command-menu-icon" aria-hidden="true" size={16} /> : null}
              {item.hint ? <kbd className="command-menu-hint">{item.hint}</kbd> : null}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
  if (!portaled || typeof document === "undefined") return content;
  return <>
    <span ref={origin} aria-hidden="true" style={{ ...style, position: "absolute", width: 0, height: 0, pointerEvents: "none" }} />
    {createPortal(<div className="ui-portal" hidden={!visible}>{content}</div>, document.body)}
  </>;
}
