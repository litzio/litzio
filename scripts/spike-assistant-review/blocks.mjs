import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const [before, after, afterScore] = process.argv.slice(2);
const cli = path.resolve("packages/cli/dist/cli.mjs");
const read = file => JSON.parse(readFileSync(file, "utf8"));
const differences = read(new URL("./baseline-differences.json", import.meta.url));
const errorIds = new Set(differences.entries.map(entry => entry.id));
const positions = entries => new Set(entries.flatMap(entry => entry.path ? [entry.path[0]] : []));
const beforeErrors = positions([...differences.entries, ...differences.extras]);
const afterErrors = afterScore ? positions(read(afterScore).entries.filter(entry => errorIds.has(entry.id))) : new Set();

function inspect(file) {
  const { nodes } = JSON.parse(execFileSync(process.execPath, [cli, "inspect", file, "--format", "json"], { encoding: "utf8" }));
  const blocks = [];
  for (const node of nodes) {
    const { path: index, section, numbers, referenceText, captionNumberText, ...content } = node;
    if (node.type === "figure" && node.imageUrl && !/^(?:\w+):/.test(node.imageUrl)) {
      try {
        const bytes = readFileSync(path.resolve(path.dirname(file), decodeURIComponent(node.imageUrl)));
        content.assetHash = createHash("sha256").update(bytes).digest("hex");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (index.length === 1 && node.type !== "caption") {
      blocks.push({ position: index[0], contents: [] });
    }
    blocks.at(-1)?.contents.push([index.slice(1), content]);
  }
  return blocks.map(({ position, contents }) => ({ position, key: JSON.stringify(contents) }));
}

const original = inspect(before);
const revised = inspect(after);
// Align unchanged blocks first so a shifted block index does not count as an edit.
const remaining = Array.from({ length: original.length + 1 }, () => new Uint16Array(revised.length + 1));
for (let i = original.length - 1; i >= 0; i--) {
  for (let j = revised.length - 1; j >= 0; j--) {
    remaining[i][j] = original[i].key === revised[j].key
      ? 1 + remaining[i + 1][j + 1]
      : Math.max(remaining[i + 1][j], remaining[i][j + 1]);
  }
}

const changes = [];
function record(removed, inserted) {
  removed.forEach(block => changes.push({
    before: block.position, error: beforeErrors.has(block.position),
  }));
  const surplus = Math.max(0, inserted.length - removed.length);
  const newErrors = inserted.filter(block => afterErrors.has(block.position)).length;
  const allOldErrors = removed.length > 0 && removed.every(block => beforeErrors.has(block.position));
  for (let i = 0; i < surplus; i++) {
    changes.push({ addition: true, error: allOldErrors || i < Math.max(0, newErrors - removed.length) });
  }
}
let i = 0;
let j = 0;
let startI = 0;
let startJ = 0;
while (i < original.length && j < revised.length) {
  if (original[i].key === revised[j].key) {
    record(original.slice(startI, i), revised.slice(startJ, j));
    startI = ++i;
    startJ = ++j;
  } else if (remaining[i + 1][j] >= remaining[i][j + 1]) {
    i++;
  } else {
    j++;
  }
}
record(original.slice(startI), revised.slice(startJ));
const baselineErrors = changes.filter(change => change.error).length;
console.log(JSON.stringify({ baselineErrors, other: changes.length - baselineErrors, changes }));
