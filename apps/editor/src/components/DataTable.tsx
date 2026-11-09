import { externalLinkUrl, openExternalLink } from "../link-opening.ts";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useId, type ReactNode } from "react";
import { Popover as Primitive } from "@base-ui/react/popover";
import { Popover, PopoverContent } from "./ui/popover.tsx";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip.tsx";
import { Input } from "./ui/input.tsx";
import { Notice } from "../ui/primitives.tsx";
import { i18n } from "../i18n.ts";
import type { ViewRow } from "@litzio/core/views";
import {
  tableRows,
  type TableField,
  type TableFilter,
} from "./data-table-model.ts";
export type { TableField } from "./data-table-model.ts";
const empty = (v: unknown) => v === null || v === "" || v === undefined;
const fresh = (): TableFilter => ({
  mode: "contains",
  text: "",
  values: [],
  min: "",
  max: "",
  empty: false,
});
export function DataTable({
  rows,
  columns,
  fields = {},
  labels = {},
  title,
  label = (_c, v) => (v === null ? "—" : String(v)),
  loadedOnly = false,
  coverage,
  heading,
  tools,
}: {
  rows: ViewRow[];
  columns: readonly string[];
  fields?: Record<string, TableField>;
  labels?: Record<string, string>;
  title: string;
  label?(column: string, value: ViewRow[string]): string;
  loadedOnly?: boolean;
  coverage?: TableCoverage;
  heading?: ReactNode;
  tools?: ReactNode;
}) {
  useTranslation();
  const [sort, setSort] = useState<{ column: string; descending: boolean }>();
  const [filters, setFilters] = useState<Record<string, TableFilter>>({});
  const [page, setPage] = useState(0);
  useEffect(() => {
    setSort(undefined);
    setFilters({});
    setPage(0);
  }, [rows, columns.join("\0")]);
  const types = Object.fromEntries(
    columns.map((c) => [
      c,
      fields[c] ?? {
        type:
          typeof rows.find((r) => !empty(r[c]))?.[c] === "number"
            ? "number"
            : typeof rows.find((r) => !empty(r[c]))?.[c] === "boolean"
              ? "boolean"
              : "string",
      },
    ]),
  ) as Record<string, TableField>;
  const shown = tableRows(rows, filters, sort, types, i18n.language),
    pages = Math.max(1, Math.ceil(shown.length / 50)),
    current = Math.min(page, pages - 1);
  const columnWidth = (column: string) => {
    const field = types[column];
    if (field.date) return 144;
    if (field.type !== "string") return 112;
    const length = Math.max((labels[column] ?? column).length, ...rows.map(row => String(row[column] ?? "").length));
    return Math.min(480, Math.max(144, length * 8 + 48));
  };
  return (
    <div className="data-table">
      <div className="view-controls data-table-toolbar">
        {heading}
        <TableRowCount shown={shown.length} loaded={rows.length} coverage={coverage} />
        {Object.keys(filters).length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilters({});
              setPage(0);
            }}
          >
            {i18n.t("Clear all filters")}
          </Button>
        ) : null}
        {tools}
      </div>
      {loadedOnly ? (
        <p>{i18n.t("Sorting and filters apply to loaded rows only.")}</p>
      ) : null}
      <div
        className="view-table-scroll"
        tabIndex={0}
        role="region"
        aria-label={title}
      >
        <table style={{ minWidth: columns.reduce((sum, c) => sum + columnWidth(c), 0) }}>
          <colgroup>{columns.map(c => <col key={c} style={{ width: columnWidth(c) }} />)}</colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  aria-sort={
                    sort?.column === c
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <div className="data-table-heading">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSort(
                          sort?.column !== c
                            ? { column: c, descending: false }
                            : !sort.descending
                              ? { column: c, descending: true }
                              : undefined,
                        );
                        setPage(0);
                      }}
                    >
                      {labels[c] ?? c}
                      {sort?.column === c ? (
                        sort.descending ? (
                          <ArrowDown aria-hidden="true" />
                        ) : (
                          <ArrowUp aria-hidden="true" />
                        )
                      ) : null}
                    </Button>
                    <ColumnFilter
                      key={c}
                      name={labels[c] ?? c}
                      field={types[c]}
                      rows={rows}
                      column={c}
                      value={filters[c]}
                      apply={(value) => {
                        setFilters((old) => {
                          const next = { ...old };
                          if (value) next[c] = value;
                          else delete next[c];
                          return next;
                        });
                        setPage(0);
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(current * 50, current * 50 + 50).map((r, n) => (
              <tr key={n}>
                {columns.map((c) => {
                  const target = fields[c]?.linkField;
                  const value = target ? r[target] : undefined;
                  const href = typeof value === "string" && typeof r[c] === "string" && r[c] !== "" ? externalLinkUrl(value) : undefined;
                  return <td key={c}>{href ? <a className="view-cell-link" href={href} target="_blank" rel="noopener" onClick={event => { event.preventDefault(); openExternalLink(href); }}>{label(c, r[c])}</a> : label(c, r[c])}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length ? <Notice>{i18n.t("No matching rows.")}</Notice> : null}
      {pages > 1 ? (
        <div className="view-controls">
          <Button
            size="sm"
            variant="secondary"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            {i18n.t("Previous")}
          </Button>
          <span>
            {current + 1} / {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {i18n.t("Next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
function ColumnFilter({
  name,
  field,
  rows,
  column,
  value,
  apply,
}: {
  name: string;
  field: TableField;
  rows: ViewRow[];
  column: string;
  value?: TableFilter;
  apply(value?: TableFilter): void;
}) {
  const errorId = useId();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<TableFilter>(fresh),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  const values = [
    ...new Set(rows.map((r) => r[column]).filter((v) => !empty(v))),
  ];
  const change = (patch: Partial<TableFilter>) =>
    setDraft((old) => ({ ...old, ...patch }));
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setDraft(value ?? { ...fresh(), mode: field.type === "string" && !field.date ? "values" : "contains", values, empty: true });
          setSearch("");
          setError("");
        }
      }}
    >
      <Primitive.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={i18n.t("Filter {{column}}", { column: name })}
            aria-pressed={!!value}
          />
        }
      >
        <Filter aria-hidden="true" fill={value ? "currentColor" : "none"} />
      </Primitive.Trigger>
      <PopoverContent>
        <form
          className="data-table-filter"
          onSubmit={(e) => {
            e.preventDefault();
            const convert = (v: string) =>
              field.date ? Date.parse(v) : Number(v);
            if (
              (draft.min && !Number.isFinite(convert(draft.min))) ||
              (draft.max && !Number.isFinite(convert(draft.max))) ||
              (draft.min &&
                draft.max &&
                convert(draft.min) > convert(draft.max))
            ) {
              setError(i18n.t("Check the range."));
              return;
            }
            const allValues = values.every(v => draft.values.includes(v));
            const unrestricted = draft.empty && (draft.mode === "values" ? allValues : draft.mode === "contains" && (field.type === "number" || field.date ? !draft.min && !draft.max : !draft.text));
            apply(unrestricted ? undefined : draft);
            setOpen(false);
          }}
        >
          <strong>{name}</strong>
          <label>
            {i18n.t("Condition")}
            <select
              className="form-select"
              value={draft.mode}
              onChange={(e) => change({ mode: e.target.value })}
            >
              <option value="contains">
                {i18n.t(
                  field.type === "string" && !field.date
                    ? "Contains text"
                    : "Values",
                )}
              </option>
              {field.type === "string" && !field.date ? (
                <option value="values">{i18n.t("Select values")}</option>
              ) : null}
              <option value="empty">{i18n.t("Empty values only")}</option>
            </select>
          </label>
          {draft.mode === "empty" ? null : draft.mode === "values" ? (
            <>
              <Input
                aria-label={i18n.t("Search values")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="data-table-values">
                {values
                  .filter((v) =>
                    String(v)
                      .toLocaleLowerCase(i18n.language)
                      .includes(search.toLocaleLowerCase(i18n.language)),
                  )
                  .map((v) => (
                    <label key={JSON.stringify(v)}>
                      <input
                        type="checkbox"
                        checked={draft.values.includes(v)}
                        onChange={(e) =>
                          change({
                            values: e.target.checked
                              ? [...draft.values, v]
                              : draft.values.filter((x) => x !== v),
                          })
                        }
                      />
                      {String(v)}
                    </label>
                  ))}
              </div>
            </>
          ) : field.type === "number" || field.date ? (
            <>
              {(["min", "max"] as const).map((key) => (
                <label key={key}>
                  {i18n.t(key === "min" ? "Minimum" : "Maximum")}
                  <Input
                    type={field.date ? "datetime-local" : "number"}
                    step="any"
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    value={draft[key]}
                    onChange={(e) => change({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </>
          ) : field.type === "boolean" ? (
            <label>
              {i18n.t("Values")}
              <select
                className="form-select"
                value={draft.text}
                onChange={(e) => change({ text: e.target.value })}
              >
                <option value="">{i18n.t("Any")}</option>
                <option value="true">{i18n.t("Yes")}</option>
                <option value="false">{i18n.t("No")}</option>
              </select>
            </label>
          ) : (
            <Input
              aria-label={i18n.t("Contains text")}
              value={draft.text}
              onChange={(e) => change({ text: e.target.value })}
            />
          )}
          <label>
            <input
              type="checkbox"
              checked={draft.empty}
              onChange={(e) => change({ empty: e.target.checked })}
            />
            {i18n.t("Include empty values")}
          </label>
          {error ? (
            <p id={errorId} role="alert">
              {error}
            </p>
          ) : null}
          <div className="view-controls">
            <Button type="submit" size="sm">
              {i18n.t("Apply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {i18n.t("Cancel")}
            </Button>
            {value ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  apply();
                  setOpen(false);
                }}
              >
                {i18n.t("Clear")}
              </Button>
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export type TableCoverage = { truncated: boolean; total?: number };
/** Keep local filtering counts and source coverage on one accessible status line. */
export function TableRowCount({ shown, loaded, coverage }: { shown: number; loaded: number; coverage?: TableCoverage }) {
  return <span role="status">{shown} / {loaded}{coverage?.truncated ? <> · <Tooltip>
    <TooltipTrigger render={<span tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring" />}>
      {coverage.total === undefined ? i18n.t("Partial results") : i18n.t("Total: {{total}}", { total: coverage.total.toLocaleString(i18n.language) })}
    </TooltipTrigger><TooltipContent>{i18n.t("The source returned only part of the matching data. Sorting and filters use returned rows.")}</TooltipContent>
  </Tooltip></> : null}</span>;
}
