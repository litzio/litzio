import type { MystNode } from "./tree.ts";

/**
 * Requirement block (spike): a MyST directive `{requirement}` whose argument is the title, whose
 * leading `:key: value` lines are attributes and whose body is plain-text paragraphs.
 *
 *     ```{requirement} Title
 *     :id: REQ-0001
 *     :status: draft
 *     :type: functional
 *     :strength: shall
 *     :source: standard.md#std-4-1-p1~s1@1a2b3c4d
 *
 *     The system shall ...
 *     ```
 *
 * The ID is the persistent identity; `:source:` holds zero or more space-separated source spans
 * (document#anchor~sN@hash) and `:parent:` zero or more requirement IDs (link structure for
 * later levels; one level of traceability is built).
 */
export const REQUIREMENT_DIRECTIVE = "requirement";
export const REQUIREMENT_STATUSES = ["draft", "reviewed", "approved", "obsolete"] as const;
export const REQUIREMENT_TYPES = ["functional", "performance", "interface", "safety", "constraint", "information"] as const;
export const REQUIREMENT_STRENGTHS = ["shall", "should", "may"] as const;
export type RequirementStatus = typeof REQUIREMENT_STATUSES[number];
export type RequirementType = typeof REQUIREMENT_TYPES[number];
export type RequirementStrength = typeof REQUIREMENT_STRENGTHS[number];

/** One linked span of a standard document: block anchor, 1-based sentence ordinal, content hash. */
export type RequirementSource = { document: string; anchor: string; sentence: number; hash: string };

export type RequirementContent = {
  id: string;
  title: string;
  status: RequirementStatus;
  type: RequirementType;
  strength: RequirementStrength;
  sources: RequirementSource[];
  parents: string[];
  body: string;
};

const ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SOURCE = /^([^\s#~@]+)#([A-Za-z0-9][A-Za-z0-9._-]*)~s([1-9][0-9]*)@([0-9a-f]{8,16})$/;
const OPTION = /^:([a-z]+):[ \t]+(\S.*?)[ \t]*$/;
const OPTION_KEYS = ["id", "status", "type", "strength", "source", "parent"];
const NODE_FIELDS = new Set(["type", "name", "args", "value", "position"]);

export const requirementIdError = (id: string): string | undefined =>
  ID.test(id) ? undefined : "a requirement ID starts with a letter and uses letters, digits, '.', '_' or '-' (max 64 characters)";

export function formatSource(source: RequirementSource): string {
  return `${source.document}#${source.anchor}~s${source.sentence}@${source.hash}`;
}
export function parseSource(text: string): RequirementSource | undefined {
  const match = SOURCE.exec(text);
  return match ? { document: match[1], anchor: match[2], sentence: Number(match[3]), hash: match[4] } : undefined;
}

/** Why `content` cannot be written as a requirement block, or undefined when it can. */
export function requirementContentError(content: RequirementContent): string | undefined {
  const idError = requirementIdError(content.id);
  if (idError) return idError;
  if (!content.title.trim() || /[\r\n]/.test(content.title) || content.title !== content.title.trim()) return "a requirement title is one non-empty line without surrounding spaces";
  if (!(REQUIREMENT_STATUSES as readonly string[]).includes(content.status)) return `unsupported requirement status: ${content.status}`;
  if (!(REQUIREMENT_TYPES as readonly string[]).includes(content.type)) return `unsupported requirement type: ${content.type}`;
  if (!(REQUIREMENT_STRENGTHS as readonly string[]).includes(content.strength)) return `unsupported requirement strength: ${content.strength}`;
  for (const source of content.sources) if (!parseSource(formatSource(source))) return `invalid source link: ${formatSource(source)}`;
  for (const parent of content.parents) if (requirementIdError(parent)) return `invalid parent ID: ${parent}`;
  if (new Set(content.parents).size !== content.parents.length) return "duplicate parent ID";
  if (content.body.includes("```") || content.body.includes("~~~")) return "a requirement body cannot contain a code fence";
  for (const line of content.body.split("\n")) if (line !== line.trim() || /^:{3,}/.test(line)) return "requirement body lines cannot have surrounding spaces or start with ':::'";
  if (/\n\n\n/.test(content.body) || content.body !== content.body.trim()) return "requirement body paragraphs are separated by one blank line";
  if (OPTION.test(content.body.split("\n")[0] ?? "")) return "a requirement body cannot start with an option-like line";
  return undefined;
}

export function createRequirementNode(content: RequirementContent): MystNode {
  const error = requirementContentError(content);
  if (error) throw new Error(error);
  const options = [`:id: ${content.id}`, `:status: ${content.status}`, `:type: ${content.type}`, `:strength: ${content.strength}`,
    ...(content.sources.length ? [`:source: ${content.sources.map(formatSource).join(" ")}`] : []),
    ...(content.parents.length ? [`:parent: ${content.parents.join(" ")}`] : [])];
  return { type: "mystDirective", name: REQUIREMENT_DIRECTIVE, args: content.title, value: `${options.join("\n")}${content.body ? `\n\n${content.body}` : ""}` };
}

export function isRequirementNode(node: MystNode): boolean {
  return node.type === "mystDirective" && node.name === REQUIREMENT_DIRECTIVE;
}

/** The parsed requirement, or the reason a `{requirement}` directive is not admitted. */
export function readRequirement(node: MystNode): { content: RequirementContent } | { error: string } {
  if (!isRequirementNode(node)) return { error: "not a requirement block" };
  if (!Object.entries(node).every(([key, value]) => value === undefined || NODE_FIELDS.has(key))) return { error: "unsupported requirement fields" };
  if (typeof node.args !== "string" || !node.args.trim()) return { error: "a requirement needs a title (the directive argument)" };
  const lines = String(node.value ?? "").split("\n");
  const options = new Map<string, string>();
  let index = 0;
  for (; index < lines.length; index++) {
    const match = OPTION.exec(lines[index]);
    if (!match) break;
    if (!OPTION_KEYS.includes(match[1])) return { error: `unsupported requirement option: ${match[1]}` };
    if (options.has(match[1])) return { error: `duplicate requirement option: ${match[1]}` };
    options.set(match[1], match[2]);
  }
  if (index < lines.length && lines[index] !== "") return { error: "a requirement body follows its options after one blank line" };
  const sources: RequirementSource[] = [];
  for (const token of (options.get("source") ?? "").split(" ").filter(Boolean)) {
    const source = parseSource(token);
    if (!source) return { error: `invalid source link: ${token}` };
    sources.push(source);
  }
  const content: RequirementContent = {
    id: options.get("id") ?? "", title: node.args,
    status: (options.get("status") ?? "") as RequirementStatus, type: (options.get("type") ?? "") as RequirementType,
    strength: (options.get("strength") ?? "") as RequirementStrength, sources,
    parents: (options.get("parent") ?? "").split(" ").filter(Boolean), body: lines.slice(index + 1).join("\n"),
  };
  for (const key of ["id", "status", "type", "strength"]) if (!options.has(key)) return { error: `a requirement needs :${key}:` };
  const error = requirementContentError(content);
  if (error) return { error };
  // The canonical form is the only admitted form, so a read never differs from what a write emits.
  if (createRequirementNode(content).value !== node.value) return { error: "requirement options are written in canonical order" };
  return { content };
}

export function supportedRequirement(node: MystNode): RequirementContent | undefined {
  const result = readRequirement(node);
  return "content" in result ? result.content : undefined;
}
