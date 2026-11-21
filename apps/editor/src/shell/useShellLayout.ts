import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePanelWidth } from "./panel-width.ts";
import { assistantWidth } from "./AssistantPanel.tsx";

// Below the docking width of styles.css the Document panel starts closed and overlays the
// document; at and above it the panel docks. Independent of the narrow sidebar (64rem).
const PANEL_OVERLAY_LAYOUT = "(width < 89rem)";
// CSS custom properties cannot be used in media queries. Both navigation surfaces consume
// this adjustable token through matchMedia and expose their layout as shell classes.
const navigationOverlayLayout = () => `(width < ${getComputedStyle(globalThis.document.documentElement).getPropertyValue("--layout-navigation-overlay-breakpoint").trim()})`;

/**
 * The window's layout: media-query subscriptions, docked/overlay state and docked open memory of
 * the Sidebar, Document panel and Assistant, their widths and the layout DOM refs.
 * `fileOperationPending` joins the overlaid Assistant in making the rest of the shell inert.
 */
export function useShellLayout({ fileOperationPending }: { fileOperationPending: boolean }) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarSize, setSidebarSize] = usePanelWidth("sidebar");
  const [documentPanelSize, setDocumentPanelSize] = usePanelWidth("document-panel");
  const [assistantSize, setAssistantSize] = useState(assistantWidth);
  const [assistantOverlay, setAssistantOverlay] = useState(() => matchMedia(navigationOverlayLayout()).matches);
  const assistantReturn = useRef<HTMLElement | null>(null);
  const closeAssistant = () => { setAssistantOpen(false); requestAnimationFrame(() => assistantReturn.current?.focus({ preventScroll: true })); };
  const toggleAssistant = () => {
    if (assistantOpen) closeAssistant();
    else { assistantReturn.current = globalThis.document.activeElement as HTMLElement; setAssistantOpen(true); }
  };
  const sidebarOverlay = assistantOverlay;
  const [sidebarOpen, setSidebarOpen] = useState(() => !matchMedia(navigationOverlayLayout()).matches);
  const dockedSidebarOpen = useRef(true);
  const chooseSidebarOpen = (open: boolean) => {
    if (!sidebarOverlay) dockedSidebarOpen.current = open;
    setSidebarOpen(open);
  };
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const sidebarFocus = useRef<"sidebar" | null>(null);
  const closeSidebar = () => { sidebarFocus.current = "sidebar"; setSidebarOpen(false); };
  useEffect(() => {
    const media = matchMedia(navigationOverlayLayout());
    const change = () => {
      if (media.matches && globalThis.document.activeElement?.closest('.sidebar')) sidebarFocus.current = "sidebar";
      setAssistantOverlay(media.matches);
      setSidebarOpen(media.matches ? false : dockedSidebarOpen.current);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!sidebarOverlay || !sidebarOpen || assistantOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      // Portalled menus/dialogs belong to their own focus boundary, including Explorer actions.
      if (!(target instanceof Element) || target.closest('.sidebar, .activity-bar, .ui-portal, [role="dialog"], [role="menu"]')) return;
      if ([...globalThis.document.querySelectorAll('[role="menu"], [role="dialog"]')].some(element => element.getClientRects().length)) return;
      closeSidebar();
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [sidebarOverlay, sidebarOpen, assistantOpen]);
  useLayoutEffect(() => {
    const target = sidebarFocus.current === "sidebar" ? sidebarToggle.current : null;
    sidebarFocus.current = null;
    // An Activity bar item that closed the overlay stays visible and keeps its focus.
    if (!globalThis.document.activeElement?.closest(".activity-bar")) target?.focus();
  }, [sidebarOpen]);
  const [panelOverlay, setPanelOverlay] = useState(() => globalThis.matchMedia?.(PANEL_OVERLAY_LAYOUT).matches ?? false);
  // Page state only: open when docked, closed (and overlaying when opened) below the docking width.
  const [panelOpen, setPanelOpen] = useState(!panelOverlay);
  // Only explicit docked choices survive layout changes; overlays always start closed.
  const dockedPanelOpen = useRef<boolean | undefined>(undefined);
  const choosePanelOpen = (open: boolean) => {
    if (!panelOverlay) dockedPanelOpen.current = open;
    setPanelOpen(open);
  };
  const toggleOutline = () => {
    if (assistantOpen) { setAssistantOpen(false); choosePanelOpen(true); }
    else choosePanelOpen(!panelOpen);
  };
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const titlebar = useRef<HTMLDivElement>(null);
  const notifications = useRef<HTMLDivElement>(null);
  // Remove the operation guard before newly mounted Explorer rows restore focus in layout.
  useLayoutEffect(() => {
    if (!(assistantOpen && assistantOverlay) && !fileOperationPending) return;
    const elements = globalThis.document.querySelectorAll<HTMLElement>(".activity-bar, .sidebar, .app-main, .app-titlebar, .document-panel, .notification-center");
    elements?.forEach(element => { element.inert = true; });
    return () => elements?.forEach(element => { element.inert = false; });
  }, [assistantOpen, assistantOverlay, fileOperationPending]);

  // Resolve when an overlay closes: a viewport change can replace its original opener.
  function shellReturnFocus(preferred: HTMLElement | null): HTMLElement | true {
    return preferred?.isConnected && preferred.getClientRects().length ? preferred
      : sidebarToggle.current ?? true;
  }

  // The overlaid Document panel starts below the sticky header, whose height changes when
  // a message appears; it never covers Save, File actions or the Outline toggle.
  useEffect(() => {
    const element = header.current;
    const title = titlebar.current;
    if (!element || !title) return;
    const observer = new ResizeObserver(() => {
      shell.current?.style.setProperty("--app-titlebar-height", `${title.offsetHeight}px`);
      // Automatic notification cards start below the same header, outside the shell history boundary.
      for (const target of [shell.current, notifications.current]) target?.style.setProperty("--app-header-height", `${title.offsetHeight + element.offsetHeight}px`);
    });
    observer.observe(element);
    observer.observe(title);
    return () => observer.disconnect();
  }, []);

  // Entering overlay closes it; returning to docked restores the explicit choice or default.
  useEffect(() => {
    const query = matchMedia(PANEL_OVERLAY_LAYOUT);
    const change = () => {
      setPanelOverlay(query.matches);
      setPanelOpen(query.matches ? false : dockedPanelOpen.current ?? true);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  return {
    assistantOpen, setAssistantOpen, assistantOverlay, assistantSize, setAssistantSize, assistantReturn, closeAssistant, toggleAssistant,
    sidebarSize, setSidebarSize, sidebarOverlay, sidebarOpen, chooseSidebarOpen, closeSidebar, sidebarToggle, sidebarFocus,
    documentPanelSize, setDocumentPanelSize, panelOverlay, panelOpen, choosePanelOpen, toggleOutline, outlineToggle,
    shell, header, main, titlebar, notifications, shellReturnFocus,
  };
}
