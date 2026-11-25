import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const plugin = path.resolve("tmp/assistant-review/plugin");
const load = name => import(pathToFileURL(path.join(plugin, name)).href);
const { activate } = await load("pdf/host.mjs");
const { authoring } = await load("pdf/authoring.mjs");
const { imageKeys, imageReceipt } = await load("pdf/output.mjs");
const { score } = await load("pdf/score-answer-key.mjs");
const { getDocument } = await load("node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const { createCanvas } = await load("node_modules/@napi-rs/canvas/index.js");
const dir = path.resolve("tmp/assistant-review");
const fixture = path.join(plugin, "pdf/test/fixtures");
const sample = "LSR-1.1-standards";
const folder = path.join(dir, "baseline");
await mkdir(folder);
const pdf = path.join(folder, sample + ".pdf");
await copyFile(path.join(fixture, sample + ".pdf"), pdf);
const bytes = await readFile(pdf);
const hash = createHash("sha256").update(bytes).digest("hex");
const oracle = JSON.parse(await readFile(path.join(fixture, "standards.json"), "utf8"));
assert.equal(hash, oracle.sha256);

const host = activate();
const engine = getDocument({
  data: new Uint8Array(bytes),
  standardFontDataUrl: path.join(plugin, "node_modules/pdfjs-dist/standard_fonts").replaceAll("\\", "/") + "/",
});
const writeJson = (name, data) => writeFile(path.join(dir, name), JSON.stringify(data, null, 2));
try {
  const picked = await host.operations.load({ path: pdf });
  const { excludedPages } = await host.operations.suggest({ id: picked.id });
  const result = await host.operations.convert({ id: picked.id, excludedPages });
  const legacy = score(structuredClone(result), oracle);
  const plan = authoring(result);
  const keys = imageKeys(result.blocks);
  const images = [];
  const document = await engine.promise;
  for (const block of result.blocks.filter(block => keys.has(block.id))) {
    const box = block.boxes[0];
    const page = await document.getPage(box.page + 1);
    // Same crop, scale and PDF renderer as the import screen, with a Node canvas.
    const scale = 2.5;
    const canvas = createCanvas(Math.ceil((box.x1 - box.x0) * scale), Math.ceil((box.bottom - box.top) * scale));
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -box.x0 * scale, -box.top * scale],
    }).promise;
    images.push({ key: keys.get(block.id), mime: "image/png", base64: canvas.toBuffer("image/png").toString("base64") });
  }
  const cli = path.resolve("packages/cli/dist/cli.mjs");
  const invoke = (...args) => JSON.parse(execFileSync(process.execPath, [cli, ...args, "--format", "json"], { encoding: "utf8" }));
  const input = path.join(dir, "save-input.json");
  await writeJson("save-input.json", { authoring: { ...plan.authoring, status: "draft" }, images });
  const saved = invoke("create", picked.document, "--input", input);
  const inspected = invoke("inspect", picked.document);
  assert.equal(saved.revision, inspected.revision);
  const mapping = await host.operations.mapping({
    id: picked.id, units: plan.units, revision: saved.revision,
    images: await Promise.all(images.map(imageReceipt)),
  });
  assert.equal(mapping.ownedImages.length, images.length);
  assert.equal((await host.operations.load({ path: pdf, cachedOnly: true })).cached.stale, false);
  await writeJson("legacy-score.json", legacy);
  await writeJson("baseline-inspect.json", inspected);
  await writeJson("baseline-check.json", invoke("check", picked.document));
  console.log(JSON.stringify({ excludedPages, hash, revision: saved.revision, images: images.length }));
} finally {
  await engine.destroy();
  host.dispose();
}
