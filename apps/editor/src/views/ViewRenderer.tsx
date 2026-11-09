import { DataTable, type TableField } from "../components/DataTable.tsx";
import type { ViewRow } from "@litzio/core/views";
import { queryViewSchema, type QueryView } from "@litzio/core/views-v2";
import "./views.css";
import { ViewPanels } from "./ViewPanels.tsx";

export function ViewRenderer({ view, rows, fields, fieldTypes }: { view: QueryView; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField> }) {
  const valid = queryViewSchema.parse(view);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {!rows?.length ? null : <DataTable rows={rows} columns={panel.columns} title={panel.title} labels={fields} fields={fieldTypes} loadedOnly />}
  </section>} />;
}
