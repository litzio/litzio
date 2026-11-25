import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";
import { parse, serialize } from "../../packages/core/src/index.ts";
import { normalizeLatex } from "./latex.mjs";

type Formula = { id: string; index: number; image: string; latex: string; number: string };
const execute = promisify(execFile);

export async function judgeDocument(checkout: string, baseline: string, file: string, selected: Formula[]) {
  async function cli(command: string, target: string) {
    try {
      const { stdout } = await execute(process.execPath, [path.join(checkout, "packages/cli/dist/cli.mjs"), command, target, "--format", "json"],
        { cwd: checkout, encoding: "utf8", timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      return { ok: false, detail: error.stdout || error.stderr || String(error) };
    }
  }
  const [before, after, check] = await Promise.all([cli("inspect", baseline), cli("inspect", file), cli("check", file)]);
  if (!before.ok || !after.ok) return { ok: false, inspectError: before.detail ?? after.detail, check };
  const indices = new Set(selected.map(entry => entry.index));
  const inside = (node: { path: number[] }) => indices.has(node.path[0]);
  const originalSource = readFileSync(baseline, "utf8");
  const finalSource = readFileSync(file, "utf8");
  const originalTree = parse(originalSource), finalTree = parse(finalSource);
  let otherBlocksSame = false;
  if (originalTree.children.length === finalTree.children.length) {
    originalTree.children = originalTree.children.filter((_node, index) => !indices.has(index));
    finalTree.children = finalTree.children.filter((_node, index) => !indices.has(index));
    try { otherBlocksSame = serialize(originalTree) === serialize(finalTree); }
    catch (error) { throw new Error("Could not compare the unchanged blocks", { cause: error }); }
  }
  const outsideReadModelSame = isDeepStrictEqual(before.nodes.filter(node => !inside(node)), after.nodes.filter(node => !inside(node)));
  const formulas = selected.map(entry => {
    const at = (node: { path: number[] }) => node.path.length === 1 && node.path[0] === entry.index;
    const equation = after.nodes.find(node => at(node) && node.type === "equation");
    const priorCaption = before.nodes.find(node => at(node) && node.type === "caption")?.text ?? "";
    const finalCaption = after.nodes.find(node => at(node) && node.type === "caption")?.text ?? "";
    return {
      id: entry.id, expectedLatex: entry.latex, latex: equation?.latex ?? null, equationAtOriginalPosition: !!equation,
      exactIgnoringWhitespace: typeof equation?.latex === "string" && normalizeLatex(equation.latex) === normalizeLatex(entry.latex),
      imageStillInDocument: after.nodes.some(node => node.type === "figure" && node.imageUrl?.replace(/^\.\//, "") === entry.image.replace(/^\.\//, "")),
      expectedNumber: entry.number, fixedNumber: equation?.enumerator ?? null, displayedNumber: equation?.numbers?.equation ?? null,
      numberPreserved: String(equation?.numbers?.equation) === entry.number,
      priorCaption, finalCaption, captionPreserved: priorCaption === finalCaption,
    };
  });
  const valid = check.ok && check.validation?.valid === true && check.writeability?.writable === true;
  const ok = valid && otherBlocksSame && outsideReadModelSame && formulas.every(f => f.exactIgnoringWhitespace && !f.imageStillInDocument && f.numberPreserved && f.captionPreserved);
  return { ok, valid, check, changed: originalSource !== finalSource, otherBlocksSame, outsideReadModelSame, formulas };
}
