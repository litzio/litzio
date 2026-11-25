import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { authorDocument } from "../../packages/core/src/document-authoring.ts";

const [plugin, destination] = process.argv.slice(2);
assert.ok(plugin && destination, "Pass a scratch copy of document-import and an output Markdown path.");
const load = (name: string) => import(pathToFileURL(resolve(plugin, "pdf", name)).href);
const { extract } = await load("extract.mjs");
const { authoring } = await load("authoring.mjs");
const { convert, suggestExcludedPages } = await load("rules.mjs");
const { imageKeys } = await load("output.mjs");
const input = pathToFileURL(resolve(plugin, "pdf/test/fixtures/LSR-1.1-standards.pdf"));
const extraction = await extract(input);
const excludedPages = suggestExcludedPages(extraction);
const converted = convert(extraction, excludedPages);
// Text/structure corpus only. Use safe relative image references, without rasterizing
// or publishing image files. The writer still checks all figure and reference semantics.
const assets = Object.fromEntries([...imageKeys(converted.blocks).values()]
  .map(key => [key, "./sample-assets/" + key + ".png"]));
const plan = authoring(converted);
const authored = await authorDocument({ ...plan.authoring, status: "draft" }, assets);
await writeFile(destination, authored.source, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ excludedPages, blocks: plan.units.length, assets: Object.keys(assets).length,
  bytes: Buffer.byteLength(authored.source), revision: authored.documentRevision }));
