import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEditorEngineBoundary } from "./editor-engine-boundary.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const base of ["apps/editor/src", "apps/editor/server", "apps/editor/shared", "apps/desktop/src", "packages/cli/src", "packages/core/src", "packages/file-commit/src"]) {
  for (const file of fs.readdirSync(path.join(root, base), { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(root, base, file), "utf8");
    checkEditorEngineBoundary(`${base}/${file}`, source);
    if (base === "apps/editor/src" && !["host-client.ts", "host-transport.ts"].includes(file) && /\bfetch\s*\(/.test(source)) throw new Error(`Editor HTTP must use Host client: ${file}`);
    if (/@litzio\/(?:plugin-api|docling|ai-agent)/.test(source)) throw new Error(`Removed plugin dependency: ${base}/${file}`);
    for (const match of source.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith(".") && path.resolve(root, base, path.dirname(file), specifier).startsWith(path.join(root, "plugins") + path.sep)) throw new Error(`Application imports plugin source: ${base}/${file}`);
    }
    if (base === "packages/core/src" && /(?:from|import\()\s*["'](?:@tiptap|prosemirror|[^"']*apps\/editor)/.test(source)) throw new Error(`Core editor dependency: ${file}`);
  }
}
console.log("Core and official application boundaries passed.");

// Displayed values have their own terminology rules; keys are internal identifiers.
// External product/protocol names are allowed; historical documents are outside this scope.
const locales = fs.readFileSync(path.join(root, "apps/editor/src/locales.ts"), "utf8");
for (const match of locales.matchAll(/^\s*"[^"\n]+": "((?:\\.|[^"\\])*)"/gm)) {
  if (/프로바이더|쓰기 범위|AI 에이전트|AI agent|main agent|AI settings|Write access/i.test(match[1])) {
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

// SDK remains UI-neutral; plugins depend on the SDK, never application internals.
for (const base of ["packages/plugin-sdk/src"]) {
  for (const file of fs.readdirSync(path.join(root, base), { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(root, base, file), "utf8");
    if (/from\s*["'](?:react|@tiptap|prosemirror|[^"']*apps\/)/.test(source)) throw new Error(`Plugin SDK UI dependency: ${base}/${file}`);
    for (const match of source.matchAll(/from\s*["']([^"']+)["']/g)) {
      if (base.startsWith("plugins/") && match[1]!.startsWith("@litzio/") && match[1] !== "@litzio/plugin-sdk") throw new Error(`Plugin bypasses SDK: ${base}/${file}`);
      if (base.startsWith("plugins/") && match[1]!.startsWith(".") && !path.resolve(root, base, path.dirname(file), match[1]!).startsWith(path.join(root, base) + path.sep)) throw new Error(`Plugin imports internal source: ${base}/${file}`);
    }
  }
}
