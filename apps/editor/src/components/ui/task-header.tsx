import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "./button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

export const TaskHeaderSlots = createContext<{back: HTMLDivElement | null; description: HTMLDivElement | null; trailing: HTMLDivElement | null; meta: HTMLDivElement | null} | null>(null);

/** Spike #2016: the description text, mirrored into an ⓘ tooltip for the compact header drafts (hidden in the current shape). */
function useSlotText(node: HTMLDivElement | null) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!node) { setText(""); return; }
    const read = () => setText(node.textContent?.trim() ?? "");
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [node]);
  return text;
}

/** The work tab owns its title; screen code supplies only the other header slots. */
export function TaskHeader({ title, description, status, actions, backRef, descriptionRef, trailingRef, metaRef }: {
  title: string; description?: ReactNode; status?: ReactNode; actions?: ReactNode;
  backRef?(node: HTMLDivElement | null): void; descriptionRef?(node: HTMLDivElement | null): void; trailingRef?(node: HTMLDivElement | null): void; metaRef?(node: HTMLDivElement | null): void;
}) {
  const [descriptionNode, setDescriptionNode] = useState<HTMLDivElement | null>(null);
  const describe = useCallback((node: HTMLDivElement | null) => { setDescriptionNode(node); descriptionRef?.(node); }, [descriptionRef]);
  const text = useSlotText(descriptionNode);
  const info = text ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="task-header-info text-muted-foreground" aria-label={text} />}>
    <Info aria-hidden="true" /></TooltipTrigger><TooltipContent side="bottom" align="start">{text}</TooltipContent></Tooltip> : null;
  return <header className="task-header"><div className="task-header-heading"><div className="task-header-back" ref={backRef} /><h1 className="task-surface-title">{title}</h1><div className="task-header-meta" ref={metaRef} />{info}<div className="task-header-description" ref={describe}>{description}</div></div><div className="task-header-trailing" ref={trailingRef}>{status}{actions}</div></header>;
}
export function ScreenFrame({title, children}: {title: string; children: ReactNode}) {
  const [back, setBack] = useState<HTMLDivElement | null>(null);
  const [description, setDescription] = useState<HTMLDivElement | null>(null);
  const [trailing, setTrailing] = useState<HTMLDivElement | null>(null);
  const [meta, setMeta] = useState<HTMLDivElement | null>(null);
  return <TaskHeaderSlots.Provider value={{back, description, trailing, meta}}><TaskHeader title={title} backRef={setBack} descriptionRef={setDescription} trailingRef={setTrailing} metaRef={setMeta}/>{children}</TaskHeaderSlots.Provider>;
}
