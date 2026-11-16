import type { ReactNode } from "react";
export function PanelHeader({ title, icon, actions, level = 2 }: { title: string; icon?: ReactNode; actions?: ReactNode; level?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const Heading = `h${level}` as const;
  return <header className="panel-header"><Heading className="type-section-title">{icon}{title}</Heading><div className="panel-header-actions">{actions}</div></header>;
}
