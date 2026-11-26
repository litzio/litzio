import type { Document, NodePath } from "../document.ts";
import type { InlineContent } from "../inline.ts";
import { updateParagraphInlineContent, updateTableCell } from "../operations.ts";
import { semanticDifference, semanticFingerprint } from "./fingerprint.ts";
import { assertNativeDocument } from "./native.ts";
import { parse, sourcePosition } from "./parse.ts";
import { plainRoundTrip } from "./serialize.ts";
import { tableOf } from "./table.ts";
import { isComplexGrid } from "./table-grid.ts";
import type { MystDocument, MystNode } from "./tree.ts";

type Span = { start: number; end: number };
export type LocalWriteKind = "paragraph" | "cell";
export type LocalWriteEdit = { kind: LocalWriteKind; path: NodePath; content: InlineContent[] };
type LocalWriteResult =
  | { reason: string }
  | { markdown: string; baseline: LocalWriteBaseline; kind: LocalWriteKind; blockCount: number };

const marker = "---\nlitzio: 1\n---\n\n";
const inlineTypes = new Set(["text", "strong", "emphasis", "delete", "inlineCode", "inlineMath", "link"]);
const ordinaryText = /^[\p{L}\p{M}\p{N}\p{So}\p{Sk} .,!?;:'"’“”()–—…\-]+$/u;
const oneLineMath = /^[\p{L}\p{N} =+^_{}\\.,()\-]+$/u;

/** Map complete lines to string offsets. Splicing these boundaries preserves the exact
 * UTF-8 bytes on either side, including when the original contains astral characters. */
function blockSpans(source: string, document: MystDocument): (Span | undefined)[] {
  const starts = [0];
  for (let offset = source.indexOf("\n"); offset !== -1; offset = source.indexOf("\n", offset + 1)) starts.push(offset + 1);
  return document.children.map(node => {
    const position = sourcePosition(node);
    if (!position) return undefined;
    const start = starts[position.start.line - 1];
    let end = starts[position.end.line] ?? source.length;
    while (end > start && source[end - 1] === "\n") end--;
    return start !== undefined && end > start ? { start, end } : undefined;
  });
}

function hasFootnote(node: MystNode): boolean {
  return node.type === "footnoteReference" || node.type === "footnoteDefinition" || (node.children ?? []).some(hasFootnote);
}

function singleLineInline(node: MystNode, prose: boolean): boolean {
  return (node.children ?? []).every(child => inlineTypes.has(child.type) &&
    (prose || child.type === "text" || child.type === "inlineMath") &&
    (child.value === undefined || typeof child.value === "string" &&
      (child.type === "inlineMath" ? oneLineMath : ordinaryText).test(child.value)) &&
    (child.type !== "link" || typeof child.url === "string" && /^https?:\/\//.test(child.url) &&
      !/\s/.test(child.url) && child.title === undefined) && singleLineInline(child, prose));
}

function inlineBlock(node: MystNode, edit: LocalWriteEdit): MystNode | undefined {
  if (edit.kind === "paragraph") return node.type === "paragraph" && edit.path.length === 1 ? node : undefined;
  const [, row, column] = edit.path;
  const cell = edit.path.length === 3 ? tableOf(node)?.children?.[row]?.children?.[column] : undefined;
  return cell?.children?.length === 1 && cell.children[0].type === "paragraph" ? cell.children[0] : cell;
}

/** A disposable Core snapshot tied to exact canonical source. The Host owns its revision
 * and may promote the baseline returned by write only after full verification. */
export class LocalWriteBaseline {
  private constructor(
    readonly source: string,
    private readonly document: MystDocument,
    private readonly spans: (Span | undefined)[],
  ) {}

  static fromCanonical(source: string, verified: Document): LocalWriteBaseline | undefined {
    try {
      // A document-wide retry can change how distant blocks are escaped.
      const { markdown, reparsed: document } = plainRoundTrip(verified as unknown as MystDocument);
      if (markdown !== source) return undefined;
      assertNativeDocument(document);
      return new LocalWriteBaseline(source, document, blockSpans(source, document));
    } catch { return undefined; }
  }

  /** The Core document of exactly this source, for read models of an accepted local write. */
  get model(): Document {
    return this.document as unknown as Document;
  }

  write(edit: LocalWriteEdit): LocalWriteResult {
    const { source, document, spans } = this;
    const index = edit.path[0];
    const first = index - 1;
    const last = Math.min(index + 1, spans.length - 1);
    const current = document.children[index];
    const span = spans[index], left = spans[first], right = spans[last];
    // An unknown extent or separator cannot establish a safe replacement boundary.
    if (index < 1 || !current || !span || !left || !right ||
        !/^\n+$/.test(source.slice(left.end, span.start)) ||
        (last > index && !/^\n+$/.test(source.slice(span.end, right.start)))) return { reason: "unknown-range" };
    // A list can take ownership of adjacent material. Endnote changes can remove
    // or relocate definitions well beyond the window.
    if (document.children[first].type === "list" || document.children[index + 1]?.type === "list") return { reason: "list-neighbour" };
    if (hasFootnote(current)) return { reason: "footnote-dependency" };
    // ADR-0024: a complex table's cells have start columns and blocks; it takes the full Save.
    if (isComplexGrid(tableOf(current))) return { reason: "complex-table" };
    const prose = edit.kind === "paragraph";
    const before = inlineBlock(current, edit);
    if (!before || !singleLineInline(before, prose) || (prose && source.slice(span.start, span.end).includes("\n"))) {
      return { reason: "existing-inline-syntax" };
    }
    let changed: MystNode;
    let replacement: string;
    try {
      const fragment: MystDocument = { type: "root", children: [current] };
      changed = (prose
        ? updateParagraphInlineContent(fragment, [0], edit.content)
        : updateTableCell(fragment, [0, ...edit.path.slice(1)], edit.content)).children[0];
      if (hasFootnote(changed)) return { reason: "footnote-dependency" };
      const after = inlineBlock(changed, edit);
      if (!after || !singleLineInline(after, prose) || (prose && !after.children?.length)) return { reason: "new-inline-syntax" };
      assertNativeDocument({ type: "root", children: [document.children[0], changed] });
      replacement = plainRoundTrip({ type: "root", children: [changed] }).markdown.slice(0, -1);
      // Reference definitions/targets can change how distant links are interpreted.
      if (/\[\^|\]\[|^\s*(?:\[[^\]]+\]:|\([^)]+\)=)/m.test(replacement) ||
          (prose && replacement.includes("\n"))) return { reason: "source-syntax" };
    } catch { return { reason: "block-rejected-or-needs-retry" }; }

    const delta = replacement.length - (span.end - span.start);
    const prefix = first === 0 ? "" : marker;
    const offset = prefix.length - left.start;
    const window = prefix + source.slice(left.start, span.start) + replacement + source.slice(span.end, right.end) + "\n";
    try {
      const reloaded = parse(window);
      assertNativeDocument(reloaded);
      const found = blockSpans(window, reloaded);
      const skip = first === 0 ? 0 : 1;
      if (found.length !== last - first + 1 + skip) return { reason: "window-boundary" };
      for (let i = first; i <= last; i++) {
        const original = spans[i]!;
        const j = i - first + skip;
        const actual = found[j];
        if (!actual || actual.start !== original.start + offset + (i > index ? delta : 0) ||
            actual.end !== original.end + offset + (i >= index ? delta : 0)) return { reason: "window-boundary" };
        if (semanticDifference(semanticFingerprint(i === index ? changed : document.children[i]), semanticFingerprint(reloaded.children[j]))) {
          return { reason: "window-meaning" };
        }
      }
      const markdown = source.slice(0, span.start) + replacement + source.slice(span.end);
      const shifted = spans.map((old, i) => !old || i < index ? old :
        { start: old.start + (i > index ? delta : 0), end: old.end + delta });
      const children = document.children.slice();
      // Only the range map is authoritative for positions after splicing.
      children[index] = reloaded.children[index - first + skip];
      return { markdown, baseline: new LocalWriteBaseline(markdown, { ...document, children }, shifted),
        kind: edit.kind, blockCount: children.length - 1 };
    } catch { return { reason: "window-rejected" }; }
  }
}
