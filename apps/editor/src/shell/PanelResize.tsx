import { useLayoutEffect, useRef, useState } from "react";

/** The Assistant's pointer-captured separator, shared by shell navigation panels. */
export function PanelResize({ label, side = "right", min = 340, max = 560, onWidth }: {
  label: string; side?: "left" | "right"; min?: number; max?: number; onWidth(value: number): void;
}) {
  const drag = useRef({ x: 0, width: 0 });
  const handle = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const panel = handle.current!.parentElement!;
    const observer = new ResizeObserver(() => setWidth(panel.getBoundingClientRect().width));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const clamp = (value: number) => Math.max(min, Math.min(max, value));
  return <div ref={handle} className={`panel-resize panel-resize--${side}`} role="separator" aria-label={label}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
    onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1);
      onWidth(clamp(handle.current!.parentElement!.getBoundingClientRect().width + direction * 20));
    }}
    onPointerDown={event => { if (event.button === 0) { event.preventDefault(); drag.current = { x: event.clientX, width: event.currentTarget.parentElement!.getBoundingClientRect().width }; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); } }}
    onPointerMove={event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      onWidth(clamp(drag.current.width + (event.clientX - drag.current.x) * (side === "left" ? 1 : -1)));
    }} />;
}
