import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEditorEngineBoundary } from "./editor-engine-boundary.ts";
import { checkSourceImportBoundary } from "./source-import-boundary.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["apps/editor/server", "apps/editor/shared"];
for (const group of ["apps", "packages"]) {
  for (const entry of fs.readdirSync(path.join(root, group), { withFileTypes: true })) {
    const base = `${group}/${entry.name}/src`;
    if (entry.isDirectory() && fs.existsSync(path.join(root, base))) sourceRoots.push(base);
  }
}
// Plugin SDK bypass is guarded by the resolve hook in plugin-process.ts and its import-boundary test in plugins.test.ts.
for (const base of sourceRoots) {
  for (const file of fs.readdirSync(path.join(root, base), { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const relativeFile = path.posix.join(base, file.split(path.sep).join("/"));
    if (relativeFile.split("/").includes("test")) continue;
    const source = fs.readFileSync(path.join(root, base, file), "utf8");
    if (base === "apps/editor/src" && file !== "host-transport.ts" && /\bfetch\s*\(/.test(source)) throw new Error(`Editor HTTP must use Host client: ${file}`);
    if (base !== "packages/plugin-sdk/src" && /@litzio\/(?:plugin-api|docling|ai-agent)/.test(source)) throw new Error(`Removed plugin dependency: ${base}/${file}`);
    checkSourceImportBoundary(relativeFile, source);
    checkEditorEngineBoundary(relativeFile, source);
  }
}
console.log("Core and official application boundaries passed.");

// Displayed values have their own terminology rules; keys are internal identifiers.
// External product/protocol names are allowed; historical documents are outside this scope.
const locales = fs.readFileSync(path.join(root, "apps/editor/src/locales.ts"), "utf8");
for (const match of locales.matchAll(/^\s*"[^"\n]+": "((?:\\.|[^"\\])*)"/gm)) {
  if (/프로바이더|쓰기 범위|AI 에이전트|AI agent|main agent|AI settings|Write access|자격 증명|원본 대조|시각적 비교|비주얼|재시작|백그라운드 서비스[이을과](?![가-힣])/i.test(match[1])) {
    throw new Error(`Obsolete UI terminology: ${match[1]}`);
  }
}

// Current product source/contracts; ADRs, reviews, releases and external names are excluded.
const obsoletePublicName = /\/api\/ai-agent(?:[-/]|\b)|\bwriteAccess\b|\b(?:litzio|pnpm cli) ai\b|["']ai["']\s*,\s*["'](?:settings|configure)["']|\b(?:AiAgent\w*|AI_AGENT|LITZIO_AI_AGENT_\w*)\b/;
for (const base of ["apps/editor/src", "apps/editor/server", "apps/editor/shared", "apps/desktop/src", "packages/cli/src", "docs/design", "docs/guides", "docs/contributing", "docs/test"]) {
  for (const file of fs.readdirSync(path.join(root, base), { recursive: true }).filter(name => /\.(?:tsx?|md)$/.test(name) && !name.startsWith("assets"))) {
    const source = fs.readFileSync(path.join(root, base, file), "utf8");
    if (obsoletePublicName.test(source) || base === "packages/cli/src" && /(?:name:|args\[0\]\s*[!=]==?)\s*["']ai["']/.test(source)) throw new Error(`Obsolete assistant public name: ${base}/${file}`);
  }
}
if (obsoletePublicName.test(fs.readFileSync(path.join(root, "README.md"), "utf8"))) throw new Error("Obsolete assistant public name: README.md");
