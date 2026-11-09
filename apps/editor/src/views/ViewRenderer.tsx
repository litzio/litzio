import { DataTable, type TableField } from "../components/DataTable.tsx";
import { i18n } from "../i18n.ts";
import type { ViewRow } from "@litzio/core/views";
import { queryViewSchema as allQueryViewSchema, type CatalogView } from "@litzio/core/views-v2";
import "./views.css";
import { ViewChart } from "./ViewChart.tsx";
import { ViewPanels } from "./ViewPanels.tsx";

export function ViewRenderer({ view, rows, fields, fieldTypes }: { view: Extract<CatalogView, {profile: "query"}>; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField> }) {
  const valid = allQueryViewSchema.parse(view);
  const label = (field: string, value: ViewRow[string]) => valid.sources.stats.kind === "operation" && valid.sources.stats.operation === "folder.statistics" && value === "." && (field === "folder" || field === "group" && valid.sources.stats.groupBy?.field === "folder")
    ? i18n.t("(Root)") : value === null ? "—" : String(value);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => <section key={index} className="view-panel" aria-label={panel.title}>
    <h3>{panel.title}</h3>
    {!rows?.length ? null : panel.component === "Table" ? <DataTable rows={rows} columns={panel.columns} title={panel.title} labels={fields} fields={valid.sources.stats.kind === "assistant" ? valid.sources.stats.rowSchema : fieldTypes} label={label} loadedOnly={valid.refresh === "manual"} /> : <ViewChart chart={panel} rows={rows} label={label} fields={fields} />}
  </section>} />;
}
