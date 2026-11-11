import { useEffect, useRef, useState } from "react";

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

/** Presentation only: the conversation continues to own the complete source. */
export function useAssistantText(source: string, streaming: boolean) {
  const [visible, setVisible] = useState("");
  const position = useRef(0);
  const previous = useRef("");
  const lastFrame = useRef(0);
  useEffect(() => {
    const replaced = !source.startsWith(previous.current);
    previous.current = source;
    if (!streaming || !segmenter || replaced) {
      lastFrame.current = 0;
      position.current = source.length;
      setVisible(source);
      return;
    }
    let frame = 0, retargeted = true;
    const tick = () => {
      const now = performance.now();
      if (lastFrame.current && now - lastFrame.current < 1000 / 60) { frame = requestAnimationFrame(tick); return; }
      const elapsed = !retargeted && lastFrame.current ? Math.min(250, now - lastFrame.current) : 1000 / 60;
      retargeted = false;
      lastFrame.current = now;
      position.current = Math.min(source.length, position.current + Math.max(1, Math.ceil((source.length - position.current) * elapsed / 150)));
      const boundary = position.current === source.length ? source.length : segmenter.segment(source).containing(position.current)?.index ?? 0;
      setVisible(source.slice(0, boundary));
      if (position.current < source.length) frame = requestAnimationFrame(tick);
    };
    if (position.current < source.length) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [source, streaming]);
  return !streaming || !segmenter || !source.startsWith(visible) ? source : visible;
}
