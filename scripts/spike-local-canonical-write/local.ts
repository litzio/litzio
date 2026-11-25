import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { semanticFingerprint } from "../../packages/core/src/myst/fingerprint.ts";
import { labelIdentifier } from "../../packages/core/src/myst/label.ts";
import { assertNativeDocument, canonicalNativeSnapshot } from "../../packages/core/src/myst/native.ts";
import { parse } from "../../packages/core/src/myst/parse.ts";
import { roundTrip, writeRoundTrip } from "../../packages/core/src/myst/serialize.ts";
import { toText, type MystDocument, type MystNode } from "../../packages/core/src/myst/tree.ts";
import { textRevision } from "../../packages/file-commit/src/index.ts";

const marker = "---\nlitzio: 1\n---\n\n";
const plain = { alternate: false, lineStarts: false };
const fingerprint = (node: MystNode) => createHash("sha256")
  .update(JSON.stringify(semanticFingerprint(node))).digest("hex");

export type EditKind = "paragraph" | "inline" | "cell" | "heading" | "list" |
  "caption" | "equation" | "admonition" | "structure" | "other";
export type Edit = {
  index: number;
  kind: EditKind;
  variant: string;
  /** Apply the semantic edit at the index in either the full document or the fragment. */
  apply: (document: MystDocument, index: number) => MystDocument;
};
export type Range = { start: number; end: number; before: string; after: string; fingerprint: string };
type Ranges = (Range | undefined)[];
export type Snapshot = {
  bytes: Buffer; document: MystDocument; ranges: Ranges; plain: boolean; hasLocalLinks: boolean;
};
export type Timings = {
  eligibility: number; block: number; window: number; ranges: number; assemble: number; revision: number;
};
type Candidate = { snapshot: Snapshot; revision: string; timings: Timings };

/** Positions are line-based and inclusive. The canonical source is UTF-8 with LF. */
export function blockRanges(bytes: Buffer, document: MystDocument): Ranges {
  const starts = [0];
  for (let offset = bytes.indexOf(10); offset !== -1; offset = bytes.indexOf(10, offset + 1)) {
    starts.push(offset + 1);
  }
  const located = document.children.map(node => {
    const pos = node.position;
    if (!pos) return undefined;
    const start = starts[pos.start.line - 1];
    let end = starts[pos.end.line] ?? bytes.length;
    while (end > start && bytes[end - 1] === 10) end--;
    return start !== undefined && end > start ? { start, end } : undefined;
  });
  const separator = (start: number | undefined, end: number | undefined) => {
    if (start === undefined || end === undefined || end < start) return undefined;
    const value = bytes.toString("utf8", start, end);
    return /^\n*$/.test(value) ? value : undefined;
  };
  return located.map((span, index) => {
    if (!span) return undefined;
    const before = separator(index ? located[index - 1]?.end : 0, span.start);
    const after = separator(span.end, index + 1 < located.length ? located[index + 1]?.start : bytes.length);
    if (before === undefined || after === undefined) return undefined;
    return { ...span, before, after, fingerprint: fingerprint(document.children[index]) };
  });
}

/** Open the experiment only on previously approved, byte-stable native output. */
export function openSnapshot(source: string): Snapshot {
  const input = parse(source);
  const verified = canonicalNativeSnapshot(input);
  let firstAttempt = false;
  try { firstAttempt = writeRoundTrip(verified.reparsed, undefined, plain).markdown === verified.markdown; }
  catch { /* A document-wide retry is required. */ }
  const bytes = Buffer.from(verified.markdown);
  const document = parse(verified.markdown, true);
  return { bytes, document, ranges: blockRanges(bytes, document), plain: firstAttempt, hasLocalLinks: localLinks(document) };
}

