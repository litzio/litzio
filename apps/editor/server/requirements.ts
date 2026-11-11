import fs from "node:fs";
import path from "node:path";
import {
  assignAnchors, checkTraceability, draftSystemDocument, exportReqif, extractCandidates, getEditableDocument, insertRequirement, insertionIndexForClause,
  nextRequirementId, parse, requirementTitle, rewriteStatement, serialize, sourceOf,
  type Candidate, type EditableDocument, type Exclusion, type TraceReport,
} from "@litzio/core";
import { assertUnicode, commitFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { resolveDocumentPath } from "./document-path.ts";

/**
 * Requirements traceability (spike): one Host operation shared by the CLI and the HTTP route (ADR-0015).
 * It works on two ordinary Litzio documents: a standard requirements document and a system requirements
 * document that links to it. Reads are pure; writes go through Core operations and revision-checked commits.
 */
export const requirementsOperation = { name: "requirements", scope: "two documents beside each other and an optional exclusions sidecar", writes: "adopt, exclude, anchor, draft" } as const;
export type RequirementsAction = "check" | "extract" | "adopt" | "exclude" | "anchor" | "draft" | "export";
export type RequirementsInput = {
  standard?: string; system?: string; keys?: string[]; undo?: boolean; idPrefix?: string; title?: string; language?: string;
  /** Include both parsed documents (for the editor's compare view); the CLI does not need them. */
  documents?: boolean;
};
export type RequirementsResult = {
  report?: TraceReport;
  candidates?: Candidate[];
  adopted?: string[];
  excluded?: Exclusion[];
  anchored?: number;
  written?: string;
  reqif?: string;
  documents?: { standard: EditableDocument; system: EditableDocument };
  revisions?: { standard?: string; system?: string };
};

const SPAN = /^(.+)~s([1-9][0-9]*)$/;
export const exclusionsPath = (systemFile: string) => systemFile.replace(/\.md$/i, "") + ".excluded.json";

function readText(file: string): string { return decodeUtf8(fs.readFileSync(file)); }
function readExclusions(systemFile: string): Exclusion[] {
  const file = exclusionsPath(systemFile);
  if (!fs.existsSync(file)) return [];
  const data: unknown = JSON.parse(readText(file));
  if (!Array.isArray(data)) throw new Error(`${path.basename(file)} must be a JSON array`);
  return data.map(item => {
    if (!item || typeof item.anchor !== "string" || !Number.isInteger(item.sentence) || typeof item.hash !== "string") throw new Error(`${path.basename(file)} has an invalid exclusion`);
    return { anchor: item.anchor, sentence: item.sentence, hash: item.hash };
  });
}
function writeExclusions(systemFile: string, items: Exclusion[]): void {
  const file = exclusionsPath(systemFile);
  assertUnicode(JSON.stringify(items));
  fs.writeFileSync(file, `${JSON.stringify(items, undefined, 2)}\n`, "utf8");
}

function need(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} document path is required`);
  return value;
}

/** Standard-document name used in `:source:` links: the file name beside the system document. */
export function standardLinkName(standardFile: string, systemFile: string): string {
  const relative = path.relative(path.dirname(systemFile), standardFile);
  return relative.split(path.sep).join("/");
}

function keysOf(keys: string[] | undefined): { anchor: string; sentence: number }[] {
  if (!keys?.length) throw new Error("at least one sentence key (anchor~sN) is required");
  return keys.map(key => {
    const match = SPAN.exec(key);
    if (!match) throw new Error(`invalid sentence key ${key}; expected anchor~sN`);
    return { anchor: match[1], sentence: Number(match[2]) };
  });
}

export function executeRequirementsOperation(action: RequirementsAction, input: RequirementsInput, access: FileAccess = LOCAL_FILE_ACCESS): RequirementsResult {
  if (action === "export") {
    const systemFile = resolveDocumentPath(need(input.system, "system"), access);
    const source = readText(systemFile);
    const title = input.title ?? getEditableDocument(parse(source)).title;
    return { reqif: exportReqif(getEditableDocument(parse(source)), { title: title || path.basename(systemFile, ".md"), language: input.language }), revisions: { system: textRevision(source) } };
  }
  const standardFile = resolveDocumentPath(need(input.standard, "standard"), access);
  if (action === "anchor") {
    const source = readText(standardFile);
    const before = getEditableDocument(parse(source)), anchored = assignAnchors(parse(source)), markdown = serialize(anchored);
    const count = (document: EditableDocument) => document.blocks.filter(block => block.block === "target").length;
    if (markdown !== source) commitFile(standardFile, markdown, textRevision(source));
    return { anchored: count(getEditableDocument(anchored)) - count(before), written: markdown === source ? undefined : standardFile, revisions: { standard: textRevision(markdown) } };
  }
  const systemFile = resolveDocumentPath(need(input.system, "system"), access, action === "draft");
  const name = standardLinkName(standardFile, systemFile);
  if (action === "draft") {
    if (fs.existsSync(systemFile)) throw new Error(`${path.basename(systemFile)} already exists; draft never overwrites a document`);
    const standard = getEditableDocument(parse(readText(standardFile)));
    const markdown = draftSystemDocument(standard, {
      title: input.title ?? `System requirements for ${path.basename(standardFile, ".md")}`, standardName: name, idPrefix: input.idPrefix ?? "REQ-",
      intro: [{ heading: "1 Purpose" }, { paragraph: "This document states the system requirements derived from the standard it links to." }],
    });
    fs.writeFileSync(systemFile, markdown, { encoding: "utf8", flag: "wx" });
    return { written: systemFile, report: checkTraceability(standard, getEditableDocument(parse(markdown)), name), revisions: { system: textRevision(markdown) } };
  }
  const standardSource = readText(standardFile), systemSource = readText(systemFile);
  const standard = getEditableDocument(parse(standardSource));
  let exclusions = readExclusions(systemFile);
  const revisions = { standard: textRevision(standardSource), system: textRevision(systemSource) };
  const report = () => checkTraceability(standard, getEditableDocument(parse(systemSource)), name, exclusions);
  const documents = input.documents ? { standard, system: getEditableDocument(parse(systemSource)) } : undefined;
  if (action === "check") return { report: report(), excluded: exclusions, revisions, ...(documents ? { documents } : {}) };
  if (action === "extract") return { candidates: extractCandidates(standard, report()), excluded: exclusions, revisions };
  const wanted = keysOf(input.keys);
  if (action === "exclude") {
    const known = new Map(report().sentences.map(sentence => [`${sentence.anchor}~s${sentence.sentence}`, sentence]));
    for (const item of wanted) {
      const key = `${item.anchor}~s${item.sentence}`, sentence = known.get(key);
      if (!sentence) throw new Error(`${key} is not a normative sentence of the standard`);
      exclusions = exclusions.filter(existing => !(existing.anchor === item.anchor && existing.sentence === item.sentence));
      if (!input.undo) exclusions.push({ anchor: item.anchor, sentence: item.sentence, hash: sentence.hash });
    }
    writeExclusions(systemFile, exclusions);
    return { excluded: exclusions, report: report(), revisions };
  }
  // adopt: turn reviewed candidates into draft requirement blocks placed in the matching clause section.
  let document = parse(systemSource);
  const candidates = new Map(extractCandidates(standard, report()).map(candidate => [`${candidate.anchor}~s${candidate.sentence}`, candidate]));
  const adopted: string[] = [];
  const prefix = input.idPrefix ?? idPrefixOf(getEditableDocument(document));
  for (const item of wanted) {
    const key = `${item.anchor}~s${item.sentence}`, candidate = candidates.get(key);
    if (!candidate) throw new Error(`${key} is not an open candidate (already covered, excluded or not normative)`);
    const current = getEditableDocument(document), body = rewriteStatement(candidate.text), id = nextRequirementId(current, prefix);
    document = insertRequirement(document, insertionIndexForClause(current, candidate.clause), {
      id, title: requirementTitle(body, candidate.clauseTitle), status: "draft", type: candidate.type, strength: candidate.strength,
      sources: [sourceOf(name, candidate)], parents: [], body,
    });
    adopted.push(id);
  }
  const markdown = serialize(document);
  commitFile(systemFile, markdown, revisions.system);
  const next = checkTraceability(standard, getEditableDocument(parse(markdown)), name, exclusions);
  return { adopted, report: next, revisions: { standard: revisions.standard, system: textRevision(markdown) } };
}

function idPrefixOf(system: EditableDocument): string {
  const first = system.blocks.find(block => block.block === "requirement");
  const match = first && first.block === "requirement" ? /^(.*?)\d+$/.exec(first.id) : null;
  return match?.[1] ?? "REQ-";
}
