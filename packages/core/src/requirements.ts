import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { NodePath } from "./document.ts";
import type { EditableBlock, EditableDocument } from "./editable.ts";
import type { RequirementContent, RequirementSource, RequirementStrength, RequirementType } from "./myst/requirement.ts";
import { formatSource } from "./myst/requirement.ts";

/**
 * Requirements traceability (spike): editor-neutral analysis of a standard requirements document
 * (the left document) against a system requirements document (the right one). Both are
 * ordinary Litzio documents. Only one level is modelled: standard sentence -> system requirement.
 *
 * Source spans are addressed as `document#anchor~sN@hash`:
 * - `anchor` is a `(label)=` target directly before a top-level standard paragraph (persistent);
 * - `N` is the 1-based sentence ordinal inside that paragraph;
 * - `hash` is a SHA-256 content hash (12 hex digits) of the normalized sentence, so a changed sentence is detected
 *   and a sentence that only moved inside its paragraph is found again by hash.
 */

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "fig", "figs", "no", "eq", "std", "cf", "approx", "max", "min", "al", "sec", "ref"]);

/** Collapse whitespace and apply NFC so formatting changes alone do not change a hash. */
export function normalizeSentence(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** SHA-256 of the normalized sentence, first 12 hex digits (same hash library as document authoring). */
export function sentenceHash(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(normalizeSentence(text)))).slice(0, 12);
}

