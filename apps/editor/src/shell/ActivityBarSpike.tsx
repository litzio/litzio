// SPIKE #1812 — not for merge. Three Activity Bar drafts selected by `?activityBar=1|2|3`.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ellipsis, Files as FilesIcon, GitBranch, LayoutGrid, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { PanelHeader } from "@/components/ui/panel-header.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { HostStatus } from "../components/HostStatus.tsx";
import { hostConnection } from "../host-client.ts";
import { DesktopMenu } from "./DesktopDaemon.tsx";
import type { ThemePreference } from "../preferences.ts";

export type ActivityVariant = 0 | 1 | 2 | 3;
export type ActivityPanel = "explorer" | "screens" | "search" | "changes";

export function activityBarVariant(): ActivityVariant {
  if (typeof window === "undefined") return 0;
  const value = new URLSearchParams(window.location.search).get("activityBar");
  if (value === "1L" || value === "1T") return 1;
  return value === "1" || value === "2" || value === "3" ? Number(value) as ActivityVariant : 0;
}

/** Follow-up spike: 1L = labels under icons (72px bar), 1T = 48px bar; both use plugin icons or letter tiles. */
export type ActivityFlavor = "plain" | "labels" | "tiles";
export function activityBarFlavor(): ActivityFlavor {
  if (typeof window === "undefined") return "plain";
  const value = new URLSearchParams(window.location.search).get("activityBar");
  return value === "1L" ? "labels" : value === "1T" ? "tiles" : "plain";
}

/** A plugin without its own icon: the first letter of its name on a rounded accent tile. */
export function LetterTile({ name }: { name: string }) {
  return <span className="plugin-letter-tile" aria-hidden="true">{Array.from(name.trim())[0] ?? "?"}</span>;
}

/** One work-screen entry: the template gallery or a plugin's primary screen. */
export type WorkScreen = { id: string; label: string; icon: ReactNode; active?: boolean; badge?: boolean; run(returnFocus: HTMLElement): void };

const PANELS: Record<ActivityPanel, { label: string; icon: ReactNode }> = {
  explorer: { label: "탐색기", icon: <FilesIcon aria-hidden="true" /> },
  screens: { label: "작업 화면", icon: <LayoutGrid aria-hidden="true" /> },
  search: { label: "검색", icon: <Search aria-hidden="true" /> },
  changes: { label: "변경", icon: <GitBranch aria-hidden="true" /> },
};

function BarButton({ label, selected, active, badge, onClick, children, pressed, showLabel }: { label: string; selected?: boolean; active?: boolean; badge?: boolean; pressed?: boolean; showLabel?: boolean; onClick(event: React.MouseEvent<HTMLButtonElement>): void; children: ReactNode }) {
  return <Tooltip>
    <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className={`activity-bar-button${showLabel ? " activity-bar-button--labeled" : ""}`} data-selected={selected ? "" : undefined} data-active={active ? "" : undefined}
      aria-label={label} aria-pressed={pressed} aria-current={active ? "page" : undefined} onClick={onClick} />}>
      <span className="settings-entry-icon">{children}{badge ? <span className="settings-update-dot activity-bar-badge" aria-hidden="true" /> : null}</span>
      {showLabel ? <span className="activity-bar-label" aria-hidden="true">{label}</span> : null}
    </TooltipTrigger>
    <TooltipContent side="right">{label}</TooltipContent>
  </Tooltip>;
}

