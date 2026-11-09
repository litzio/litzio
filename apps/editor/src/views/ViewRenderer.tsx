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

export function ViewRenderer({ view, rows, fields, fieldTypes, columnScope, columnFields, coverage, receipt }: { view: QueryView; rows?: ViewRow[]; fields?: Record<string, string>; fieldTypes?: Record<string, TableField>; columnScope?: string; columnFields?: RowSchema; coverage?: TableCoverage; receipt?: ReactNode }) {
  const valid = queryViewSchema.parse(view);
  return <ViewPanels layout={valid.layout} renderLeaf={(panel, index) => {
    const heading = <h3><Tooltip><TooltipTrigger render={<span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring" />}>{i18n.t("Results")}</TooltipTrigger><TooltipContent>{panel.title}</TooltipContent></Tooltip></h3>;
    return <section key={index} className="view-panel" aria-label={panel.title}>

    {!rows?.length ? <div className="view-controls data-table-toolbar">{heading}{rows ? <TableRowCount shown={0} loaded={0} coverage={coverage} /> : null}{receipt}</div> : columnScope && columnFields ? <PluginQueryTable heading={heading} receipt={receipt} key={columnScope} scope={`${columnScope}:${index}`} defaultColumns={panel.columns} coverage={coverage} rows={rows} fields={columnFields} labels={fields} title={panel.title} label={(_field, value) => value === null ? "—" : String(value)} /> : <DataTable heading={heading} tools={receipt} coverage={coverage} rows={rows} columns={panel.columns} title={panel.title} labels={fields} fields={fieldTypes} loadedOnly />}
  </section>; }} />;
}
