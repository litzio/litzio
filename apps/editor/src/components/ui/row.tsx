import { useId, type ReactNode } from "react";

export type RowProps = { label: ReactNode; description?: ReactNode; children?: ReactNode; kind?: "item" | "fact"; testId?: string };
/** One definition pair per fact keeps standalone and mixed sections valid HTML. */
export function Row({ label, description, children, kind = "item", testId }: RowProps) {
  const id = useId();
  if (kind === "fact") return <dl className="shared-row settings-section settings-row" data-kind="fact" data-testid={testId}>
    <dt className="settings-label"><span className="type-value-name">{label}</span>{description && <div className="settings-description type-helper">{description}</div>}</dt>
    <dd className="settings-row-control type-body">{children}</dd>
  </dl>;
  return <div className="shared-row settings-section settings-row" data-kind="item" data-testid={testId}>
    <div className="settings-label"><h3 className="settings-heading type-item-name" id={id}>{label}</h3>{description && <div className="settings-description type-helper">{description}</div>}</div>
    <div className="settings-row-control" role="group" aria-labelledby={id}>{children}</div>
  </div>;
}
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return <section className="shared-section" aria-labelledby={id}><h2 id={id} className="type-group-title">{title}</h2>{description && <p className="type-helper">{description}</p>}{children}</section>;
}
