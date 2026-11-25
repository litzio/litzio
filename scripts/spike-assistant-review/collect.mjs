import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local evidence only. Tool arguments and raw outputs can contain machine-specific paths.
const [name, rollout, browserResult] = process.argv.slice(2);
assert(name && rollout && browserResult, "Pass the run ID, matched Codex rollout and browser scenario result.");
const dir = path.resolve("tmp/assistant-review");
const run = path.join(dir, "runs", name);
const read = file => JSON.parse(readFileSync(file, "utf8"));
const state = read(path.join(run, "state.json"));
const score = read(path.join(run, "score.json"));
const hostIntegrity = read(path.join(run, "integrity.json"));
const browser = read(browserResult).find(entry => entry.name === name);
assert(browser && !browser.error);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const invoke = (script, ...args) => JSON.parse(execFileSync(process.execPath,
  [path.join(scripts, script), ...args], { encoding: "utf8" }));
const { version, turns } = invoke("session-usage.mjs", rollout);
const [turn] = turns;
const [snapshot] = state.snapshots;
assert.equal(state.actions.length, 1);
assert.equal(turns.length, 1);
assert.equal(turn.model, state.model);
assert.equal(turn.effort, state.reasoningEffort);
assert(path.basename(rollout).endsWith(snapshot.conversation.id + ".jsonl"));
const blocks = invoke("blocks.mjs", path.join(dir, "baseline/LSR-1.1-standards/LSR-1.1-standards.md"),
  state.document, path.join(run, "score.json"));
const items = snapshot.conversation.turns[0].items;
const report = {
  name, version, status: snapshot.state, seconds: snapshot.elapsedSeconds, engine: turn,
  openFolderFiles: state.condition === "a" ? ["고칠 곳 목록.md"] : ["standards.json", "README.md"],
  answerSha256: state.answerSha256,
  actualElements: score.summary, correct: score.entries.filter(entry => entry.status === "correct").length,
  newlyCorrect: score.newlyCorrect, damaged: score.damaged, stillWrong: score.stillWrong,
  blocks, agreements: score.relations, extras: score.extras, browser: browser.display,
  hostIntegrity,
  observedCalls: items.filter(i => i.kind === "tool").map(({ text, status, work }) => ({ text, status, workKind: work?.kind })),
  approvalCards: items.filter(i => i.question?.approval).length,
  groups: read(path.join(dir, "answer-groups.json")).map(group => ({
    ...group, evidence: group.ids.map(id => score.entries.find(entry => entry.id === id)),
  })),
};
writeFileSync(path.join(run, "local-summary.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ name, effort: turn.effort, seconds: report.seconds, structure: report.correct,
  changed: report.newlyCorrect.length, damaged: report.damaged.length, calls: report.observedCalls.length }));
