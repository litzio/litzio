import { useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, Info } from "lucide-react";
import { DataTable, TableRowCount, type TableCoverage } from "../components/DataTable.tsx";
import { Button } from "../components/ui/button.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, MENU_ITEM_CLASS } from "../components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { Notice } from "../ui/primitives.tsx";
import { readPluginTableColumns, writePluginTableColumns } from "../preferences.ts";
import { i18n } from "../i18n.ts";
import type { RowSchema, ViewRow } from "@litzio/core/views";

export function PluginQueryTable({ scope, rows, fields, labels, title, label, defaultColumns, coverage, heading, receipt }: {
  heading?: ReactNode; receipt?: ReactNode; coverage?: TableCoverage; defaultColumns: readonly string[]; scope: string; rows: ViewRow[]; fields: RowSchema; labels?: Record<string, string>; title: string;
  label(column: string, value: ViewRow[string]): string;
}) {
  const candidates = Object.keys(fields).filter(name => !fields[name].secret);
  const [saved, setSaved] = useState(() => readPluginTableColumns(scope));
  const [saveError, setSaveError] = useState(false);
  const columnOrder = [...defaultColumns.filter(name => candidates.includes(name)), ...candidates.filter(name => !defaultColumns.includes(name))];
  const columns = columnOrder.filter(name => saved ? saved.includes(name) : fields[name].hidden === undefined ? defaultColumns.includes(name) : !fields[name].hidden);
  const tools = <div className="view-controls view-result-tools">{receipt}<DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>{i18n.t("Columns")}</DropdownMenuTrigger>
      <DropdownMenuContent>{candidates.map(name => <Menu.CheckboxItem key={name} className={MENU_ITEM_CLASS}
        checked={columns.includes(name)} closeOnClick={false} onCheckedChange={checked => {
          const next = candidates.filter(c => c === name ? checked : columns.includes(c));
          setSaved(next); setSaveError(!writePluginTableColumns(scope, next));
        }}><span className="inline-flex size-4 items-center justify-center"><Menu.CheckboxItemIndicator><Check /></Menu.CheckboxItemIndicator></span>{labels?.[name] ?? fields[name].label}</Menu.CheckboxItem>)}</DropdownMenuContent>
    </DropdownMenu>
      <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={i18n.t("Sorting and filters apply to loaded rows only.")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Sorting and filters apply to loaded rows only.")}</TooltipContent></Tooltip>
    </div>;
  return <>
    {saveError ? <Notice tone="warning">{i18n.t("Column selection could not be saved.")}</Notice> : null}
    {columns.length ? <DataTable heading={heading} tools={tools} coverage={coverage} rows={rows} columns={columns} fields={fields} labels={labels} title={title} label={label} /> : <><div className="view-controls data-table-toolbar">{heading}<TableRowCount shown={rows.length} loaded={rows.length} coverage={coverage} />{tools}</div><Notice>{i18n.t("Choose columns to display.")}</Notice></>}
  </>;
}
