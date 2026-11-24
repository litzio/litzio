// Spike: checks the model request bodies a fake Ollama recorded for content from the user's home:
// skill names/descriptions under ~/.agents/skills, ~/.claude/skills, ~/.copilot/skills, ~/.codex/skills, and the
// text of instruction files (AGENTS.md, CLAUDE.md, copilot-instructions.md) in the home folder, its tool folders and
// every ancestor of the given working folders. Prints only file names and match counts, never the content.
// Usage: node home-leak-check.mjs <fake.jsonl> [ancestor-start-folder...]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const [log, ...starts] = process.argv.slice(2);
const home = os.homedir();
const bodies = readFileSync(log, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l))
  .filter(e => e.path === "/v1/responses" || e.path === "/v1/chat/completions").map(e => JSON.stringify(e.body));
const haystack = bodies.join("\n");
const signatures = [];
for (const dir of [".agents/skills", ".claude/skills", ".copilot/skills", ".codex/skills", ".pi/agent/skills"].map(d => path.join(home, d))) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.replace(/^["']|["']$/g, "").slice(0, 60);
    signatures.push({ source: path.relative(home, file), probes: [`"${name}"`, `name: ${name}`, `<name>${name}</name>`, description].filter(Boolean) });
  }
}
const instructionFiles = new Set();
for (const name of ["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md", ".codex/AGENTS.md", ".copilot/copilot-instructions.md", ".github/copilot-instructions.md", ".pi/agent/AGENTS.md"]) instructionFiles.add(path.join(home, name));
for (const start of starts) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    for (const name of ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]) instructionFiles.add(path.join(dir, name));
    if (path.dirname(dir) === dir) break;
  }
}
for (const file of instructionFiles) {
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  const lines = readFileSync(file, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 25).slice(0, 12);
  signatures.push({ source: file.startsWith(home) ? "~/" + path.relative(home, file) : file, probes: lines.map(l => l.slice(0, 80)) });
}
const report = signatures.map(s => ({ source: s.source.replaceAll(home, "~"), probes: s.probes.length, hits: s.probes.filter(p => haystack.includes(JSON.stringify(p).slice(1, -1)) || haystack.includes(p)).length }));
console.log(JSON.stringify({ requests: bodies.length, checkedSources: report.length, leaks: report.filter(r => r.hits > 0), checked: report.map(r => r.source) }, null, 1));
