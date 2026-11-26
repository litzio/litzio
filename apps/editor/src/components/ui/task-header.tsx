import { createContext, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "./button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";
import { i18n } from "../../i18n.ts";

export const TaskHeaderSlots = createContext<{back: HTMLDivElement | null; about: HTMLDivElement | null; trailing: HTMLDivElement | null} | null>(null);

/** What the screen shows (short details) and what it is for (description, behind ⓘ), drawn after the title. */
export function TaskHeaderAbout({ details, description }: { details?: string; description?: string }) {
  return <>
    {details ? <span className="task-header-details" title={details}>{details}</span> : null}
    {description ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="task-header-info text-muted-foreground" aria-label={i18n.t("About this screen")} aria-description={description} />}>
      <Info aria-hidden="true" /></TooltipTrigger><TooltipContent side="bottom" align="start">{description}</TooltipContent></Tooltip> : null}
  </>;
}

/** The work tab owns its title; screen code supplies only the other header slots. */
export function TaskHeader({ title, details, description, status, actions, backRef, aboutRef, trailingRef }: {
  title: string; details?: string; description?: string; status?: ReactNode; actions?: ReactNode;
  backRef?(node: HTMLDivElement | null): void; aboutRef?(node: HTMLDivElement | null): void; trailingRef?(node: HTMLDivElement | null): void;
}) {
  return <header className="task-header"><div className="task-header-heading"><div className="task-header-back" ref={backRef} /><h1 className="task-header-title type-section-title" title={title}>{title}</h1><div className="task-header-about" ref={aboutRef}><TaskHeaderAbout details={details} description={description} /></div></div><div className="task-header-trailing" ref={trailingRef}>{status}{actions}</div></header>;
}
export function ScreenFrame({title, children}: {title: string; children: ReactNode}) {
  const [back, setBack] = useState<HTMLDivElement | null>(null);
  const [about, setAbout] = useState<HTMLDivElement | null>(null);
  const [trailing, setTrailing] = useState<HTMLDivElement | null>(null);
  return <TaskHeaderSlots.Provider value={{back, about, trailing}}><TaskHeader title={title} backRef={setBack} aboutRef={setAbout} trailingRef={setTrailing}/>{children}</TaskHeaderSlots.Provider>;
}
