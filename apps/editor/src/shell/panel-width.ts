import { useEffect, useState } from "react";
import { brand } from "../../../../brand.ts";

export function usePanelWidth(kind: "sidebar" | "document-panel") {
  const key = `${brand.storagePrefix}.${kind}Width`;
  const [width, setWidth] = useState<number | undefined>(() => {
    try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : undefined; }
    catch { return undefined; }
  });
  const remember = (value: number) => {
    setWidth(value);
    try { localStorage.setItem(key, String(value)); } catch { /* Live width remains usable. */ }
  };
  return [width, remember] as const;
}

function panelWidthBounds(element: Element, kind: "sidebar" | "document-panel") {
  const style = getComputedStyle(element);
  const min = parseFloat(style.getPropertyValue(`--layout-${kind}-min-width`));
  const max = parseFloat(style.getPropertyValue(`--layout-${kind}-max-width`));
  return { min, max: kind === "sidebar" ? Math.min(max, window.innerWidth - 440) : max };
}

export function usePanelWidthBounds(kind: "sidebar" | "document-panel") {
  const [bounds, setBounds] = useState<{ min: number; max: number }>();
  useEffect(() => {
    const update = () => setBounds(panelWidthBounds(document.documentElement, kind));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [kind]);
  return bounds;
}
