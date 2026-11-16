import { Children, cloneElement, Fragment, isValidElement, useId, type ReactNode } from "react";

export type RowProps = { label: ReactNode; description?: ReactNode; children?: ReactNode; kind?: "item" | "fact"; testId?: string };
/** Soft opportunities are elements, so selection/copy retains the exact value. */
function valueBreaks(children: ReactNode, inCode = false): ReactNode {
  return Children.map(children, child => {
    if (inCode && typeof child === "string") {
      const parts = child.split(/(?<=[/\\.\-_])/u);
      return parts.map((part, index) => <Fragment key={index}>{part}{index < parts.length - 1 && <wbr />}</Fragment>);
    }
    if (!isValidElement<{ children?: ReactNode }>(child) || typeof child.type !== "string") return child;
    const { children: contents } = child.props;
    return contents === undefined ? child : cloneElement(child, undefined, valueBreaks(contents, inCode || child.type === "code"));
  });
}
/** One definition pair per fact keeps standalone and mixed sections valid HTML. */
export function Row({ label, description, children, kind = "item", testId }: RowProps) {
  if (kind === "fact") return <dl className="shared-row settings-section settings-row" data-kind="fact" data-testid={testId}>
    <dt className="settings-label"><span className="type-value-name">{label}</span>{description && <div className="settings-description type-helper">{description}</div>}</dt>
    <dd className="settings-row-control type-body">{valueBreaks(children)}</dd>
  </dl>;
  return <div className="shared-row settings-section settings-row" data-kind="item" data-testid={testId}>
    <div className="settings-label"><h3 className="settings-heading type-item-name">{label}</h3>{description && <div className="settings-description type-helper">{description}</div>}</div>
    <div className="settings-row-control">{valueBreaks(children)}</div>
  </div>;
}
export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return <section className="shared-section" aria-labelledby={id}><h2 id={id} className="type-group-title">{title}</h2>{description && <p className="type-helper">{description}</p>}{children}</section>;
}
