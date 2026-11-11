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
  reconcileEndnotes,
  placeEndnotes,
  removeFootnote,
  sectionMarker,
  sectionRange,
  blockTargets,
  targetNumbers,
  replaceText,
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
  updateTableCaption,
  updateHeadingNumbering,
  updateDocumentTitle,
  updateReferenceTemplates,
  referenceNumberText,
  captionNumberText,
  type NumberedKind,
  type ReferenceTemplateUpdate,
  updateBibliography,
  insertCitation,
  updateCitation,
  removeCitation,
  headingNumbers,
  sectionReferenceText,
  updateTableColumnAlignment,
  updateList,
  updateCodeBlock,
  unresolvedReferences,
  validateStructure,
  type Document,
  type AdmonitionVariant,
  type EditableBlock,
  type EditableDocument,
  type NodePath,
  type InlineContent,
  type CitationRole,
  type ListContent,
} from "@litzio/core";
import { assertUnicode } from "@litzio/file-commit";
type OutputFormat = "text" | "json";
type ParsedArgs = {file: string; flags: string[]; format: OutputFormat};
type Change = (document: Document) => Document;

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
      return (document) => replaceText(document, flag(flags, "--from"), flag(flags, "--to"));
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
      return (document) => {
        const at = insertionIndex(document, flags);
        let inserted = insertTable(document, at, jsonFlag(flags, "--cells"), optionalFlag(flags, "--align") === undefined ? undefined : jsonFlag(flags, "--align"));
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
    case "update-table-cell": {
      return (document) => updateTableCell(document, pathFlag(flags), textOrContent(flags));
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

export function serializeChange(document: Document, change: Change): string {
  const changed = reconcileEndnotes(document, change(document));
  validateStructure(changed);
  return serialize(changed);
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
    const json = ["content", "caption-content", "cells", "list", "keys", "paths"].includes(key)
      || (command === "insert-table" && key === "align");
    if (json ? value === null || !["object", "string"].includes(typeof value)
      : !["string", "number", "boolean"].includes(typeof value)) {
      throw new Error(`${name} must be ${json ? "an object, array or string" : "a string, number or boolean"}`);
    }
    if (name === "--remove") {
      if (value !== true) throw new Error("remove must be true");
      tokens.push(name);
      continue;
    }
    tokens.push(name, json && typeof value !== "string" ? JSON.stringify(value) : String(value));
  }
  return changeFor(command, parseCommandArgs(command, ["batch-document", ...tokens]).flags, true);
}


export const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  "apply-batch": ["--operations", "--if-revision", "--dry-run", "--format"],
  "insert-hard-break": ["--path", "--offset"],
  "split-paragraph": ["--path", "--offset"],
  "merge-paragraph": ["--path"],
  create: ["--template", "--language", "--input", "--format"],
  check: ["--format"],
  inspect: ["--format"],
  format: [],
  "replace-text": ["--from", "--to"],
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
  "insert-table": ["--at", "--cells", "--align", "--caption", "--caption-content", "--label"],
  "insert-list": ["--at", "--list"],
  "update-list": ["--path", "--list"],
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
  "update-title": ["--text", "--remove"],
  "update-reference-templates": ["--figure", "--table", "--equation", "--reset"],
  "update-table-caption": ["--path", "--text", "--content"],
  "update-table-cell": ["--path", "--text", "--content"],
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
    if (token === "--dry-run" || token === "--remove") continue;

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
export function captionInput(args: string[]): string | InlineContent[] | undefined {
  const text = optionalFlag(args, "--caption");
  const content = optionalFlag(args, "--caption-content");
  if (text !== undefined && content !== undefined) throw new Error("--caption and --caption-content are mutually exclusive");
  return content === undefined ? text : jsonFlag<InlineContent[]>(args, "--caption-content");
}

export function textOrContent(args: string[]): InlineContent[] {
  const text = optionalFlag(args, "--text");
  const content = optionalFlag(args, "--content");
  if ((text === undefined) === (content === undefined)) throw new Error("exactly one of --text or --content is required");
  return text !== undefined ? (text ? [{ kind: "text", text }] : []) : jsonFlag<InlineContent[]>(args, "--content");
}

export function variantFlag(args: string[]): AdmonitionVariant {
  const value = flag(args, "--variant");
  if (!isAdmonitionVariant(value)) throw new Error(`--variant must be one of ${ADMONITION_VARIANTS.join(", ")}`);
  return value;
}

export function optionalFlag(args: string[], name: string): string | undefined {
  return args.includes(name) ? flag(args, name) : undefined;
}

export function insertionIndex(document: Document, args: string[]): number {
  return flag(args, "--at") === "end" ? bodyEndIndex(document) : intFlag(args, "--at");
}

export function intFlag(args: string[], name: string): number {
  const raw = flag(args, name);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

export function jsonFlag<T>(args: string[], name: string): T {
  try {
    return JSON.parse(flag(args, name)) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${name} must be JSON`);
    throw error;
  }
}

export function pathFlag(args: string[]): NodePath {
  const raw = flag(args, "--path");
  const path = raw.split(",").map((part) => part.trim() === "" ? NaN : Number(part.trim()));
  if (path.length === 0 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error("--path must be comma-separated non-negative integers");
  }
  return path;
}


type MachineNode = {
  path: number[];
  type: string;
  editable?: boolean;
  text?: string;
  [key: string]: unknown;
};

/** Convert Core's displayed section offsets to snapshot locators used by CLI operations. */
export function snapshotSection(document: EditableDocument, index: number) {
  const range = sectionRange(document.blocks.map(sectionMarker), index);
  return { start: document.blocks[range.start].path[0],
    end: document.blocks[range.end]?.path[0] ?? (document.blocks.at(-1)?.path[0] ?? 0) + 1 };
}

export function machineNodes(document: EditableDocument): MachineNode[] {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  const headings = headingNumbers(document.blocks, document.headingNumbering);
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = machineBlock(block);
    return [{
      ...first,
      ...("enumerator" in block && block.enumerator !== undefined ? { enumerator: block.enumerator } : {}),
      ...(block.block === "heading" ? { referenceText: sectionReferenceText(block.text, headings[index]) } : {}),
      ...(headings[index] ? { headingNumber: headings[index] } : {}),
      ...(typeof markers[index] === "number" ? { section: snapshotSection(document, index) } : {}),
      ...(Object.keys(numbers[index]).length > 0 ? { numbers: numbers[index] } : {}),
      ...((block.block === "figure" || block.block === "table") && numbers[index][block.block] !== undefined
        ? { captionNumberText: captionNumberText(block.block, numbers[index][block.block]!, document.referenceTemplates) } : {}),
      ...("label" in block && block.label && numbers[index][block.block as NumberedKind] !== undefined
        ? { referenceText: referenceNumberText(block.block as NumberedKind, numbers[index][block.block as NumberedKind]!, document.referenceTemplates) } : {}),

    }, ...rest];
  });
}

function machineBlock(block: EditableBlock): MachineNode[] {
  const base = { path: [...block.path], type: block.block };
  if (block.block === "heading") {
    return [{ ...base, level: block.level, editable: block.editable, text: block.text }];
  }
  if (block.block === "paragraph") {
    return [{ ...base, editable: block.editable, text: block.text }];
  }
  if (block.block === "admonition") {
    return [{ ...base, variant: block.variant, text: block.text }];
  }
  if (block.block === "figure") {
    return [
      {
        ...base,
        editable: block.editable,
        label: block.label,
        contentKind: block.contentKind,
        ...(block.mermaidSource !== undefined ? { mermaidSource: block.mermaidSource } : {}),
        imageUrl: block.imageUrl,
        imageAlt: block.imageAlt,
      },
      {
        path: [...block.caption.path],
        type: "caption",
        editable: block.caption.editable,
        text: block.caption.text,
      },
    ];
  }
  if (block.block === "equation") {
    return [{ ...base, label: block.label, latex: block.latex }];
  }
  if (block.block === "table") {
    return [
      { ...base, ...(block.label ? { label: block.label } : {}), ...(block.caption ? { caption: block.caption } : {}) },
      ...block.rows.flatMap((row) =>
        row.cells.map((cell) => ({
          path: [...cell.path],
          type: "cell",
          header: cell.header,
          editable: cell.editable,
          text: cell.text,
        })),
      ),
    ];
  }
  if (block.block === "quote") {
    return [{ ...base, editable: block.editable, text: block.text }];
  }
  if (block.block === "footnote") {
    return [{ ...base, label: block.label, editable: block.editable, text: block.text }];
  }
  if (block.block === "divider") {
    return [base];
  }
  if (block.block === "code") {
    return [{ ...base, language: block.language, code: block.code }];
  }
  if (block.block === "target") {
    return [{ ...base, label: block.label }];
  }
  if (block.block === "list") {
    return [{ ...base, ordered: block.ordered, ...(block.ordered ? { start: block.start, style: block.style ?? "decimal", delimiter: block.delimiter ?? "." } : {}), items: block.items }];
  }
  throw new Error("Unknown native block");
}


export function applyDocumentBatch(source: string, operations: unknown) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("--operations must be a non-empty JSON array");
  const original = parse(source);
  let document = original;
  const references = unresolvedReferences(document);
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    try {
      document = batchChange(operation)(document);
      validateStructure(document);
      document = placeEndnotes(document);
    } catch (error) {
      const command = operation !== null && typeof operation === "object" && "command" in operation
        && typeof operation.command === "string" ? operation.command : "<unknown>";
      throw new Error(`operation ${index + 1} (${command}): ${error instanceof Error ? error.message : String(error)}; nothing was written`, { cause: error });
    }
  }
  const result = serializeChange(original, () => document);
  return { markdown: result, applied: operations.length, references };
}