/** The always-visible 48px bar of drafts 1 and 2. */
export function ActivityBar({ variant, flavor = "plain", panel, open, onPanel, screens, theme, onThemeChange, onSettings, updateVersion }: {
  variant: 1 | 2; flavor?: ActivityFlavor; panel: ActivityPanel; open: boolean; onPanel(panel: ActivityPanel): void; screens: WorkScreen[];
  theme: ThemePreference; onThemeChange(theme: ThemePreference): void; onSettings(returnFocus: HTMLElement): void; updateVersion?: string;
}) {
  const panels: ActivityPanel[] = variant === 1 ? ["explorer", "search", "changes"] : ["explorer", "screens", "search", "changes"];
  const middle = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(screens.length);
  // Measure the middle group: icons that do not fit move into the More menu.
  useLayoutEffect(() => {
    const element = middle.current;
    if (!element || variant !== 1) return;
    const measure = () => {
      const style = getComputedStyle(element);
      // Slot = the real height of one bar item (taller with labels).
      const first = element.firstElementChild as HTMLElement | null;
      const height = first?.offsetHeight || parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--size-control-compact")) * 16;
      const slot = height + parseFloat(style.rowGap || "0");
      const capacity = Math.max(0, Math.floor((element.clientHeight + parseFloat(style.rowGap || "0")) / slot));
      setFit(capacity >= screens.length ? screens.length : Math.max(0, capacity - 1));
    };
    measure();
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }); observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [screens.length, variant, flavor]);
  const shown = variant === 1 ? screens.slice(0, fit) : [];
  const hidden = variant === 1 ? screens.slice(fit) : [];
  const runtime = hostConnection.get();
  const labels = flavor === "labels";
  return <div className={`activity-bar${labels ? " activity-bar--labels" : ""}${flavor !== "plain" ? " activity-bar--tiles" : ""}`} role="toolbar" aria-orientation="vertical" aria-label="활동 막대">
    <div className="activity-bar-group">
      {panels.map(id => <BarButton key={id} showLabel={labels} label={PANELS[id].label} selected={open && panel === id} pressed={open && panel === id} onClick={() => onPanel(id)}>{PANELS[id].icon}</BarButton>)}
    </div>
    {variant === 1 ? <>
      <div className="activity-bar-separator" role="separator" />
      <div ref={middle} className="activity-bar-group activity-bar-group--screens">
        {shown.map(item => <BarButton key={item.id} showLabel={labels} label={item.label} active={item.active} badge={item.badge} onClick={event => item.run(event.currentTarget)}>{item.icon}</BarButton>)}
        {hidden.length && flavor !== "plain" ? <MoreScreens screens={screens} hidden={hidden.length} badge={hidden.some(item => item.badge)} showLabel={labels} /> : null}
        {hidden.length && flavor === "plain" ? <DropdownMenu>
          <Tooltip>
            <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="activity-bar-button" aria-label={`작업 화면 ${hidden.length}개 더 보기`} />} />}>
              <span className="settings-entry-icon"><Ellipsis aria-hidden="true" />{hidden.some(item => item.badge) ? <span className="settings-update-dot activity-bar-badge" aria-hidden="true" /> : null}</span>
            </TooltipTrigger>
            <TooltipContent side="right">더 보기</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end">
            {hidden.map(item => <DropdownMenuItem key={item.id} onClick={event => item.run(event.currentTarget as HTMLElement)}>{item.icon}<span className="min-w-0 flex-1">{item.label}</span>{item.badge ? <span className="activity-bar-menu-dot" aria-label="새 소식" /> : null}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
    </> : <div className="activity-bar-spacer" />}
    <div className="activity-bar-group activity-bar-group--bottom">
      <BarButton label={updateVersion ? `설정 — 새 버전 ${updateVersion}` : "설정"} badge={!!updateVersion} onClick={event => onSettings(event.currentTarget)}><Settings aria-hidden="true" /></BarButton>
      <BarButton label={`색 모드: ${theme === "dark" ? "다크" : "라이트"}`} onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</BarButton>
      {window.litzioDesktop ? <DesktopMenu desktop={window.litzioDesktop} /> : <BarButton label="Desktop 메뉴 (자리)" onClick={() => {}}><Monitor aria-hidden="true" /></BarButton>}
      <div className="activity-bar-status" title="백그라운드 서비스"><HostStatus runtime={runtime} compact showDetails={false} iconOnly /></div>
    </div>
  </div>;
}

