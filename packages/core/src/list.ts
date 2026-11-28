import type { InlineContent } from "./inline.ts";

export const MAX_LIST_START = 999_999_999;

export const LIST_STYLES = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"] as const;
export type ListStyle = typeof LIST_STYLES[number];
export type ListDelimiter = "." | ")";

/** An editable bullet list, numbered list or checklist. */
export type ListContent = {
  ordered: boolean;
  /** A checklist: an unordered list whose every item has a check state. Absent on other lists. */
  checklist?: boolean;
  /** Keep this Markdown list loose where its shape permits it. Defaults to tight. */
  loose?: boolean;
  /** The first number of a numbered list; bullet lists have none. Defaults to 1 when inserting. */
  start?: number;
  /** Ordered marker style (default decimal); unavailable on bullet lists. */
  style?: ListStyle;
  /** Ordered marker delimiter (default .); unavailable on bullet lists. */
  delimiter?: ListDelimiter;
  items: ListItemContent[];
};

/** One list item: its inline text, optionally followed by one nested list. */
export type ListItemContent = {
  content: InlineContent[];
  /** A checklist item's check state; only checklist items have one. Inserting defaults to unchecked. */
  checked?: boolean;
  list?: ListContent;
};
