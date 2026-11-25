import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Ellipsis, Files as FilesIcon, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { HostStatus } from "../components/HostStatus.tsx";
import { hostConnection } from "../host-client.ts";
import { i18n } from "../i18n.ts";
import { THEME_LABELS, type ThemePreference } from "../preferences.ts";
import { DesktopMenu } from "./DesktopDaemon.tsx";

/** One screen entry of the middle group: the Template gallery or a plugin's primary screen. */
export type ActivityItem = { id: string; label: string; icon: ReactNode; active?: boolean; loading?: boolean; run(returnFocus: HTMLElement): void };

type ActivityBarProps = {
  explorerOpen: boolean;
  onExplorer(): void;
  /** The Explorer item: the focus-return target when the Explorer overlay or a task closes. */
  explorerRef: RefObject<HTMLButtonElement | null>;
  items: ActivityItem[];
  itemsDisabled?: boolean;
  theme: ThemePreference;
  onThemeChange(theme: ThemePreference): void;
  /** App Settings. Names the control focus returns to. */
  onSettings(returnFocus: HTMLElement): void;
  settingsDisabled?: boolean;
  updateVersion?: string;
};

const MORE = "more";

/**
 * Always-visible left bar: Explorer, screen entries, then Settings, Color mode, Desktop menu and
 * connection status. One Tab stop; Up/Down/Home/End move between items (roving tabindex).
 */
export function ActivityBar({ explorerOpen, onExplorer, explorerRef, items, itemsDisabled, theme, onThemeChange, onSettings, settingsDisabled, updateVersion }: ActivityBarProps) {
  const { i18n: language } = useTranslation();
  useSyncExternalStore(hostConnection.subscribe, hostConnection.snapshot, hostConnection.snapshot);
  const group = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [current, setCurrent] = useState("explorer");
  const itemKey = items.map(item => `${item.id}\u0000${item.label}`).join("\u0001");
  // Items that do not fit the window height move into More. Heights differ by label lines. Hiding the
  // names in Settings (root dataset) shrinks the Explorer item, so this group grows and is measured again.
  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(element).rowGap) || 0;
      const heights = [...element.querySelectorAll<HTMLElement>(":scope > [data-activity-item]")].map(node => node.offsetHeight);
      const available = element.clientHeight;
      const total = heights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, heights.length - 1);
      if (total <= available) { setFit(heights.length); return; }
      // More has one label line, like the Explorer item.
      let used = explorerRef.current?.offsetHeight ?? 0, count = 0;
      while (count < heights.length && used + heights[count]! + gap <= available) { used += heights[count]! + gap; count++; }
      setFit(count);
    };
    measure();
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [itemKey, language.language, explorerRef]);
  const overflow = fit < items.length;
  const desktop = typeof window !== "undefined" ? window.litzioDesktop : undefined;
  const stops = ["explorer", ...(itemsDisabled ? [] : items.slice(0, fit).map(item => item.id)), ...(overflow && !itemsDisabled ? [MORE] : []),
    ...(settingsDisabled ? [] : ["settings"]), "theme", ...(desktop ? ["desktop"] : [])];
  const stop = stops.includes(current) ? current : "explorer";
  const tabIndex = (id: string) => id === stop ? 0 : -1;
  const runtime = hostConnection.get();
  const account = runtime.state === "connected" ? runtime.identity?.runAs : undefined;
  const settingsLabel = updateVersion ? i18n.t("Settings, new version available") : i18n.t("Settings");
  const themeLabel = `${i18n.t("Color mode")}: ${i18n.t(THEME_LABELS[theme])}`;
  const explorerLabel = i18n.t(explorerOpen ? "Collapse Explorer" : "Expand Explorer");
  const itemButton = (item: ActivityItem, hidden: boolean) => <BarItem key={item.id} id={item.id} label={item.label} tabIndex={hidden ? -1 : tabIndex(item.id)}
    hidden={hidden} disabled={itemsDisabled} active={item.active} loading={item.loading}
    tooltip={item.loading ? `${item.label} · ${i18n.t("Loading")}` : item.label} onClick={event => item.run(event.currentTarget)}>{item.icon}</BarItem>;
  return <div className="activity-bar" role="toolbar" aria-orientation="vertical" aria-label={i18n.t("Activity bar")} data-testid="activity-bar"
    onFocus={event => { const id = (event.target as Element).closest<HTMLElement>("[data-activity-id]")?.dataset.activityId; if (id) setCurrent(id); }}
    onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      const from = (event.target as Element).closest("[data-activity-id]");
      if (!from || !event.currentTarget.contains(from)) return;
      const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-activity-id]")].filter(node => !node.closest("[inert]") && !(node as HTMLButtonElement).disabled);
      const index = nodes.indexOf(from as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
      event.preventDefault();
      nodes[next]?.focus();
    }}>
    <div className="activity-bar-group">
      <BarItem id="explorer" buttonRef={explorerRef} label={i18n.t("Explorer")} tooltip={explorerLabel} ariaLabel={explorerLabel} tabIndex={tabIndex("explorer")}
        selected={explorerOpen} aria-expanded={explorerOpen} aria-controls="sidebar-files" onClick={onExplorer}><FilesIcon aria-hidden="true" /></BarItem>
    </div>
    <div className="activity-bar-separator" aria-hidden="true" />
    <div ref={group} className="activity-bar-group activity-bar-screens">
      {items.slice(0, fit).map(item => itemButton(item, false))}
      {overflow ? <MoreItems items={items} tabIndex={tabIndex(MORE)} disabled={itemsDisabled} /> : null}
      {items.slice(fit).map(item => itemButton(item, true))}
    </div>
    <div className="activity-bar-group activity-bar-preferences">
      <IconItem id="settings" label={settingsLabel} tooltip={updateVersion ? i18n.t("New version {{version}} available", { version: updateVersion }) : i18n.t("Settings")}
        tabIndex={tabIndex("settings")} disabled={settingsDisabled} data-open-settings="" onClick={event => onSettings(event.currentTarget)}>
        <span className="settings-entry-icon"><Settings aria-hidden="true" />
          {updateVersion ? <span className="settings-update-dot" data-testid="settings-update-dot" aria-hidden="true" /> : null}</span>
      </IconItem>
      <IconItem id="theme" label={themeLabel} tooltip={themeLabel} tabIndex={tabIndex("theme")} onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
      </IconItem>
      {desktop ? <DesktopMenu desktop={desktop} tabIndex={tabIndex("desktop")} /> : null}
      {/* Read-only connection state: not a Tab stop; the execution account is in its accessible name and Settings About. */}
      <div role="group" className="activity-bar-status" aria-label={`${i18n.t("Background service")} · ${i18n.t("Run as")}${account ? `: ${account}` : ""}`}>
        <HostStatus runtime={runtime} compact showDetails={false} iconOnly />
      </div>
    </div>
  </div>;
}

