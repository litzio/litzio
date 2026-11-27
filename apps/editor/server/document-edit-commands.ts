import { serializeChange, machineNodes, snapshotSection } from "@litzio/core";
export { serializeChange, machineNodes, snapshotSection } from "@litzio/core";
import {
  bodyEndIndex,
  ADMONITION_VARIANTS,
  isAdmonitionVariant,
  insertParagraph,
  insertHeading,
  insertAdmonition,
  insertEquation,
  insertFigure,
  insertTable,
  insertTarget,
  insertTableRow,
  insertTableColumn,
  moveTableColumn,
  moveTableRow,
  removeTableColumn,
  removeTableRow,
  insertList,
  insertCodeBlock,
  insertHardBreak,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  moveSection,
  parse,
  removeBlock,
  removeSection,
  placeEndnotes,
  removeFootnote,
  replaceText,
  replaceAllText,
  serialize,
  updateNodeTextAtPath,
  updateHeadingLevel,
  updateAdmonitionVariant,
  insertQuote,
  updateQuoteInlineContent,
  insertDivider,
  insertFootnote,
  updateFootnoteDefinition,
  convertBlock,
  updateHeadingInlineContent,
  updateEquationLatex,
  updateFigure,
  updateMediaReferences,
  updateLabel,
  updateEnumerator,
  updateNumberingMode,
  updateTableCell,
  updateTableCellBlocks,
  updateTableCaption,
  insertTableNote,
  updateTableNote,
  removeTableNote,
  moveTableNote,
  updateHeadingNumbering,
  updateDocumentTitle,
  updateDocumentStatus,
  type DocumentStatus,
  updateReferenceTemplates,
  type ReferenceTemplateUpdate,
  updateBibliography,
  insertCitation,
  updateCitation,
  removeCitation,
  updateTableColumnAlignment,
  updateList,
  updateListItemChecked,
  updateCodeBlock,
  unresolvedReferences,
  validateStructure,
  type Document,
  type AdmonitionVariant,
  type NodePath,
  type InlineContent,
  type ComplexTableInput,
  type TableCellBlock,
  type CitationRole,
  type ListContent,
} from "@litzio/core";
import { assertUnicode } from "@litzio/file-commit";
type OutputFormat = "text" | "json";
type ParsedArgs = {file: string; flags: string[]; format: OutputFormat};
type Change = (document: Document) => Document;

/** The standalone command uses the count in its receipt; batches use the resulting document. */
export function replaceAllTextFor(document: Document, flags: string[]) {
  return replaceAllText(document, {
    from: flag(flags, "--from"), to: flag(flags, "--to"), caseSensitive: !flags.includes("--ignore-case"),
  });
}

