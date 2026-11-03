import { readAccentColor, readPageBackground, readTheme, type PageBackground, type ThemePreference } from "./preferences.ts";
import "./styles/tokens.css";

// Runtime counterpart of theme-init.js: keep roles and native appearance in sync before UI mounts.
const root = document.documentElement;
let preference = readTheme();
let revision = 0;

export const currentTheme = (): ThemePreference => preference;

function render(dark: boolean): void {
  root.dataset.theme = dark ? "dark" : "light";
  root.style.removeProperty("color-scheme");
}

function syncBackground(): Promise<void> | undefined {
  const desktop = window.litzioDesktop;
  if (!desktop) return;
  // Keep the color value in tokens.css, including the native window's unpainted background.
  const style = getComputedStyle(root);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  const color = (role: string) => {
    // Let the browser parse CSS (including minified #fff), then send opaque sRGB bytes.
    context.fillStyle = style.getPropertyValue(`--id-color-${role}`).trim();
    context.fillRect(0, 0, 1, 1);
    return "#" + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      .map(value => value.toString(16).padStart(2, "0")).join("");
  };
  return desktop.setWindowBackground(color("canvas"), {
    color: color("surface-subtle"),
    symbolColor: color("text"),
  });
}

export async function applyTheme(theme: ThemePreference, animate = true): Promise<void> {
  const changed = preference !== theme;
  preference = theme;
  const request = ++revision;
  const update = () => { if (request === revision) render(theme === "dark"); };
  if (animate && changed && document.startViewTransition && !navigator.webdriver &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const transition = document.startViewTransition(update);
    // A skipped snapshot must not reject an otherwise successful theme choice.
    void transition.finished.catch(() => {});
    await transition.updateCallbackDone;
  } else update();
  if (request !== revision) return;
  if (window.litzioDesktop) {
    await window.litzioDesktop.setTheme(theme);
    if (request !== revision) return;
    await syncBackground();
  }
}

export function applyPageBackground(page: PageBackground): void {
  root.dataset.page = page;
  void syncBackground();
}

root.dataset.page = readPageBackground();
root.dataset.accent = readAccentColor();
export const themeReady = applyTheme(preference, false);
