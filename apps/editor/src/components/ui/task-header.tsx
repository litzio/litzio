import { createContext, useState, type ReactNode } from "react";

export const TaskHeaderSlots = createContext<{back: HTMLDivElement | null; description: HTMLDivElement | null; trailing: HTMLDivElement | null} | null>(null);

/** The work tab owns its title; screen code supplies only the other header slots. */
export function TaskHeader({ title, description, status, actions, backRef, descriptionRef, trailingRef }: {
  title: string; description?: ReactNode; status?: ReactNode; actions?: ReactNode;
  backRef?(node: HTMLDivElement | null): void; descriptionRef?(node: HTMLDivElement | null): void; trailingRef?(node: HTMLDivElement | null): void;
}) {
  return <header className="task-header"><div className="task-header-heading"><div className="task-header-back" ref={backRef} /><h1 className="task-surface-title">{title}</h1><div className="task-header-description" ref={descriptionRef}>{description}</div></div><div className="task-header-trailing" ref={trailingRef}>{status}{actions}</div></header>;
}
export function ScreenFrame({title, children}: {title: string; children: ReactNode}) {
  const [back, setBack] = useState<HTMLDivElement | null>(null);
  const [description, setDescription] = useState<HTMLDivElement | null>(null);
  const [trailing, setTrailing] = useState<HTMLDivElement | null>(null);
  return <TaskHeaderSlots.Provider value={{back, description, trailing}}><TaskHeader title={title} backRef={setBack} descriptionRef={setDescription} trailingRef={setTrailing}/>{children}</TaskHeaderSlots.Provider>;
}
