import { DocumentDiagnosticError, DocumentWriteError } from "../write-error.ts";
import { Document, isMap, isNode, isScalar, parseDocument, visit, type Pair, type Node } from "yaml";
import { FRONT_MATTER_FIELD, IMPLICIT_FRONT_MATTER } from "./constants.ts";
import type { MystDocument, MystNode } from "./tree.ts";

/**
 * myst-parser replaces its `front_matter` token with an ordinary `yaml` fence, so the
 * tree alone cannot tell front matter from a leading ```yaml block. The source can:
 * of the block rules, only front matter opens a code block with `-` (fences open with
 * ``` or ~~~, indented code with spaces), and it only starts at the first line.
 */
export function markFrontMatter(document: MystDocument, source: string): void {
  const first = document.children[0];
  if (first?.type === "code" && first.position?.start.line === 1 && source.startsWith("-")) {
    const lines = source.split(/\r?\n/);
    const opener = /^(-{3,})[\t ]*$/.exec(lines[0]);
    // An indented marker can belong to a YAML block scalar. The upstream rule
    // also accepts it as a closer; do not reinterpret that ambiguous input.
    const closer = /^(-{3,})[\t ]*$/.exec(lines[(first.position.end.line ?? 1) - 1]);
    first[FRONT_MATTER_FIELD] = opener && closer && first.position.end.line > 1 &&
      closer[1].length >= opener[1].length ? true : "unclosed or unsupported delimiter";
    if (first[FRONT_MATTER_FIELD] === true) {
      // MyST's code conversion trims a trailing blank line. In YAML a block scalar
      // (notably |+) can give that newline meaning. Keep the complete metadata value;
      // the marker above keeps its role and required document-start context semantic.
      const content = lines.slice(1, first.position.end.line - 1);
      first.value = content.length ? `${content.join("\n")}\n` : "";
    }
  }
}

/** Reserve the metadata slot without changing the body's source lines. */
export function ensureFrontMatter(document: MystDocument): void {
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== undefined) return;
  document.children.unshift({ type: "code", lang: "yaml", value: "{}\n",
    [FRONT_MATTER_FIELD]: true, [IMPLICIT_FRONT_MATTER]: true });
}

/** Shared YAML document for semantic metadata edits; preserves comments and unrelated settings. */
export function metadata(document: MystDocument) {
  const node = document.children[0];
  if (node?.[FRONT_MATTER_FIELD] !== true) throw new DocumentDiagnosticError("native-metadata", "Native frontmatter is required");
  const yaml = parseDocument(String(node.value ?? ""));
  if (yaml.errors.length || !isMap(yaml.contents)) throw new DocumentDiagnosticError("native-metadata", "Invalid native frontmatter");
  return { node, yaml };
}

/** The frontmatter fields Litzio interprets; others belong to other tools. */
const LITZIO_FIELDS: unknown[] = ["title", "numbering", "bibliography", "template", "status"];

function pairOf(yaml: Document, key: string): Pair | undefined {
  return isMap(yaml.contents) ? yaml.contents.items.find(pair => (isScalar(pair.key) ? pair.key.value : pair.key) === key) : undefined;
}

/** Source lines of a top-level pair: from its key's line through the line ending its value and that value's comments. */
function lines(source: string, pair: Pair): [number, number] | undefined {
  const key = (pair.key as Node | null)?.range, value = (pair.value as Node | null)?.range ?? key;
  if (!key || !value) return undefined;
  const start = source.lastIndexOf("\n", key[0] - 1) + 1;
  // Only a key that starts its line can be replaced by whole lines.
  if (source.slice(start, key[0]).trim()) return undefined;
  const end = value[2];
  // The YAML range includes any blank lines consumed by a keep-chomp block scalar.
  if (source[end - 1] === "\n") return [start, end];
  const newline = source.indexOf("\n", end);
  return [start, newline === -1 ? source.length : newline + 1];
}

/** The pair alone; comment lines above its key stay in the source outside the replaced lines. */
function pairSource(yaml: Document, pair: Pair): string {
  const copy = pair.clone(yaml.schema);
  if (isNode(copy.key)) { copy.key.commentBefore = undefined; copy.key.spaceBefore = false; }
  const single = new Document({});
  (single.contents as { items: Pair[] }).items.push(copy);
  return String(single);
}

/**
 * Write an edited metadata document back to the front matter node. Only the lines of the one
 * changed top-level key are replaced, and a new key follows the last field, so other fields,
 * including ones Litzio does not interpret, keep their exact source. When the replacement does
 * not read back as the edited YAML, the whole YAML is written, and only when Litzio's fields
 * are all there is: the YAML reading cannot keep every value of another tool's field (a 64-bit
 * integer, `1.0`, `0x1F`), so such a document refuses the edit instead.
 */
export function writeMetadata(node: MystNode, yaml: Document, key: string): void {
  if (node[IMPLICIT_FRONT_MATTER] === true) {
    if (isMap(yaml.contents) && yaml.contents.items.length) {
      yaml.contents.flow = false;
      node.value = String(yaml);
      delete node[IMPLICIT_FRONT_MATTER];
    }
    return;
  }
  const source = String(node.value ?? "");
  const before = parseDocument(source);
  const old = pairOf(before, key), next = pairOf(yaml, key);
  let written: string | undefined;
  if (isMap(before.contents) && !before.contents.flow) {
    const last = before.contents.items.at(-1);
    const end = last ? lines(source, last)?.[1] : source.length;
    const span = old ? lines(source, old) : end === undefined ? undefined : [end, end];
    const text = next ? pairSource(yaml, next) : "";
    if (span) {
      const head = source.slice(0, span[0]);
      written = (old || !head || head.endsWith("\n") ? head : `${head}\n`) + text + source.slice(span[1]);
    }
  }
  if (written === undefined || !readsBack(written, yaml)) {
    if (isMap(yaml.contents) && yaml.contents.items.some(pair => !LITZIO_FIELDS.includes(isScalar(pair.key) ? pair.key.value : pair.key))) {
      throw new DocumentWriteError("Document metadata can change only when each frontmatter field starts its own line, so that fields of other tools keep their source", {
        code: "native-metadata", path: [0], action: "Write the frontmatter with one field per line (key: value), then retry.",
      });
    }
    written = String(yaml);
  }
  // Keep the block-zero slot when deleting the last field leaves only an empty map.
  if (old && !next && written.trim() === "{}") {
    node.value = "{}\n";
    node[IMPLICIT_FRONT_MATTER] = true;
    return;
  }
  node.value = written;
}

function readsBack(source: string, yaml: Document): boolean {
  const reparsed = parseDocument(source);
  return !reparsed.errors.length && spelling(reparsed) === spelling(yaml);
}

/** Comments and values as the YAML writer spells them. Blank lines between fields stay where the
 * source has them, so they do not count. */
function spelling(yaml: Document): string {
  const copy = yaml.clone();
  visit(copy, { Node(_, node) { node.spaceBefore = false; } });
  return String(copy);
}
