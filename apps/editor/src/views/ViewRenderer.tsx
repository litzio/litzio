import type { ReactNode } from "react";
import { i18n } from "../i18n.ts";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { PluginQueryTable } from "./PluginQueryTable.tsx";
import type { RowSchema } from "@litzio/core/views";
import { DataTable, type TableField, type TableCoverage, TableRowCount } from "../components/DataTable.tsx";
import type { ViewRow } from "@litzio/core/views";
import { queryViewSchema, type QueryView } from "@litzio/core/views-v2";
import "./views.css";
import { ViewPanels } from "./ViewPanels.tsx";
import { Chart } from "./Chart.tsx";

export function ViewRenderer({ view, rows, fields, fieldTypes, columnScope, columnFields, coverage, receipt }: { view: QueryView; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField>; columnScope?: string; columnFields?: RowSchema; coverage?: TableCoverage; receipt?: ReactNode }) {
  const valid = queryViewSchema.parse(view);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => {
    // Chart leaves only draw the operation rows; they add no data processing (see docs/design/plugin-chart-spike).
    if (panel.component === "Chart") return <section key={index} className="view-panel" aria-label={panel.title} data-testid="plugin-chart-panel"><div className="view-controls data-table-toolbar"><h3>{panel.title}</h3></div>{rows?.length ? <Chart panel={panel} rows={rows} labels={fields} /> : <p className="chart-empty">{i18n.t("No chart data")}</p>}</section>;
    // A view with several panels names each one; single-panel views keep the existing "Results" heading.
    const heading = valid.layout.children.length > 1 ? <h3>{panel.title}</h3> : <h3><Tooltip><TooltipTrigger render={<span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring" />}>{i18n.t("Results")}</TooltipTrigger><TooltipContent>{panel.title}</TooltipContent></Tooltip></h3>;
    const shown = panel.rowFilter ? rows?.filter(r => r[panel.rowFilter!.field] === panel.rowFilter!.value) : rows;
    return <section key={index} className="view-panel" aria-label={panel.title}>

    {!shown?.length ? <div className="view-controls data-table-toolbar">{heading}{shown ? <TableRowCount shown={0} loaded={0} coverage={coverage} /> : null}{receipt}</div> : columnScope && columnFields ? <PluginQueryTable heading={heading} receipt={receipt} key={columnScope} scope={`${columnScope}:${index}`} defaultColumns={panel.columns} coverage={coverage} rows={shown} fields={columnFields} labels={fields} title={panel.title} label={(_field, value) => value === null ? "—" : String(value)} /> : <DataTable heading={heading} tools={receipt} coverage={coverage} rows={shown} columns={panel.columns} title={panel.title} labels={fields} fields={fieldTypes} loadedOnly />}
  </section>; }} />;
}