type BarItemProps = {
  id: string; label: string; tooltip?: string; ariaLabel?: string; tabIndex: number; hidden?: boolean; disabled?: boolean;
  selected?: boolean; active?: boolean; loading?: boolean; buttonRef?: RefObject<HTMLButtonElement | null>; children: ReactNode;
  onClick(event: React.MouseEvent<HTMLButtonElement>): void;
  "aria-expanded"?: boolean; "aria-controls"?: string;
};

/** An icon with its name below, up to two lines; the full name is the tooltip and accessible name. */
function BarItem({ id, label, tooltip = label, ariaLabel = label, tabIndex, hidden, disabled, selected, active, loading, buttonRef, children, onClick, ...aria }: BarItemProps) {
  return <Tooltip>
    <TooltipTrigger render={<Button ref={buttonRef} variant="ghost" className="activity-bar-item" data-activity-id={id} data-activity-item=""
      data-selected={selected ? "" : undefined} data-active={active ? "" : undefined} aria-current={active ? "page" : undefined}
      aria-label={ariaLabel} aria-description={loading ? i18n.t("Loading") : undefined} data-loading={loading ? "" : undefined} tabIndex={tabIndex} disabled={disabled} inert={hidden} data-overflow={hidden ? "" : undefined} onClick={onClick} {...aria} />}>
      <span className="activity-bar-icon">{children}</span>
      <span className="activity-bar-label" aria-hidden="true">{label}</span>
    </TooltipTrigger>
    <TooltipContent side="right">{tooltip}</TooltipContent>
  </Tooltip>;
}

/** A compact icon-only bottom item. */
function IconItem({ id, label, tooltip, tabIndex, disabled, children, onClick, ...rest }: { id: string; label: string; tooltip: string; tabIndex: number; disabled?: boolean; children: ReactNode;
  onClick(event: React.MouseEvent<HTMLButtonElement>): void; "data-open-settings"?: string }) {
  return <Tooltip>
    <TooltipTrigger render={<Button variant="ghost" size="icon-sm" data-activity-id={id} aria-label={label} tabIndex={tabIndex} disabled={disabled} onClick={onClick} {...rest} />}>{children}</TooltipTrigger>
    <TooltipContent side="right">{tooltip}</TooltipContent>
  </Tooltip>;
}

/** More: the searchable list of every screen entry, so the list stays the same whatever the window height. */
function MoreItems({ items, tabIndex, disabled }: { items: ActivityItem[]; tabIndex: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return items.filter(item => item.label.toLocaleLowerCase().includes(text));
  }, [items, query]);
  // Every opening starts from the whole list.
  const choose = (next: boolean) => { setOpen(next); if (!next) setQuery(""); };
  const run = (item: ActivityItem, target: HTMLElement) => { choose(false); item.run(target); };
  return <Popover open={open} onOpenChange={choose}>
    <Tooltip>
      <TooltipTrigger render={<PopoverPrimitive.Trigger render={<Button variant="ghost" className="activity-bar-item" data-activity-id={MORE} data-activity-more=""
        aria-label={i18n.t("More")} tabIndex={tabIndex} disabled={disabled} />} />}>
        <span className="activity-bar-icon"><Ellipsis aria-hidden="true" /></span>
        <span className="activity-bar-label" aria-hidden="true">{i18n.t("More")}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{i18n.t("More")}</TooltipContent>
    </Tooltip>
    <PopoverContent side="right" align="end" sideOffset={8} className="activity-more" aria-label={i18n.t("More")}>
      <Input autoFocus aria-label={i18n.t("Search screens")} placeholder={i18n.t("Search screens")} value={query} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && shown[0]) { event.preventDefault(); run(shown[0], event.currentTarget); } }} />
      <ul className="activity-more-list">
        {shown.map(item => <li key={item.id}>
          <Button variant="ghost" size="sm" className="activity-more-item" data-active={item.active ? "" : undefined} aria-current={item.active ? "page" : undefined}
            data-loading={item.loading ? "" : undefined} aria-description={item.loading ? i18n.t("Loading") : undefined} onClick={event => run(item, event.currentTarget)}>
            <span className="activity-bar-icon">{item.icon}</span><span className="activity-more-name">{item.label}</span>
          </Button>
        </li>)}
        {shown.length ? null : <li className="type-helper activity-more-empty">{i18n.t("No matching screens")}</li>}
      </ul>
    </PopoverContent>
  </Popover>;
}
