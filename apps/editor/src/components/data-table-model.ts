import type { ViewRow } from "@litzio/core/views";
export type TableField = {
  type: "string" | "number" | "boolean";
  date?: boolean;
};
export type TableFilter = {
  mode: string;
  text: string;
  values: ViewRow[string][];
  min: string;
  max: string;
  empty: boolean;
};
const empty = (v: unknown) => v === null || v === "" || v === undefined;
export function tableRows(
  rows: ViewRow[],
  filters: Record<string, TableFilter>,
  sort: { column: string; descending: boolean } | undefined,
  fields: Record<string, TableField>,
  locale: string,
) {
  const number = (v: ViewRow[string], field: TableField) =>
    field.date ? Date.parse(String(v)) : Number(v);
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      Object.entries(filters).every(([column, f]) => {
        const v = row[column],
          field = fields[column] ?? { type: "string" };
        if (empty(v)) return f.empty;
        if (f.mode === "empty") return false;
        if (f.mode === "values") return f.values.includes(v);
        if (field.type === "boolean")
          return f.text === "" || v === (f.text === "true");
        if (field.type === "number" || field.date)
          return (
            (!f.min || number(v, field) >= number(f.min, field)) &&
            (!f.max || number(v, field) <= number(f.max, field))
          );
        return String(v)
          .toLocaleLowerCase(locale)
          .includes(f.text.toLocaleLowerCase(locale));
      }),
    )
    .sort((a, b) => {
      if (!sort) return a.index - b.index;
      const x = a.row[sort.column],
        y = b.row[sort.column];
      if (empty(x) || empty(y))
        return empty(x) === empty(y) ? a.index - b.index : empty(x) ? 1 : -1;
      const f = fields[sort.column] ?? { type: "string" };
      const d =
        f.date || f.type === "number"
          ? number(x, f) - number(y, f)
          : f.type === "boolean"
            ? Number(x) - Number(y)
            : String(x).localeCompare(String(y), locale);
      return (sort.descending ? -d : d) || a.index - b.index;
    })
    .map((x) => x.row);
}