/** Searchable icon + name list shared by the draft 2 panel and the draft 3 popup. */
export function WorkScreenList({ screens, autoFocus, onRun }: { screens: WorkScreen[]; autoFocus?: boolean; onRun?(): void }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => screens.filter(item => item.label.toLowerCase().includes(query.trim().toLowerCase())), [screens, query]);
  return <div className="work-screen-list">
    <Input aria-label="작업 화면 검색" placeholder="작업 화면 검색" value={query} autoFocus={autoFocus} onChange={event => setQuery(event.target.value)} />
    <ul>
      {shown.map(item => <li key={item.id}>
        <button type="button" className="sidebar-tree-item work-screen-row" aria-current={item.active ? "page" : undefined} onClick={event => { item.run(event.currentTarget); onRun?.(); }}>
          <span className="settings-entry-icon">{item.icon}{item.badge ? <span className="settings-update-dot activity-bar-badge" aria-hidden="true" /> : null}</span>
          <span className="sidebar-tree-name">{item.label}</span>
        </button>
      </li>)}
      {shown.length === 0 ? <li className="type-helper work-screen-empty">찾는 작업 화면이 없습니다</li> : null}
    </ul>
  </div>;
}

/** Draft 2: the Work screens panel. */
export function WorkScreensPanel({ screens }: { screens: WorkScreen[] }) {
  return <div className="activity-panel">
    <PanelHeader title="작업 화면" />
    <WorkScreenList screens={screens} />
  </div>;
}

/** Future panels: an empty slot showing the final shape only. */
export function PlaceholderPanel({ panel }: { panel: "search" | "changes" }) {
  return <div className="activity-panel">
    <PanelHeader title={PANELS[panel].label} />
    <p className="type-helper activity-panel-placeholder">{panel === "search" ? "폴더 전체 검색 자리" : "Git 변경 목록 자리"}</p>
  </div>;
}

/** Draft 3: one Work screens button opening a searchable popup beside it. */
export function WorkScreensLauncher({ screens, iconOnly }: { screens: WorkScreen[]; iconOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const badge = screens.some(item => item.badge);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverPrimitive.Trigger render={<Button ref={anchor} variant="ghost" size={iconOnly ? "icon-sm" : "sm"} className={iconOnly ? "activity-bar-button" : "min-w-0 justify-start"} aria-label="작업 화면" title="작업 화면" />}>
      <span className="settings-entry-icon"><LayoutGrid aria-hidden="true" />{badge ? <span className="settings-update-dot activity-bar-badge" aria-hidden="true" /> : null}</span>
      {iconOnly ? null : <span className="min-w-0 flex-1 text-left">작업 화면</span>}
    </PopoverPrimitive.Trigger>
    {/* Open beyond the sidebar edge, not over it. */}
    <PopoverContent side="right" align="end" sideOffset={iconOnly ? 20 : 18} className="work-screen-popup">
      <WorkScreenList screens={screens} autoFocus onRun={() => setOpen(false)} />
    </PopoverContent>
  </Popover>;
}

/** 1L/1T: More opens the searchable icon + name list of every work screen (draft 3 popup). */
function MoreScreens({ screens, hidden, badge, showLabel }: { screens: WorkScreen[]; hidden: number; badge: boolean; showLabel: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger render={<PopoverPrimitive.Trigger render={<Button variant="ghost" size="icon-sm" className={`activity-bar-button${showLabel ? " activity-bar-button--labeled" : ""}`} aria-label={`작업 화면 ${hidden}개 더 보기`} />} />}>
        <span className="settings-entry-icon"><Ellipsis aria-hidden="true" />{badge ? <span className="settings-update-dot activity-bar-badge" aria-hidden="true" /> : null}</span>
        {showLabel ? <span className="activity-bar-label" aria-hidden="true">더 보기</span> : null}
      </TooltipTrigger>
      <TooltipContent side="right">더 보기</TooltipContent>
    </Tooltip>
    <PopoverContent side="right" align="end" sideOffset={8} className="work-screen-popup">
      <WorkScreenList screens={screens} autoFocus onRun={() => setOpen(false)} />
    </PopoverContent>
  </Popover>;
}
