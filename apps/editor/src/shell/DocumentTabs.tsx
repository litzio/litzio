import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, PanelRightOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { tabLabels, tabNames } from "../document-tabs.ts";
import { ContextMenu } from "@/components/ui/context-menu.tsx";

export function DocumentTabs({ tabs, allTabs = tabs, active, disabled, onActivate, onClose, actions, onOpenRight, onMove, openRightDisabled, moveDisabled }: {
  actions?: ReactNode;
  tabs: { id: string; path: string; dirty: boolean; title?: string }[];
  allTabs?: { id: string; path: string; title?: string }[];
  active: string | null;
  disabled: boolean;
  onActivate(id: string): void;
  onClose(id: string): void;
  onOpenRight?(id: string): void;
  onMove?(id: string): void;
  openRightDisabled?: boolean;
  moveDisabled?: boolean;
}) {
  useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const names = tabNames(allTabs).map((name, index) => allTabs[index]!.title ?? name);
  const labels = tabLabels(allTabs).map((label, index) => allTabs[index]!.title ? { name: allTabs[index]!.title } : label);
  const revealTab = (id: string | null) => {
    const list = row.current;
    const item = list && [...list.querySelectorAll<HTMLElement>('.document-tab')].find(item => item.dataset.tabId === id);
    if (!list || !item) return;
    // Fractional control widths need fractional geometry; offsetWidth rounds and clips close targets.
    const bounds = list.getBoundingClientRect(), rect = item.getBoundingClientRect();
    if (rect.left < bounds.left) list.scrollLeft -= Math.ceil(bounds.left - rect.left);
    else if (rect.right > bounds.right) list.scrollLeft += Math.ceil(rect.right - bounds.right);
  };
  useLayoutEffect(() => {
    const list = row.current;
    if (!list) return;
    const reveal = () => revealTab(active);
    const measure = () => {
      if (!list.clientWidth) return;
      const bounds = list.getBoundingClientRect();
      const ids = [...list.querySelectorAll<HTMLElement>('.document-tab')].filter(item => {
        const rect = item.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
      }).map(item => item.dataset.tabId!);
      setHidden(previous => JSON.stringify(previous) === JSON.stringify(ids) ? previous : ids);
    };
    const observer = new ResizeObserver(() => { reveal(); measure(); });
    observer.observe(list);
    for (const item of list.children) observer.observe(item);
    list.addEventListener("scroll", measure);
    reveal();
    measure();
    return () => { observer.disconnect(); list.removeEventListener("scroll", measure); };
  }, [active, tabs]);
  return (
    <div className="document-tab-row">
      <div ref={row} className="document-tabs" role="tablist" aria-label={i18n.t("Documents")}>
        {tabs.map((tab, index) => {
          const labelIndex = allTabs.findIndex(item => item.id === tab.id);
          const tabRow = <div className="document-tab" key={tab.id} data-tab-id={tab.id} data-selected={tab.id === active} title={tab.path} role="presentation">
            <button type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
              title={tab.title}
              aria-selected={tab.id === active} aria-disabled={disabled} tabIndex={tab.id === active ? 0 : -1}
              aria-label={`${names[labelIndex]}${tab.dirty ? `, ${i18n.t("Unsaved changes")}` : ""}`}
              onClick={() => { if (!disabled) onActivate(tab.id); }}
              onKeyDown={event => {
                if (disabled) return;
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                  : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                if (next !== null) {
                  event.preventDefault();
                  onActivate(tabs[next]!.id);
                  row.current?.querySelector<HTMLElement>(`#tab-${tabs[next]!.id}`)?.focus({ preventScroll: true });
                } else if (event.key === "Delete") {
                  event.preventDefault();
                  onClose(tab.id);
                }
              }}>
              {/* The filename gives way first, so the folder that tells equal names apart stays visible. */}
              <span className="document-tab-name">
                <span className="document-tab-file">{labels[labelIndex]!.name}</span>
                {labels[labelIndex]!.folder ? <span className="document-tab-folder">{labels[labelIndex]!.folder}</span> : null}
              </span>
              <span className="document-tab-dirty" aria-hidden="true">{tab.dirty ? "•" : ""}</span>
            </button>
            <button type="button" className="document-tab-close" aria-label={i18n.t("Close {{name}}", { name: names[labelIndex] })}
              disabled={disabled} onClick={() => onClose(tab.id)}><X aria-hidden="true" /></button>
          </div>;
          return onOpenRight && onMove ? <ContextMenu key={tab.id} trigger={tabRow} disabled={disabled} actions={[
            { id: "open-right", label: i18n.t("Open to the right"), icon: <PanelRightOpen aria-hidden="true" />, disabled: openRightDisabled, run: () => onOpenRight(tab.id) },
            { id: "move-group", label: i18n.t("Move to other group"), icon: <ArrowLeftRight aria-hidden="true" />, disabled: moveDisabled, run: () => onMove(tab.id) },
          ]} /> : tabRow;
        })}
      </div>
      {hidden.length > 0 ? <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="document-tabs-overflow" disabled={disabled}
          aria-label={i18n.t("Hidden tabs: {{count}}", { count: hidden.length })}
          title={i18n.t("Hidden tabs: {{count}}", { count: hidden.length })} />}>
          <ChevronDown className="size-3" aria-hidden="true" /><span>{hidden.length}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {tabs.filter(tab => hidden.includes(tab.id)).map(tab => {
            const index = allTabs.findIndex(item => item.id === tab.id);
            return <DropdownMenuItem key={tab.id} title={tab.path} onClick={() => { onActivate(tab.id); revealTab(tab.id); }}>
              <span className="document-tabs-menu-name">{names[index]}{tab.dirty ? " •" : ""}</span>
            </DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu> : null}
      {actions}
    </div>
  );
}
