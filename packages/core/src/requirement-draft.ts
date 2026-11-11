import type { EditableDocument } from "./editable.ts";
import { createDocument } from "./myst/native.ts";
import { createRequirementNode, type RequirementContent } from "./myst/requirement.ts";
import { serialize } from "./myst/serialize.ts";
import { updateDocumentTitle } from "./myst/title.ts";
import { insertHeading, insertParagraph, insertTable } from "./operations.ts";
import { checkTraceability, extractCandidates, sourceOf, type Candidate } from "./requirements.ts";
import type { MystDocument, MystNode } from "./myst/tree.ts";

/** Deterministic first-pass restatement of a standard sentence from the system's point of view (no model involved). */
export function rewriteStatement(text: string): string {
  let result = text.replace(/^(?:\(?[a-z0-9]{1,2}\)|•)\s+/, "").trim();
  result = result.replace(/^(?:The |A |An |Each )?DER(?: unit| system)?(?=\s+(?:shall|should|may|is|are)\b)/, "The DER system");
  result = result.replace(/\bthis standard\b/g, "this specification").replace(/\bThis standard\b/g, "This specification");
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return /[.!?:]$/.test(result) ? result : `${result}.`;
}

/** Short title: the verb phrase of "The DER system shall ..." statements, else the sentence opening. */
export function requirementTitle(statement: string, fallback: string): string {
  const subject = /^The DER system (shall not|should not|shall|should|may)\s+(.*)$/.exec(statement);
  let phrase = subject ? subject[2] : statement;
  phrase = phrase.replace(/[.;:,]+$/, "");
  const cut = subject ? phrase.split(/[,;:(]/)[0].trim() : phrase;
  phrase = cut.length > 64 ? cut.slice(0, 64).replace(/\s+\S*$/, "") : cut;
  if (!phrase) return fallback;
  phrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return subject?.[1].endsWith("not") ? `Not ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}` : phrase;
}

export type DraftOptions = {
  title: string;
  standardName: string;
  idPrefix: string;
  /** Opening sections (purpose, scope, terms ...), as plain headings and paragraphs, before the clause chapters. */
  intro: ({ heading: string; level?: number } | { paragraph: string } | { table: string[][] })[];
  /** Override for chapter and section titles by clause number. */
  clauseTitles?: Record<string, string>;
  /** Clauses (prefixes) to include; default all clauses with candidates. */
  clauses?: string[];
  /** Sentence keys (`anchor~sN`) left out of the draft, for example sentences kept for later review. */
  skip?: readonly string[];
};

const level = (clause: string) => Math.min(clause.split(".").length, 4);

/**
 * Create the first draft of a system requirements document: an ordinary Litzio document with
 * an introduction, chapters following the standard's clause numbers and one requirement block per
 * extracted normative sentence, each linked to its source span. Returns canonical Markdown.
 */
export function draftSystemDocument(standard: EditableDocument, options: DraftOptions): string {
  const report = checkTraceability(standard, { blocks: [] }, options.standardName);
  const candidates = extractCandidates(standard, report).filter(item => !options.skip?.includes(`${item.anchor}~s${item.sentence}`)).filter(item => !options.clauses || options.clauses.some(prefix => item.clause === prefix || item.clause.startsWith(`${prefix}.`)));
  const empty = createDocument();
  let document = updateDocumentTitle(createDocument(), options.title);
  const push = (part: MystDocument) => { document.children.push(...part.children.slice(1)); };
  for (const item of options.intro) {
    if ("heading" in item) push(insertHeading(empty, 1, item.level ?? 1, item.heading));
    else if ("paragraph" in item) push(insertParagraph(empty, 1, item.paragraph));
    else push(insertTable(empty, 1, item.table));
  }
  const titles = new Map<string, string>();
  for (const block of standard.blocks) if (block.block === "heading") {
    const match = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(block.text);
    if (match) titles.set(match[1], match[2]);
  }
  const byClause = new Map<string, Candidate[]>();
  for (const item of candidates) byClause.set(item.clause, [...(byClause.get(item.clause) ?? []), item]);
  const wanted = new Set<string>();
  for (const clause of byClause.keys()) { const parts = clause.split("."); for (let n = 1; n <= parts.length; n++) wanted.add(parts.slice(0, n).join(".")); }
  const order = [...titles.keys()].filter(clause => wanted.has(clause));
  let counter = 0;
  for (const clause of order) {
    const title = options.clauseTitles?.[clause] ?? titles.get(clause)!;
    push(insertHeading(empty, 1, level(clause), `${clause} ${title}`));
    for (const item of byClause.get(clause) ?? []) {
      const body = rewriteStatement(item.text);
      const content: RequirementContent = {
        id: `${options.idPrefix}${String(++counter).padStart(4, "0")}`, title: requirementTitle(body, item.clauseTitle),
        status: "draft", type: item.type, strength: item.strength, sources: [sourceOf(options.standardName, item)], parents: [], body,
      };
      document.children.push(createRequirementNode(content) as MystNode);
    }
  }
  return serialize(document);
}

