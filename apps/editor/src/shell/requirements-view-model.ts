import type { RequirementCheck, SentenceCheck, TraceReport } from "@litzio/core";

/** Block keys as the reading layout reports them: the JSON of a top-level snapshot path. */
export const blockKey = (path: readonly number[]): string => JSON.stringify(path);

export type Link = { requirement: RequirementCheck; sourceIndex: number; stdKey?: string; sysKey: string; sentence: string; state: "ok" | "moved" | "changed" | "broken" };
export type Selection = { std: string[]; sys: string[]; sentences: string[]; requirements: string[] };
export const NO_SELECTION: Selection = { std: [], sys: [], sentences: [], requirements: [] };
export type StdMark = { covered: number; uncovered: number; excluded: number };
/** One row of the traceability matrix: a standard clause against the requirements that cover it. */
export type MatrixRow = { clause: string; sentences: number; covered: number; excluded: number; uncovered: number; requirements: string[] };

export const sentenceKey = (sentence: { anchor: string; sentence: number }): string => `${sentence.anchor}~s${sentence.sentence}`;

export function linksOf(report: TraceReport): Link[] {
  return report.requirements.flatMap(requirement => requirement.sources.map((check, sourceIndex) => ({
    requirement, sourceIndex, sysKey: blockKey(requirement.path), state: check.state,
    ...(check.standardPath ? { stdKey: blockKey(check.standardPath) } : {}),
    sentence: `${check.source.anchor}~s${check.sentence ?? check.source.sentence}`,
  })));
}

export function stdMarks(report: TraceReport): Map<string, StdMark> {
  const marks = new Map<string, StdMark>();
  for (const sentence of report.sentences) {
    const key = blockKey(sentence.path), mark = marks.get(key) ?? { covered: 0, uncovered: 0, excluded: 0 };
    mark[sentence.state]++; marks.set(key, mark);
  }
  return marks;
}

/** Worst state over a requirement's links: orphan and broken or changed sources are errors, moved sources warn. */
export function requirementState(requirement: RequirementCheck): "ok" | "warn" | "error" {
  if (requirement.sources.length === 0) return "error";
  if (requirement.sources.some(source => source.state === "broken" || source.state === "changed")) return "error";
  return requirement.sources.some(source => source.state === "moved") ? "warn" : "ok";
}

export function selectFromStd(report: TraceReport, links: Link[], key: string): Selection {
  const sentences = report.sentences.filter(sentence => blockKey(sentence.path) === key).map(sentenceKey);
  const hits = links.filter(link => link.stdKey === key);
  return { std: [key], sys: [...new Set(hits.map(link => link.sysKey))], sentences, requirements: [...new Set(hits.map(link => link.requirement.id))] };
}

export function selectFromSys(report: TraceReport, links: Link[], key: string): Selection {
  const hits = links.filter(link => link.sysKey === key);
  return { std: [...new Set(hits.flatMap(link => link.stdKey ? [link.stdKey] : []))], sys: [key], sentences: hits.map(link => link.sentence), requirements: [...new Set(hits.map(link => link.requirement.id))] };
}

export function selectFromSentence(report: TraceReport, links: Link[], key: string): Selection {
  const sentence = report.sentences.find(item => sentenceKey(item) === key);
  if (!sentence) return NO_SELECTION;
  const hits = links.filter(link => link.sentence === key);
  return { std: [blockKey(sentence.path)], sys: [...new Set(hits.map(link => link.sysKey))], sentences: [key], requirements: [...new Set(hits.map(link => link.requirement.id))] };
}

/** Standard clauses against the requirement IDs that cover them. Clause order follows the document. */
export function traceMatrix(sentences: readonly SentenceCheck[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>();
  for (const sentence of sentences) {
    const row = rows.get(sentence.clause) ?? { clause: sentence.clause, sentences: 0, covered: 0, excluded: 0, uncovered: 0, requirements: [] };
    row.sentences++; row[sentence.state]++;
    for (const id of sentence.requirements) if (!row.requirements.includes(id)) row.requirements.push(id);
    rows.set(sentence.clause, row);
  }
  return [...rows.values()];
}

export type StatusCounts = { requirements: number; links: number; uncovered: number };
/** The status bar numbers: requirements, resolved links (one per source span) and normative sentences not yet extracted. */
export function statusCounts(report: TraceReport): StatusCounts {
  return { requirements: report.counts.requirements, links: report.requirements.reduce((sum, item) => sum + item.sources.filter(source => source.state === "ok" || source.state === "moved").length, 0), uncovered: report.counts.uncovered };
}
