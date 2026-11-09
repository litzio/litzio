import { PluginQueryTable } from "./PluginQueryTable.tsx";
import type { RowSchema } from "@litzio/core/views";
import { DataTable, type TableField, type TableCoverage, TableRowCount } from "../components/DataTable.tsx";
import type { ViewRow } from "@litzio/core/views";
import { queryViewSchema, type QueryView } from "@litzio/core/views-v2";
import "./views.css";
import { ViewPanels } from "./ViewPanels.tsx";

export function ViewRenderer({ view, rows, fields, fieldTypes, columnScope, columnFields, coverage }: { view: QueryView; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField>; columnScope?: string; columnFields?: RowSchema; coverage?: TableCoverage }) {
  const valid = queryViewSchema.parse(view);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {!rows?.length ? coverage?.truncated ? <TableRowCount shown={0} loaded={0} coverage={coverage} /> : null : columnScope && columnFields ? <PluginQueryTable key={columnScope} scope={`${columnScope}:${index}`} defaultColumns={panel.columns} coverage={coverage} rows={rows} fields={columnFields} labels={fields} title={panel.title} label={(_field, value) => value === null ? "—" : String(value)} /> : <DataTable coverage={coverage} rows={rows} columns={panel.columns} title={panel.title} labels={fields} fields={fieldTypes} loadedOnly />}
  </section>} />;
}
