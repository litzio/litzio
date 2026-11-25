// Re-evaluate saved documents and LaTeX without another model call.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { judgeDocument } from "./judge.ts";
import { normalizeLatex, reportedLatex } from "./latex.mjs";

const root = path.resolve(process.argv[2] ?? "tmp/formula-mission");
const checkout = fileURLToPath(new URL("../../", import.meta.url));
const document = "LSR-1.1-standards.md";
const baseline = path.join(root, "baseline", document);
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const formulas = read(path.join(root, "baseline/formulas.json"));
const direct = read(path.join(root, "A.json")).map(run => {
  const expected = formulas.find(entry => entry.id === run.id);
  const candidates = reportedLatex(run.text ?? "");
  const exactIgnoringWhitespace = candidates.some(latex => normalizeLatex(latex) === normalizeLatex(expected.latex));
  return { ...run, candidates, exactIgnoringWhitespace };
});
const assistant = [];
for (const name of readdirSync(root).filter(name => /^(?:B|B-hint|C)-[1-3]$/.test(name))) {
  const file = path.join(root, name, "result.json");
  if (!existsSync(file)) continue;
  const result = read(file);
  if (!result.stop) continue;
  const targets = name.startsWith("C-") ? formulas : formulas.slice(0, 1);
  const judgement = await judgeDocument(checkout, baseline, path.join(result.root, "docs", document), targets);
  assistant.push({ name, judgement });
}
writeFileSync(path.join(root, "judgements.json"), JSON.stringify({ direct, assistant }, null, 2));
