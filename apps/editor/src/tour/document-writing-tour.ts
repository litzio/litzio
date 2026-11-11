import { i18n } from "../i18n.ts";
import type { TourStep } from "./tour.ts";

/**
 * "Litzio first steps in writing". Every mechanism is one master has today: the title field, the
 * `## ` Markdown shortcut and `/` menu for headings, the outline, the `/` menu's Table and Section
 * reference. Goals read the live document, so the tour never edits it.
 */
export const DOCUMENT_WRITING_TOUR: readonly TourStep[] = [
  {
    id: "title", target: "document-title", focusTarget: true, auto: true,
    ready: probe => probe.title.trim().length > 0 && !probe.titleFocused,
    title: () => i18n.t("Tour: Enter a title"),
    body: () => i18n.t("Tour: Type the document title here, then press Enter to move to the body."),
  },
  {
    id: "heading", target: "document-first-line", region: "document-body", focusTarget: true,
    ready: probe => probe.headings > 0,
    title: () => i18n.t("Tour: Make a section heading"),
    body: () => i18n.t("Tour: On the first line, type ## and a space, then the heading text. Or type / and choose Heading 2. The number of # is the heading level."),
    hint: () => i18n.t("Tour: Next unlocks once the heading has text."),
  },
  {
    id: "outline", target: "outline-panel", prepare: "outline",
    title: () => i18n.t("Tour: See it in the outline"),
    body: () => i18n.t("Tour: The outline lists your headings, tables and figures. The heading you just wrote is there; select an entry to jump to it."),
  },
  {
    id: "table", target: "block-insert", region: "document-body", auto: true,
    ready: probe => probe.tables > 0,
    title: () => i18n.t("Tour: Insert a table"),
    body: () => i18n.t("Tour: On an empty line, type / and choose Table, or use the + button beside the line."),
  },
  {
    id: "reference", target: "document-body", region: "document-body",
    ready: probe => probe.references > 0,
    title: () => i18n.t("Tour: Reference a section"),
    body: () => i18n.t("Tour: Add a paragraph below the table with its + button, then type / and part of a heading’s name (for example “section”) and choose “Section reference”. Give the table a label in its properties to reference it as “Table 1” as well."),
    hint: () => i18n.t("Tour: Done unlocks once a reference is in the document."),
  },
];