/** Share flag interpretation and Core operations between single edits and batch steps. */
export function changeFor(command: string, flags: string[], deferEndnotes = false): Change {
  switch (command) {
    case "insert-hard-break":
    case "split-paragraph": {
      const operation = command === "insert-hard-break" ? insertHardBreak : splitParagraph;
      return (document) => operation(document, pathFlag(flags), intFlag(flags, "--offset"));
    }
    case "merge-paragraph": {
      return (document) => mergeParagraphWithPrevious(document, pathFlag(flags));
    }
    case "format": {
      return (document) => document;
    }
    case "replace-text": {
      return flags.includes("--all") ? document => replaceAllTextFor(document, flags).document
        : document => replaceText(document, flag(flags, "--from"), flag(flags, "--to"), { caseSensitive: !flags.includes("--ignore-case") });
    }
    case "insert-block": {
      const text = optionalFlag(flags, "--text");
      const content = optionalFlag(flags, "--content");
      if ((text === undefined) === (content === undefined)) throw new Error("insert-block requires exactly one of --text or --content");
      return (document) => insertParagraph(document, insertionIndex(document, flags), text ?? jsonFlag<InlineContent[]>(flags, "--content"));
    }
    case "insert-heading": {
      return (document) => insertHeading(
        document,
        insertionIndex(document, flags),
        intFlag(flags, "--level"),
        textOrContent(flags),
      );
    }
    case "update-heading": {
      return (document) => updateHeadingInlineContent(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-admonition": {
      return (document) => insertAdmonition(document, insertionIndex(document, flags), variantFlag(flags), textOrContent(flags));
    }
    case "insert-quote": {
      return (document) => insertQuote(document, insertionIndex(document, flags), textOrContent(flags));
    }
    case "update-quote": {
      return (document) => updateQuoteInlineContent(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-footnote": {
      return (document) => insertFootnote(document, pathFlag(flags), intFlag(flags, "--offset"), textOrContent(flags));
    }
    case "update-bibliography": {
      return document => updateBibliography(document, jsonFlag(flags, "--paths"));
    }
    case "insert-citation":
    case "update-citation": {
      const operation = command === "insert-citation" ? insertCitation : updateCitation;
      return document => operation(document, pathFlag(flags), intFlag(flags, "--offset"), {
        kind: "citation", role: flag(flags, "--role") as CitationRole, keys: jsonFlag(flags, "--keys"),
      });
    }
    case "remove-citation": {
      return document => removeCitation(document, pathFlag(flags), intFlag(flags, "--offset"));
    }
    case "update-footnote": {
      return (document) => updateFootnoteDefinition(document, pathFlag(flags), textOrContent(flags));
    }
    case "remove-footnote": return document => removeFootnote(document, pathFlag(flags));
    case "insert-divider": {
      return (document) => insertDivider(document, insertionIndex(document, flags));
    }
    case "update-admonition-variant": {
      return (document) => updateAdmonitionVariant(document, pathFlag(flags), variantFlag(flags));
    }
    case "update-heading-level": {
      return (document) => updateHeadingLevel(
        document,
        pathFlag(flags),
        intFlag(flags, "--from"),
        intFlag(flags, "--to"),
      );
    }
    case "convert-block": {
      const to = flag(flags, "--to");
      if (to !== "paragraph" && to !== "heading") throw new Error("--to must be paragraph or heading");
      if ((to === "heading") !== flags.includes("--level")) {
        throw new Error("--level is required with --to heading and not allowed with --to paragraph");
      }
      return (document) => convertBlock(document, pathFlag(flags),
        to === "heading" ? { block: "heading", level: intFlag(flags, "--level") } : { block: "paragraph" });
    }
    case "insert-equation": {
      return (document) => {
        const at = insertionIndex(document, flags);
        const inserted = insertEquation(document, at, flag(flags, "--latex"));
        const label = optionalFlag(flags, "--label");
        return label !== undefined ? updateLabel(inserted, [at], label) : inserted;
      };
    }
    case "insert-figure": {
      const position = flag(flags, "--at") === "end" ? "end" : intFlag(flags, "--at");
      const label = optionalFlag(flags, "--label") ?? "";
      // One Core-backed edit and one file replacement, also when it sets the label.
      return (document) => {
        const at = position === "end" ? bodyEndIndex(document) : position;
        const inserted = insertFigure(document, at, {
          imageUrl: optionalFlag(flags, "--image") ?? "",
          imageAlt: optionalFlag(flags, "--alt") ?? "",
          mermaidSource: optionalFlag(flags, "--mermaid"),
          caption: captionInput(flags) ?? "",
        });
        return label.length > 0 ? updateLabel(inserted, [at], label) : inserted;
      };
    }
    case "update-media-references": {
      const from = flag(flags, "--from"), to = flag(flags, "--to");
      return document => updateMediaReferences(document, [{ from, to }]);
    }
    case "update-figure": {
      const changes = {
        imageUrl: optionalFlag(flags, "--image"),
        imageAlt: optionalFlag(flags, "--alt"),
        mermaidSource: optionalFlag(flags, "--mermaid"),
        caption: captionInput(flags),
      };
      if (Object.values(changes).every((value) => value === undefined)) {
        throw new Error("update-figure requires --image, --mermaid, --alt, --caption, or --caption-content");
      }
      return (document) => updateFigure(document, pathFlag(flags), changes);
    }
    case "insert-table": {
      // ADR-0024: --grid is a complex grid ({headerRows, rows:[{cells}]}); --cells and --align are a pipe grid's.
      const grid = optionalFlag(flags, "--grid");
      if ((grid === undefined) === (optionalFlag(flags, "--cells") === undefined)) throw new Error("exactly one of --cells or --grid is required");
      if (grid !== undefined && optionalFlag(flags, "--align") !== undefined) throw new Error("--grid sets alignment on its cells; --align is for --cells");
      return (document) => {
        const at = insertionIndex(document, flags);
        let inserted = grid !== undefined
          ? insertTable(document, at, { ...jsonFlag<Omit<ComplexTableInput, "grid">>(flags, "--grid"), grid: "complex" })
          : insertTable(document, at, jsonFlag(flags, "--cells"), optionalFlag(flags, "--align") === undefined ? undefined : jsonFlag(flags, "--align"));
        const caption = captionInput(flags);
        if (caption !== undefined) inserted = updateTableCaption(inserted, [at], caption);
        const label = optionalFlag(flags, "--label");
        return label !== undefined ? updateLabel(inserted, [at], label) : inserted;
      };
    }
    case "insert-list": {
      return (document) => insertList(document, insertionIndex(document, flags), jsonFlag<ListContent>(flags, "--list"));
    }
    case "update-list": {
      return (document) => updateList(document, pathFlag(flags), jsonFlag<ListContent>(flags, "--list"));
    }
    case "update-list-item-checked": {
      const item = flag(flags, "--item").split(",").map((part) => part.trim() === "" ? NaN : Number(part.trim()));
      if (item.some((index) => !Number.isInteger(index) || index < 0)) throw new Error("--item must be comma-separated non-negative integers");
      const checked = flag(flags, "--checked");
      if (checked !== "true" && checked !== "false") throw new Error("--checked must be true or false");
      return (document) => updateListItemChecked(document, pathFlag(flags), item, checked === "true");
    }
    case "insert-code-block": {
      return (document) => insertCodeBlock(document, insertionIndex(document, flags), {
        language: optionalFlag(flags, "--language") ?? "",
        code: flag(flags, "--code"),
      });
    }
    case "update-code-block": {
      const changes = { language: optionalFlag(flags, "--language"), code: optionalFlag(flags, "--code") };
      if (changes.language === undefined && changes.code === undefined) {
        throw new Error("update-code-block requires --language or --code");
      }
      return (document) => updateCodeBlock(document, pathFlag(flags), changes);
    }
    case "insert-table-row": {
      return (document) => insertTableRow(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "insert-table-column": {
      return (document) => insertTableColumn(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "remove-table-row": {
      return (document) => removeTableRow(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "remove-table-column": {
      return (document) => removeTableColumn(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "move-table-row": {
      return (document) => moveTableRow(document, pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "move-table-column": {
      return (document) => moveTableColumn(document, pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "update-table-alignment": {
      const align = flag(flags, "--align");
      if (!["left", "center", "right", "none"].includes(align)) throw new Error("--align must be left, center, right or none");
      return (document) => updateTableColumnAlignment(document, pathFlag(flags), intFlag(flags, "--column"),
        align === "none" ? null : align as "left" | "center" | "right");
    }
    case "update-reference-templates": {
      const templates: ReferenceTemplateUpdate = {};
      const reset = optionalFlag(flags, "--reset");
      if (reset !== undefined && !["figure", "table", "equation", "all"].includes(reset)) throw new Error("--reset must be figure, table, equation or all");
      for (const kind of ["figure", "table", "equation"] as const) {
        const template = optionalFlag(flags, `--${kind}`);
        if (reset === kind || reset === "all") {
          if (template !== undefined) throw new Error(`cannot set and reset ${kind} together`);
          templates[kind] = null;
        } else if (template !== undefined) templates[kind] = template;
      }
      if (!Object.keys(templates).length) throw new Error("provide a template or --reset");
      return document => updateReferenceTemplates(document, templates);
    }
    case "update-status": {
      if (flags.includes("--value") === flags.includes("--remove")) throw new Error("choose --value or --remove");
      return document => updateDocumentStatus(document, flags.includes("--remove") ? null : flag(flags, "--value") as DocumentStatus);
    }
    case "update-title": {
      if (flags.includes("--text") === flags.includes("--remove")) throw new Error("choose --text or --remove");
      return document => updateDocumentTitle(document, flags.includes("--remove") ? null : flag(flags, "--text"));
    }
    case "update-heading-numbering": {
      const enabled = flag(flags, "--enabled");
      if (enabled !== "true" && enabled !== "false") throw new Error("--enabled must be true or false");
      return (document) => updateHeadingNumbering(document, enabled === "true");
    }
    case "update-table-caption": {
      return (document) => updateTableCaption(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-table-note":
    case "update-table-note": {
      const change = command === "insert-table-note" ? insertTableNote : updateTableNote;
      return document => change(document, pathFlag(flags), intFlag(flags, "--at"), textOrContent(flags));
    }
    case "remove-table-note":
      return document => removeTableNote(document, pathFlag(flags), intFlag(flags, "--at"));
    case "move-table-note":
      return document => moveTableNote(document, pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to"));
    case "update-table-cell": {
      // --blocks replaces a cell's paragraphs and lists; --text and --content replace one paragraph.
      if (optionalFlag(flags, "--blocks") !== undefined) {
        if (optionalFlag(flags, "--text") !== undefined || optionalFlag(flags, "--content") !== undefined) throw new Error("use --blocks without --text or --content");
        return (document) => updateTableCellBlocks(document, pathFlag(flags), jsonFlag<TableCellBlock[]>(flags, "--blocks"));
      }
      return (document) => updateTableCell(document, pathFlag(flags), plainTextOrContent(flags));
    }
    case "insert-target": {
      return (document) => insertTarget(document, insertionIndex(document, flags), flag(flags, "--label"));
    }
    case "remove-block": {
      return (document) => removeBlock(document, intFlag(flags, "--at"));
    }
    case "move-section": {
      return (document) => moveSection(document, intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "remove-section": {
      return (document) => removeSection(document, intFlag(flags, "--at"), { deferEndnotes });
    }
    case "move-block": {
      return (document) => moveBlock(document, intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "update-node-text": {
      return (document) => updateNodeTextAtPath(
        document,
        pathFlag(flags),
        flag(flags, "--from"),
        flag(flags, "--to"),
      );
    }
    case "update-equation-latex": {
      return (document) => updateEquationLatex(
        document,
        pathFlag(flags),
        flag(flags, "--from"),
        flag(flags, "--to"),
      );
    }
    case "update-numbering-mode": {
      const mode = flag(flags, "--mode");
      if (mode !== "automatic" && mode !== "fixed") throw new Error("--mode must be automatic or fixed");
      return document => updateNumberingMode(document, mode);
    }
    case "update-enumerator": {
      return document => updateEnumerator(document, pathFlag(flags), flag(flags, "--enumerator"));
    }
    case "update-label": {
      const updateReferences = optionalFlag(flags, "--update-references");
      if (updateReferences !== undefined && updateReferences !== "true" && updateReferences !== "false") {
        throw new Error("--update-references must be true or false");
      }
      return (document) => updateLabel(document, pathFlag(flags), flag(flags, "--label"),
        { updateReferences: updateReferences === "true" });
    }
    default:
      throw new Error(`not a document edit command: ${command}`);
  }
}

/** Adapt JSON options to the existing CLI flag parser, without interpreting document semantics. */
function batchChange(operation: unknown): Change {
  if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("operation must be an object with a command");
  }
  const { command, ...options } = operation as Record<string, unknown>;
  if (typeof command !== "string") throw new Error("command must be a string");
  if (!isEditCommand(command)) {
    throw new Error(`not a document edit command: ${command}`);
  }
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(options)) {
    const name = `--${key}`;
    if (!COMMAND_OPTIONS[command].includes(name)) throw new Error(`unknown option: ${name}`);
    const json = ["content", "caption-content", "cells", "grid", "blocks", "list", "keys", "paths"].includes(key)
      || (command === "insert-table" && key === "align");
    if (json ? value === null || !["object", "string"].includes(typeof value)
      : !["string", "number", "boolean"].includes(typeof value)) {
      throw new Error(`${name} must be ${json ? "an object, array or string" : "a string, number or boolean"}`);
    }
    if (SWITCH_OPTIONS.has(name)) {
      if (value !== true) throw new Error(`${key} must be true`);
      tokens.push(name);
      continue;
    }
    tokens.push(name, json && typeof value !== "string" ? JSON.stringify(value) : String(value));
  }
  return changeFor(command, parseCommandArgs(command, ["batch-document", ...tokens]).flags, true);
}


const SWITCH_OPTIONS = new Set(["--dry-run", "--remove", "--all", "--ignore-case"]);

export const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  "apply-batch": ["--operations", "--if-revision", "--dry-run", "--format"],
  "insert-hard-break": ["--path", "--offset"],
  "split-paragraph": ["--path", "--offset"],
  "merge-paragraph": ["--path"],
  create: ["--template", "--language", "--input", "--format"],
  check: ["--format"],
  inspect: ["--format"],
  format: [],
  "replace-text": ["--from", "--to", "--all", "--ignore-case"],
  "insert-block": ["--at", "--text", "--content"],
  "insert-heading": ["--at", "--level", "--text", "--content"],
  "update-heading": ["--path", "--text", "--content"],
  "insert-admonition": ["--at", "--variant", "--text"],
  "update-admonition-variant": ["--path", "--variant"],
  "insert-quote": ["--at", "--text", "--content"],
  "update-quote": ["--path", "--text", "--content"],
  "insert-footnote": ["--path", "--offset", "--text", "--content"],
  "update-footnote": ["--path", "--text", "--content"],
  "remove-footnote": ["--path"],
  "update-bibliography": ["--paths"],
  "insert-citation": ["--path", "--offset", "--role", "--keys"],
  "update-citation": ["--path", "--offset", "--role", "--keys"],
  "remove-citation": ["--path", "--offset"],
  "insert-divider": ["--at"],
  "update-heading-level": ["--path", "--from", "--to"],
  "convert-block": ["--path", "--to", "--level"],
  "insert-equation": ["--at", "--latex", "--label"],
  "insert-figure": ["--at", "--image", "--mermaid", "--alt", "--caption", "--caption-content", "--label"],
  "update-figure": ["--path", "--image", "--mermaid", "--alt", "--caption", "--caption-content"],
  "update-media-references": ["--from", "--to"],
  "insert-table": ["--at", "--cells", "--grid", "--align", "--caption", "--caption-content", "--label"],
  "insert-list": ["--at", "--list"],
  "update-list": ["--path", "--list"],
  "update-list-item-checked": ["--path", "--item", "--checked"],
  "insert-code-block": ["--at", "--language", "--code"],
  "update-code-block": ["--path", "--language", "--code"],
  "insert-table-row": ["--path", "--at"],
  "remove-table-row": ["--path", "--at"],
  "remove-table-column": ["--path", "--at"],
  "move-table-row": ["--path", "--from", "--to"],
  "move-table-column": ["--path", "--from", "--to"],
  "update-table-alignment": ["--path", "--column", "--align"],
  "insert-table-column": ["--path", "--at"],
  "update-heading-numbering": ["--enabled"],
  "update-status": ["--value", "--remove"],
  "update-title": ["--text", "--remove"],
  "update-reference-templates": ["--figure", "--table", "--equation", "--reset"],
  "update-table-caption": ["--path", "--text", "--content"],
  "insert-table-note": ["--path", "--at", "--text", "--content"],
  "update-table-note": ["--path", "--at", "--text", "--content"],
  "remove-table-note": ["--path", "--at"],
  "move-table-note": ["--path", "--from", "--to"],
  "update-table-cell": ["--path", "--text", "--content", "--blocks"],
  "remove-block": ["--at"],
  "insert-target": ["--at", "--label"],
  "move-block": ["--from", "--to"],
  "move-section": ["--from", "--to"],
  "remove-section": ["--at"],
  "update-node-text": ["--path", "--from", "--to"],
  "update-equation-latex": ["--path", "--from", "--to"],
  "update-label": ["--path", "--label", "--update-references"],
  "update-numbering-mode": ["--mode"],
  "update-enumerator": ["--path", "--enumerator"],
};

export function isEditCommand(command: string): boolean {
  return Object.hasOwn(COMMAND_OPTIONS, command) && !["create", "check", "inspect", "apply-batch"].includes(command);
}

export function parseCommandArgs(command: string, args: string[]): ParsedArgs {
  const [file, ...tokens] = args;
  if (!file || file.startsWith("-")) {
    throw new Error(`unexpected argument: ${file ?? "<missing file>"}`);
  }

  const allowed = ["--bibliography-root", ...(COMMAND_OPTIONS[command] ?? []), ...(isEditCommand(command)
    ? ["--if-revision", "--dry-run", ...(tokens.includes("--dry-run") ? ["--format"] : [])] : [])];
  const seen = new Set<string>();
  const flags: string[] = [];
  let format: OutputFormat = "text";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    if (!allowed.includes(token)) {
      throw new Error(`unknown option: ${token}`);
    }
    if (seen.has(token)) {
      throw new Error(`duplicate option: ${token}`);
    }
    seen.add(token);
    flags.push(token);
    if (SWITCH_OPTIONS.has(token)) continue;

    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing ${token}`);
    }
    if (token === "--format") {
      if (value !== "text" && value !== "json") {
        throw new Error(`--format must be text or json`);
      }
      format = value;
    } else {
      if (token === "--if-revision" && (value.length !== 64 || !/^[0-9a-f]{64}$/.test(value))) {
        throw new Error("--if-revision must be 64 lowercase hexadecimal characters");
      }
      flags.push(value);
    }
    index += 1;
  }

  // Validate every filesystem input before any command can perform I/O.
  for (const input of [file, ...(optionalFlag(flags, "--bibliography-root") ? [flag(flags, "--bibliography-root")] : []), ...(command === "apply-batch" ? [flag(flags, "--operations")] : [])]) {
    assertUnicode(input);
  }
  return { file, flags, format };
}


export function flag(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index < 0 || value === undefined || value.startsWith("--")) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

/** Exactly one of --text (plain) or --content (Core InlineContent JSON). */
function captionInput(args: string[]): string | InlineContent[] | undefined {
  const text = optionalFlag(args, "--caption");
  const content = optionalFlag(args, "--caption-content");
  if (text !== undefined && content !== undefined) throw new Error("--caption and --caption-content are mutually exclusive");
  return content === undefined ? text : jsonFlag<InlineContent[]>(args, "--caption-content");
}

function textOrContent(args: string[]): InlineContent[] {
  const input = plainTextOrContent(args);
  return typeof input !== "string" ? input : input ? [{ kind: "text", text: input }] : [];
}

function plainTextOrContent(args: string[]): string | InlineContent[] {
  const text = optionalFlag(args, "--text");
  const content = optionalFlag(args, "--content");
  if ((text === undefined) === (content === undefined)) throw new Error("exactly one of --text or --content is required");
  return text ?? jsonFlag<InlineContent[]>(args, "--content");
}

function variantFlag(args: string[]): AdmonitionVariant {
  const value = flag(args, "--variant");
  if (!isAdmonitionVariant(value)) throw new Error(`--variant must be one of ${ADMONITION_VARIANTS.join(", ")}`);
  return value;
}

export function optionalFlag(args: string[], name: string): string | undefined {
  return args.includes(name) ? flag(args, name) : undefined;
}

function insertionIndex(document: Document, args: string[]): number {
  return flag(args, "--at") === "end" ? bodyEndIndex(document) : intFlag(args, "--at");
}

function intFlag(args: string[], name: string): number {
  const raw = flag(args, name);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function jsonFlag<T>(args: string[], name: string): T {
  try {
    return JSON.parse(flag(args, name)) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${name} must be JSON`);
    throw error;
  }
}

function pathFlag(args: string[]): NodePath {
  const raw = flag(args, "--path");
  const path = raw.split(",").map((part) => part.trim() === "" ? NaN : Number(part.trim()));
  if (path.length === 0 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error("--path must be comma-separated non-negative integers");
  }
  return path;
}


export function applyDocumentBatch(source: string, operations: unknown) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("--operations must be a non-empty JSON array");
  const original = parse(source);
  let document = original;
  let unchanged = true;
  const references = unresolvedReferences(document);
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    try {
      const next = batchChange(operation)(document);
      if (next === document && operation.command === "replace-text" && operation.all === true) continue;
      unchanged = false;
      document = next;
      validateStructure(document);
      document = placeEndnotes(document);
    } catch (error) {
      const command = operation !== null && typeof operation === "object" && "command" in operation
        && typeof operation.command === "string" ? operation.command : "<unknown>";
      throw new Error(`operation ${index + 1} (${command}): ${error instanceof Error ? error.message : String(error)}; nothing was written`, { cause: error });
    }
  }
  const markdown = unchanged ? source : serializeChange(original, () => document);
  return { markdown, applied: operations.length, references, unchanged };
}
