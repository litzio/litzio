/**
 * Inputs whose canonical output must keep master's bytes (#1845, #1846). The expected outputs
 * are in `fixtures/writer-bytes.master.json`, written by the master writer:
 *
 *   tsx test/writer-bytes-cases.ts <directory holding master's packages/core/src>
 *
 * Regenerate only when a writer change is meant to change saved bytes, and review the diff.
 * Repository Markdown fixtures are copied into the JSON so this check does not follow later
 * edits of other packages' fixtures.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { MystDocument, MystNode } from "../src/myst/tree.ts";

type Parse = (source: string) => MystDocument;
type Serialize = (document: MystDocument) => string;

export type Expected = {
  fixtures: Record<string, { input: string; output: string | null }>;
  generated: Record<string, string | null>;
};

export const EXPECTED_URL = new URL("fixtures/writer-bytes.master.json", import.meta.url);

// Where the placeholder text sits: body lines, marks, links, roles, containers and the
// one-line places (heading, table cell and caption) whose bytes #1844 had to restore.
const CONTEXTS: Record<string, string> = {
  paragraph: "ZZZ\n",
  "after hard break": "x\\\nZZZ\n",
  "after strong": "**b**ZZZ\n",
  strong: "a **ZZZ** b\n",
  emphasis: "*ZZZ*\n",
  link: "[ZZZ](https://example.com)\n",
  role: "H{sub}`ZZZ`\n",
  heading: "# ZZZ\n",
  "table cell": ":::{table}\n\n| h |\n| - |\n| ZZZ |\n:::\n",
  "table caption": ":::{table} ZZZ\n:name: tab\n\n| h |\n| - |\n| c |\n:::\n",
  "figure caption": ":::{figure} image.png\n:name: fig\n\nZZZ\n:::\n",
  admonition: ":::{note}\nZZZ\n:::\n",
  list: "- ZZZ\n",
  "ordered list": "1. ZZZ\n",
  quote: "> ZZZ\n",
  footnote: "a[^1]\n\n[^1]: ZZZ\n",
};

// Line-start syntax (MyST and CommonMark), Korean target-like text and indentation.
const TOKENS = [
  "+++", "+++ meta", "%", "% c", ":::", ":::{note}", "::::", "(lab)=", "(lab)= ", "(측정)=", "(a b)=",
  "(lab)=x", "word", "    run()", "\trun()", " x", "# h", "- li", "1. x", "> q", "$5", "@kim", "**",
];
const FORMS: Record<string, (token: string) => string> = {
  alone: token => token,
  "after soft break": token => `a\n${token}`,
  "before soft break": token => `${token}\nb`,
  "between soft breaks": token => `a\n${token}\nb`,
};

/** Every generated case: a parsed context with its placeholder text replaced. */
export function generatedCases(parse: Parse): [string, () => MystDocument][] {
  return Object.entries(CONTEXTS).flatMap(([context, template]) =>
    TOKENS.flatMap(token => Object.entries(FORMS).map(([form, make]) =>
      [`${context} | ${form} | ${JSON.stringify(token)}`, () => replaced(parse(template), make(token))] as [string, () => MystDocument])));
}

function replaced(document: MystDocument, value: string): MystDocument {
  const visit = (node: MystNode): boolean => {
    if (node.type === "text" && typeof node.value === "string" && node.value.includes("ZZZ")) {
      node.value = node.value.replace("ZZZ", value);
      return true;
    }
    return (node.children ?? []).some(visit);
  };
  if (!visit(document)) throw new Error("placeholder not found");
  return document;
}

export function attempt(serialize: Serialize, make: () => MystDocument): string | null {
  try { return serialize(make()); } catch { return null; }
}

async function generate(source: string): Promise<void> {
  const base = pathToFileURL(resolve(source)).href.replace(/\/?$/, "/");
  const { parse } = await import(new URL("myst/parse.ts", base).href) as { parse: Parse };
  const { serialize } = await import(new URL("myst/serialize.ts", base).href) as { serialize: Serialize };
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const files = execFileSync("git", ["ls-files", "*/fixtures/*.md"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const expected: Expected = { fixtures: {}, generated: {} };
  for (const file of files) {
    const input = readFileSync(resolve(root, file), "utf8");
    expected.fixtures[file] = { input, output: attempt(serialize, () => parse(input)) };
  }
  for (const [name, make] of generatedCases(parse)) expected.generated[name] = attempt(serialize, make);
  writeFileSync(EXPECTED_URL, `${JSON.stringify(expected, null, 1)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await generate(process.argv[2]!);
