import type { z } from "zod";
import { useState } from "react";
import type { assistantSourceSchema } from "@litzio/core/views-v2";
import { Button } from "../components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import "./views.css";

/** The persisted rows are displayed without recalculation or truncation. */
export function AssistantDataDetails({ source }: { source: z.infer<typeof assistantSourceSchema> }) {
  const [page, setPage] = useState(0);
  const columns = Object.keys(source.rowSchema), size = 50, pages = Math.max(1, Math.ceil(source.rows.length / size));
  return <div>
    <p>{i18n.t("Assistant data may be inaccurate.")}</p>
    <time dateTime={source.generatedAt}>{source.generatedAt}</time>
    <details><summary>{i18n.t("Sources")}: {source.provenance.map(entry => entry.label).join(", ")}</summary>
      <ul>{source.provenance.map((entry, index) => <li key={index}>{entry.label} · {entry.kind === "document" ? `${entry.path} · ${entry.revision}` : entry.refId}</li>)}</ul>
    </details>
    <details><summary>{i18n.t("View data")}</summary>
      {source.method ? <p>{source.method}</p> : null}
      <div className="view-table-scroll" tabIndex={0} aria-label={i18n.t("View data")}><table><thead><tr>{columns.map(column => <th scope="col" key={column}>{source.rowSchema[column].label ?? column}</th>)}</tr></thead>
        <tbody>{source.rows.slice(page * size, (page + 1) * size).map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{row[column] === null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table></div>
      <div><Button size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>{i18n.t("Previous")}</Button> <span>{page + 1} / {pages} · {source.rows.length}</span> <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(value => value + 1)}>{i18n.t("Next")}</Button></div>
    </details>
  </div>;
}