const acceptedInline = new Set(["text", "strong", "emphasis", "delete", "inlineCode", "inlineMath", "link"]);
const ordinaryText = /^[\p{L}\p{M}\p{N}\p{So}\p{Sk} .,!?;:'"’“”()–—…\-]+$/u;
const oneLineMath = /^[\p{L}\p{N} =+^_{}\\.,()\-]+$/u;

function hasFootnote(node: MystNode): boolean {
  return node.type === "footnoteReference" || node.type === "footnoteDefinition" ||
    (node.children ?? []).some(hasFootnote);
}

function hasLineBreak(node: MystNode): boolean {
  return node.type === "break" || typeof node.value === "string" && /[\r\n]/.test(node.value) ||
    (node.children ?? []).some(hasLineBreak);
}

function localLinks(node: MystNode): boolean {
  return node.type === "crossReference" || node.type === "link" && typeof node.url === "string" && node.url.includes("#") ||
    (node.children ?? []).some(localLinks);
}

function singleLineInline(node: MystNode, formatted: boolean): boolean {
  return (node.children ?? []).every(child => acceptedInline.has(child.type) &&
    (formatted || child.type === "text") &&
    (child.value === undefined || typeof child.value === "string" &&
      (child.type === "inlineMath" ? oneLineMath : ordinaryText).test(child.value)) &&
    (child.type !== "link" || typeof child.url === "string" && /^https?:\/\//.test(child.url) &&
      !/[\s\r\n]/.test(child.url) && child.title === undefined) &&
    singleLineInline(child, formatted));
}

export function fallback(snapshot: Snapshot, edit: Edit, enabled: ReadonlySet<EditKind>): string | undefined {
  const { document, ranges } = snapshot;
  const { index, kind } = edit;
  const current = document.children[index];
  if (kind === "structure") return "structure";
  if (!snapshot.plain) return "document retry";
  if (!enabled.has(kind)) return "type disabled";
  if (!current || index < 1 || !ranges[index] || !ranges[index - 1] ||
      index + 1 < ranges.length && !ranges[index + 1]) return "unknown range";
  if (document.children[index - 1]?.type === "list" || document.children[index + 1]?.type === "list") return "list neighbour";
  if (hasFootnote(current)) return "footnote dependency";
  if (kind === "heading" && (snapshot.hasLocalLinks || document.children[index - 1]?.type === "mystTarget" ||
      current.identifier || current.label || !singleLineInline(current, false))) return "heading dependency";
  if ((kind === "paragraph" || kind === "inline") && !singleLineInline(current, kind === "inline")) return "existing inline syntax";
  return undefined;
}

/** A skipped policy decision can be probed, but its result cannot become an accepted write. */
export function tryLocal(snapshot: Snapshot, edit: Edit, enabled: ReadonlySet<EditKind>, probe = false):
  { candidate?: Candidate; reason?: string } {
  const started = performance.now();
  const reason = fallback(snapshot, edit, enabled);
  if (reason && !probe) return { reason };
  const { index, kind } = edit;
  const { bytes, document, ranges } = snapshot;
  const first = Math.max(0, index - 1);
  const last = Math.min(index + 1, ranges.length - 1);
  const original = ranges[index];
  const windowStart = ranges[first]?.start;
  const windowEnd = ranges[last]?.end;
  if (!original || windowStart === undefined || windowEnd === undefined || kind === "structure" || index < 1) {
    return { reason: reason ?? "unknown range" };
  }
  const current = document.children[index];
  let checkpoint = performance.now();
  const timings = { eligibility: checkpoint - started } as Timings;
  const elapsed = () => {
    const time = performance.now();
    const duration = time - checkpoint;
    checkpoint = time;
    return duration;
  };
  let changed: MystNode;
  let fragment: Buffer;
  try {
    const replacement = edit.apply({ type: "root", children: [current] }, 0);
    if (replacement.children.length !== 1) return { reason: reason ?? "structure" };
    changed = replacement.children[0];
    if (!changed || changed.type !== current.type || changed.kind !== current.kind) return { reason: reason ?? "structure" };
    if (!probe) {
      if (hasFootnote(changed)) return { reason: "footnote dependency" };
      if ((kind === "paragraph" || kind === "inline") &&
          (!singleLineInline(changed, kind === "inline") || !changed.children?.length)) return { reason: "new inline syntax" };
      if (hasLineBreak(changed)) return { reason: "line break" };
      if (kind === "heading" && (!singleLineInline(changed, false) ||
        labelIdentifier(toText(current.children ?? [])) !== labelIdentifier(toText(changed.children ?? [])))) {
        return { reason: "heading identity" };
      }
      if (kind === "equation" && (typeof changed.value !== "string" || !oneLineMath.test(changed.value))) {
        return { reason: "LaTeX outside one-line subset" };
      }
    }
    assertNativeDocument({ type: "root", children: [document.children[0], changed] });
    const written = probe ? roundTrip({ type: "root", children: [changed] })
      : writeRoundTrip({ type: "root", children: [changed] }, undefined, plain);
    fragment = Buffer.from(written.markdown.slice(0, -1));
    if (!probe && (/\[\^|\]\[|^\s*(?:\[[^\]]+\]:|\([^)]+\)=)/m.test(fragment.toString("utf8")) ||
      ((kind === "paragraph" || kind === "inline") && fragment.includes(10)))) return { reason: "source syntax" };
  } catch {
    return { reason: reason ?? "block rejected or needs retry" };
  }
  timings.block = elapsed();
  const delta = fragment.length - (original.end - original.start);
  const prefix = first === 0 ? Buffer.alloc(0) : Buffer.from(marker);
  const window = Buffer.concat([prefix, bytes.subarray(windowStart, original.start), fragment,
    bytes.subarray(original.end, windowEnd), Buffer.from("\n")]);
  let reread: MystDocument;
  let rereadRanges: Ranges;
  try {
    reread = parse(window.toString("utf8"), true);
    assertNativeDocument(reread);
    rereadRanges = blockRanges(window, reread);
    const skip = first === 0 ? 0 : 1;
    if (reread.children.length !== last - first + 1 + skip) return { reason: reason ?? "window boundary" };
    const expected = fingerprint(changed);
    for (let oldIndex = first; oldIndex <= last; oldIndex++) {
      const old = ranges[oldIndex];
      const found = rereadRanges[oldIndex - first + skip];
      const offset = prefix.length - windowStart;
      if (!old || !found || found.start !== old.start + offset + (oldIndex > index ? delta : 0) ||
        found.end !== old.end + offset + (oldIndex >= index ? delta : 0)) return { reason: reason ?? "window boundary" };
      if (found.fingerprint !== (oldIndex === index ? expected : old.fingerprint)) return { reason: reason ?? "window meaning" };
    }
  } catch {
    return { reason: reason ?? "window rejected" };
  }
  timings.window = elapsed();
  const finalRanges = ranges.map((range, i) => !range || i < index ? range :
    { ...range, start: range.start + (i > index ? delta : 0), end: range.end + delta,
      fingerprint: i === index ? fingerprint(changed) : range.fingerprint });
  const children = document.children.slice();
  // Model positions are meaningful only in the range map after the first replacement.
  children[index] = reread.children[index - first + (first === 0 ? 0 : 1)];
  timings.ranges = elapsed();
  const output = Buffer.concat([bytes.subarray(0, original.start), fragment, bytes.subarray(original.end)]);
  const source = output.toString("utf8");
  timings.assemble = elapsed();
  const revision = textRevision(source);
  timings.revision = elapsed();
  return { reason, candidate: { snapshot: { bytes: output, plain: snapshot.plain, ranges: finalRanges,
    hasLocalLinks: snapshot.hasLocalLinks || localLinks(changed),
    document: { ...document, children } }, revision, timings } };
}