/** Split technical English prose into sentences; abbreviations such as "e.g." do not end one. */
export function splitSentences(text: string): string[] {
  const flat = normalizeSentence(text);
  if (!flat) return [];
  const sentences: string[] = [];
  let start = 0;
  const end = /[.!?]["')\]]*(?=\s+[A-Z(\[])/g;
  for (let match = end.exec(flat); match; match = end.exec(flat)) {
    const stop = match.index + match[0].length;
    const last = flat.slice(start, match.index + 1).split(/\s+/).at(-1)!.replace(/^[("'\[]+/, "");
    const word = last.replace(/\.$/, "").toLowerCase();
    if (match[0][0] === "." && ABBREVIATIONS.has(word)) continue;
    sentences.push(flat.slice(start, stop).trim());
    start = stop;
  }
  const rest = flat.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

/** Table and text notes ("Note a: ...") are informative. */
const INFORMATIVE = /^(?:Note [a-z0-9]+:|NOTE\b)/;
const NORMATIVE = /\b(shall not|shall|should not|should|may)\b/;
/** IEEE word usage: shall = requirement, should = recommendation, may = permission. Lowercase only ("May" is a month). */
export function normativeStrength(sentence: string): RequirementStrength | undefined {
  if (INFORMATIVE.test(sentence)) return undefined;
  const word = NORMATIVE.exec(sentence)?.[1];
  return word === undefined ? undefined : word.startsWith("shall") ? "shall" : word.startsWith("should") ? "should" : "may";
}

export type StandardSentence = {
  anchor: string;
  sentence: number;
  text: string;
  hash: string;
  strength?: RequirementStrength;
};
export type StandardUnit = {
  path: NodePath;
  /** Persistent anchor; absent when no `(label)=` target precedes the paragraph. */
  anchor?: string;
  /** Leading number of the nearest preceding numbered heading, e.g. "6.4.2". */
  clause: string;
  clauseTitle: string;
  sentences: StandardSentence[];
};

const CLAUSE = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/;

/** Top-level standard paragraphs with their anchors and sentences. */
export function standardUnits(document: EditableDocument): StandardUnit[] {
  const units: StandardUnit[] = [];
  let clause = "", clauseTitle = "", label: string | undefined;
  for (const block of document.blocks) {
    if (block.block === "target") { label = block.label; continue; }
    if (block.block === "heading") {
      const match = CLAUSE.exec(block.text);
      if (match) { clause = match[1]; clauseTitle = match[2]; } else { clause = ""; clauseTitle = block.text; }
    } else if (block.block === "paragraph") {
      const anchor = label;
      const sentences = splitSentences(block.text).map((text, index) => {
        const strength = normativeStrength(text);
        return { anchor: anchor ?? "", sentence: index + 1, text, hash: sentenceHash(text), ...(strength ? { strength } : {}) };
      });
      units.push({ path: block.path, ...(anchor ? { anchor } : {}), clause, clauseTitle, sentences });
    }
    label = undefined;
  }
  return units;
}

export type SourceState = "ok" | "moved" | "changed" | "broken";
export type SourceCheck = {
  source: RequirementSource;
  state: SourceState;
  reason?: string;
  /** Sentence ordinal the span resolves to now (differs from source.sentence when moved). */
  sentence?: number;
  standardPath?: NodePath;
};
export type RequirementCheck = {
  id: string;
  title: string;
  status: RequirementContent["status"];
  strength: RequirementStrength;
  type: RequirementType;
  path: NodePath;
  sources: SourceCheck[];
};
export type SentenceState = "covered" | "uncovered" | "excluded";
export type SentenceCheck = StandardSentence & { path: NodePath; clause: string; state: SentenceState; requirements: string[] };
export type TraceIssueKind = "duplicate-id" | "orphan" | "broken-link" | "source-changed" | "source-moved" | "uncovered" | "unanchored" | "missing-parent" | "strength-mismatch";
export type TraceIssue = { kind: TraceIssueKind; severity: "error" | "warning"; id?: string; anchor?: string; sentence?: number; message: string };
export type TraceReport = {
  standard: string;
  counts: {
    requirements: number; linked: number; orphans: number; duplicates: number;
    sentences: number; covered: number; uncovered: number; excluded: number;
    broken: number; changed: number; moved: number; unanchored: number;
  };
  requirements: RequirementCheck[];
  sentences: SentenceCheck[];
  issues: TraceIssue[];
  ok: boolean;
};
/** A reviewed "제외": the normative sentence was decided not to become a requirement. Tied to its hash. */
export type Exclusion = { anchor: string; sentence: number; hash: string };

export function requirementBlocks(document: EditableDocument): Extract<EditableBlock, { block: "requirement" }>[] {
  return document.blocks.filter((block): block is Extract<EditableBlock, { block: "requirement" }> => block.block === "requirement");
}

const spanKey = (anchor: string, sentence: number) => `${anchor}~s${sentence}`;

/**
 * Check traceability of `system` against `standard`. `standardName` is the document path that
 * requirement source links must use; links to any other document are broken.
 */
export function checkTraceability(standard: EditableDocument, system: EditableDocument, standardName: string, exclusions: Exclusion[] = []): TraceReport {
  const units = standardUnits(standard);
  const byAnchor = new Map(units.flatMap(unit => unit.anchor ? [[unit.anchor, unit] as const] : []));
  const issues: TraceIssue[] = [];
  const blocks = requirementBlocks(system);
  const idCount = new Map<string, number>();
  for (const block of blocks) idCount.set(block.id, (idCount.get(block.id) ?? 0) + 1);
  for (const [id, count] of idCount) if (count > 1) issues.push({ kind: "duplicate-id", severity: "error", id, message: `Requirement ID ${id} is used ${count} times` });
  const ids = new Set(idCount.keys());
  const coveredBy = new Map<string, string[]>();
  const requirements: RequirementCheck[] = blocks.map(block => {
    const sources: SourceCheck[] = block.sources.map(source => {
      const unit = source.document === standardName ? byAnchor.get(source.anchor) : undefined;
      if (source.document !== standardName) return { source, state: "broken" as const, reason: `links to ${source.document}, not ${standardName}` };
      if (!unit) return { source, state: "broken" as const, reason: `anchor ${source.anchor} not found` };
      const same = unit.sentences[source.sentence - 1];
      if (same?.hash === source.hash) return { source, state: "ok" as const, sentence: source.sentence, standardPath: unit.path };
      const moved = unit.sentences.find(sentence => sentence.hash === source.hash);
      if (moved) return { source, state: "moved" as const, sentence: moved.sentence, standardPath: unit.path, reason: `sentence moved from ${source.sentence} to ${moved.sentence}` };
      return { source, state: "changed" as const, sentence: same ? source.sentence : undefined, standardPath: unit.path, reason: same ? "source sentence changed since linking" : "source sentence no longer exists" };
    });
    for (const check of sources) {
      const where = `${check.source.anchor}~s${check.source.sentence}`;
      if (check.state === "broken") issues.push({ kind: "broken-link", severity: "error", id: block.id, anchor: check.source.anchor, sentence: check.source.sentence, message: `${block.id}: ${check.reason}` });
      else if (check.state === "changed") issues.push({ kind: "source-changed", severity: "error", id: block.id, anchor: check.source.anchor, sentence: check.source.sentence, message: `${block.id}: ${where} ${check.reason}` });
      else if (check.state === "moved") issues.push({ kind: "source-moved", severity: "warning", id: block.id, anchor: check.source.anchor, sentence: check.source.sentence, message: `${block.id}: ${where} ${check.reason}` });
      if (check.state === "ok" || check.state === "moved") {
        const key = spanKey(check.source.anchor, check.sentence!);
        coveredBy.set(key, [...(coveredBy.get(key) ?? []), block.id]);
        const sentence = byAnchor.get(check.source.anchor)!.sentences[check.sentence! - 1];
        if (sentence?.strength && sentence.strength !== block.strength) {
          issues.push({ kind: "strength-mismatch", severity: "warning", id: block.id, anchor: check.source.anchor, sentence: check.sentence, message: `${block.id}: strength ${block.strength} differs from source "${sentence.strength}"` });
        }
      }
    }
    if (block.sources.length === 0) issues.push({ kind: "orphan", severity: "error", id: block.id, message: `${block.id}: no source link (orphan requirement)` });
    for (const parent of block.parents) if (!ids.has(parent)) issues.push({ kind: "missing-parent", severity: "error", id: block.id, message: `${block.id}: parent ${parent} does not exist` });
    return { id: block.id, title: block.title, status: block.status, strength: block.strength, type: block.type, path: block.path, sources };
  });
  const excluded = new Set(exclusions.map(item => `${spanKey(item.anchor, item.sentence)}@${item.hash}`));
  const sentences: SentenceCheck[] = [];
  let unanchored = 0;
  for (const unit of units) {
    const normative = unit.sentences.filter(sentence => sentence.strength);
    if (!unit.anchor) {
      if (normative.length) { unanchored++; issues.push({ kind: "unanchored", severity: "warning", message: `Normative paragraph at block ${unit.path[0]} (clause ${unit.clause || "-"}) has no anchor` }); }
      continue;
    }
    for (const sentence of normative) {
      const key = spanKey(unit.anchor, sentence.sentence), requirementsFor = coveredBy.get(key) ?? [];
      const state: SentenceState = requirementsFor.length ? "covered" : excluded.has(`${key}@${sentence.hash}`) ? "excluded" : "uncovered";
      sentences.push({ ...sentence, path: unit.path, clause: unit.clause, state, requirements: requirementsFor });
      if (state === "uncovered") issues.push({ kind: "uncovered", severity: "warning", anchor: unit.anchor, sentence: sentence.sentence, message: `Clause ${unit.clause} ${key}: normative sentence is not extracted` });
    }
  }
  const count = (kind: TraceIssueKind) => issues.filter(issue => issue.kind === kind).length;
  const counts = {
    requirements: blocks.length,
    linked: requirements.filter(item => item.sources.some(source => source.state === "ok" || source.state === "moved")).length,
    orphans: count("orphan"), duplicates: count("duplicate-id"),
    sentences: sentences.length, covered: sentences.filter(item => item.state === "covered").length,
    uncovered: sentences.filter(item => item.state === "uncovered").length, excluded: sentences.filter(item => item.state === "excluded").length,
    broken: count("broken-link"), changed: count("source-changed"), moved: count("source-moved"), unanchored,
  };
  return { standard: standardName, counts, requirements, sentences, issues, ok: !issues.some(issue => issue.severity === "error") };
}

export type Candidate = {
  anchor: string;
  sentence: number;
  hash: string;
  text: string;
  strength: RequirementStrength;
  clause: string;
  clauseTitle: string;
  type: RequirementType;
};

const INTERFACE = /\b(communicat|interface|protocol|information exchange|interoperab|IEEE Std 1815|IEC 61850|SunSpec|data|monitor)/i;
const PERFORMANCE = /\b(\d+(\.\d+)?\s?(ms|s|Hz|%|V|kW|kVA|kvar|p\.u\.|cycles?|seconds?)\b|ride-through|response time|accuracy|within|settling|ramp|rate)/i;
const SAFETY = /\b(trip|cease to energize|island|protection|isolat|ground|fault|inadvertent|surge|disconnect)/i;
export function candidateType(text: string): RequirementType {
  return SAFETY.test(text) && !PERFORMANCE.test(text) ? "safety" : PERFORMANCE.test(text) ? "performance" : INTERFACE.test(text) ? "interface" : "functional";
}

/** Normative sentences that no requirement covers and no reviewer excluded, in document order. */
export function extractCandidates(standard: EditableDocument, report: TraceReport): Candidate[] {
  const units = new Map(standardUnits(standard).flatMap(unit => unit.anchor ? [[unit.anchor, unit] as const] : []));
  return report.sentences.filter(sentence => sentence.state === "uncovered").map(sentence => {
    const unit = units.get(sentence.anchor)!;
    return { anchor: sentence.anchor, sentence: sentence.sentence, hash: sentence.hash, text: sentence.text, strength: sentence.strength!,
      clause: unit.clause, clauseTitle: unit.clauseTitle, type: candidateType(sentence.text) };
  });
}

/** Source span for a candidate or sentence, as requirement `:source:` content. */
export function sourceOf(documentName: string, item: { anchor: string; sentence: number; hash: string }): RequirementSource {
  return { document: documentName, anchor: item.anchor, sentence: item.sentence, hash: item.hash };
}
export { formatSource };

/** The next unused `<prefix>NNNN` requirement ID for a system document. */
export function nextRequirementId(system: EditableDocument, prefix: string): string {
  let max = 0;
  for (const block of requirementBlocks(system)) {
    if (block.id.startsWith(prefix)) { const n = Number(block.id.slice(prefix.length)); if (Number.isInteger(n) && n > max) max = n; }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Top-level index at which a requirement for std clause `clause` is inserted: the end of the system
 * section whose heading carries the same clause number (else its nearest parent clause, else the body end). */
export function insertionIndexForClause(system: EditableDocument, clause: string): number {
  const headings = system.blocks.flatMap(block => block.block === "heading" ? [{ block, number: CLAUSE.exec(block.text)?.[1] }] : []);
  let parts = clause.split(".");
  while (parts.length) {
    const found = headings.find(item => item.number === parts.join("."));
    if (found) {
      const next = headings.find(item => item.block.path[0] > found.block.path[0] && item.block.level <= found.block.level);
      return next ? next.block.path[0] : system.blocks.at(-1)!.path[0] + 1;
    }
    parts = parts.slice(0, -1);
  }
  return system.blocks.at(-1)!.path[0] + 1;
}
