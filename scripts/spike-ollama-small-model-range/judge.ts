// Adapted from the formula mission's official CLI check and Core canonical comparison.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parse, serialize } from "../../packages/core/src/index.ts";
import { read } from "./tasks.mjs";

const execute = promisify(execFile);
const canonical = (dir, file) => serialize(parse(read(dir, file)));
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
  .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
const snapshot = (dir, file) => existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file)) : undefined;
const same = (a, b) => a !== undefined && b !== undefined && a.equals(b);

export async function judgeDocument(checkout, evidence, task, result) {
  async function cli(command, target) {
    try {
      const { stdout } = await execute(process.execPath, [path.join(checkout, "packages/cli/dist/cli.mjs"), command, target, "--format", "json"],
        { cwd: checkout, encoding: "utf8", timeout: 60_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch (error) {
      try { return JSON.parse(error.stdout); }
      catch { return { ok: false, detail: error.stderr || String(error) }; }
    }
  }
  const baseline = path.join(evidence, "baseline"), final = path.join(evidence, "final");
  const expected = path.join(evidence, "expected");
  mkdirSync(expected, { recursive: true });
  task.expected?.(expected, baseline);
  const outputs = task.outputs ?? [], moves = task.moves ?? {};
  const changed = files(baseline).filter(file => !same(snapshot(baseline, file), snapshot(final, file)));
  const created = files(final).filter(file => !existsSync(path.join(baseline, file)));
  const unrequestedChanges = changed.filter(file => !outputs.includes(file) && !moves[file]);
  const unrequestedFiles = created.filter(file => !outputs.includes(file) && !Object.values(moves).includes(file) &&
    !(task.script && /\.(?:[cm]?js|py|ps1|sh)$/i.test(file)));
  const documents = await Promise.all(outputs.map(async file => {
    const target = path.join(final, file);
    if (!existsSync(target)) return { file, missing: true, valid: false, canonicalMatch: false };
    const check = await cli("check", target);
    const valid = check.ok === true && check.validation?.valid === true && check.writeability?.writable === true;
    let canonicalMatch = !task.expected;
    if (valid && task.expected) canonicalMatch = canonical(final, file) === canonical(expected, file);
    return { file, check, valid, canonicalMatch };
  }));
  const content = !task.content || documents.every(document => document.valid) && task.content(final);
  const moved = Object.entries(moves).every(([from, to]) => !snapshot(final, from) && same(snapshot(baseline, from), snapshot(final, to)));
  let intermediate = !task.intermediate;
  if (task.intermediate && existsSync(path.join(evidence, "first-turn", outputs[0]))) {
    const first = path.join(evidence, "first-turn");
    const check = await cli("check", path.join(first, outputs[0]));
    intermediate = check.validation?.valid === true && check.writeability?.writable === true &&
      task.intermediate(first) && files(first).every(file => outputs.includes(file) || same(snapshot(first, file), snapshot(baseline, file)));
  }
  const items = result.conversation?.turns.at(-1)?.items ?? [];
  const answer = items.filter(item => item.kind === "assistant").map(item => item.text).join("\n");
  const answerMatches = !task.answer || task.answer(answer);
  const resultMatches = answerMatches && documents.every(document => document.valid && document.canonicalMatch) &&
    content && moved && intermediate && unrequestedChanges.length === 0 && unrequestedFiles.length === 0;
  return { ok: resultMatches && result.stop === "completed", resultMatches, answer, answerMatches, content, moved, intermediate,
    documents, changed, created, unrequestedChanges, unrequestedFiles };
}
