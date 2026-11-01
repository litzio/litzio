export type Ref = { $ref: string };
export type ImageRef = { uri: string; mimetype: string; dpi: number; size: { width: number; height: number } };
export type Provenance = { page_no: number; bbox: { l: number; t: number; r: number; b: number; coord_origin?: "TOPLEFT" | "BOTTOMLEFT" }; charspan: number[] };
export type Cell = {
  text: string; row_span?: number; col_span?: number;
  start_row_offset_idx: number; end_row_offset_idx: number;
  start_col_offset_idx: number; end_col_offset_idx: number;
  column_header?: boolean; row_header?: boolean; row_section?: boolean; fillable?: boolean;
};
export type SourceItem = {
  self_ref: string; label: string; content_layer?: string; parent?: Ref | null;
  children?: Ref[]; prov?: Provenance[]; text?: string; orig?: string; level?: number;
  formatting?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; script?: string } | null;
  hyperlink?: string | null; marker?: string; enumerated?: boolean; code_language?: string;
  captions?: Ref[]; footnotes?: Ref[]; references?: Ref[]; image?: ImageRef | null;
  data?: { num_rows: number; num_cols: number; table_cells: Cell[] };
};
export type SourceDocument = {
  schema_name: "DoclingDocument"; version: "1.10.0"; name: string;
  body?: SourceItem; furniture?: SourceItem;
  texts?: SourceItem[]; tables?: SourceItem[]; pictures?: SourceItem[]; groups?: SourceItem[];
  key_value_items?: SourceItem[]; form_items?: SourceItem[]; field_regions?: SourceItem[]; field_items?: SourceItem[];
  pages?: Record<string, { page_no: number; size: { width: number; height: number }; image?: ImageRef | null }>;
};
