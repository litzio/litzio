import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.resolve("tmp/assistant-review");
const plugin = path.join(dir, "plugin/pdf/host.mjs");
const { activate } = await import(pathToFileURL(plugin).href);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async file => JSON.parse(await readFile(file, "utf8"));
const exemplar = path.join(dir, "baseline/LSR-1.1-standards/assets");
async function inventory(folder) {
  try {
    const names = await readdir(folder);
    return Object.fromEntries(await Promise.all(names.map(async name => [name, hash(await readFile(path.join(folder, name)))])));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
const original = await inventory(exemplar);
for (const name of process.argv.slice(2)) {
  const evidence = path.join(dir, "runs", name);
  const state = await json(path.join(evidence, "state.json"));
  const score = await json(path.join(evidence, "score.json"));
  const assets = await inventory(path.join(path.dirname(state.document), "assets"));
  const side = state.document.replace(/\.md$/, ".pdf-source.json");
  const originalSide = side.replace(path.dirname(state.document), path.dirname(exemplar));
  const probe = activate();
  let mapping;
  const sideBefore = await readFile(side);
  try {
    const load = await probe.operations.load({ path: state.pdf, cachedOnly: true });
    mapping = { stale: load.cached.stale, storedRevision: load.cached.revision, currentRevision: score.revision };
  } catch (error) {
    mapping = { error: String(error.message) };
  } finally {
    probe.dispose();
  }
  const scoreAssetPaths = new Set(score.assets.map(a => path.basename(a.url)));
  const result = {
    name, mapping, pdfUnchanged: state.initialPdfHash === hash(await readFile(state.pdf)),
    sidecarBeforeProbeUnchanged: hash(sideBefore) === hash(await readFile(originalSide)),
    sidecarAfterProbeUnchanged: hash(sideBefore) === hash(await readFile(side)),
    originalAssetsMissingOrOverwritten: Object.keys(original).filter(k => assets[k] !== original[k]),
    originalAssetsNoLongerReferenced: Object.keys(original).filter(k => !scoreAssetPaths.has(k)),
    newAssets: Object.keys(assets).filter(k => !(k in original)),
    missingReferencedAssets: score.assets.filter(a => !a.sha256).map(a => a.url),
    brokenInternalLinks: score.links.filter(l => !l.resolves),
    check: { valid: score.check.validation?.valid, writable: score.check.writeability?.writable,
      unresolved: score.check.references?.unresolved, numberWarnings: score.check.numbering?.diagnostics?.map(d => d.code),
      missingImages: score.check.readiness?.missingImageFigures },
    reviewDidNotEdit: state.initialHash === state.snapshots[0]?.documentHash,
    hostExited: state.hostExited,
  };
  await writeFile(path.join(evidence, "integrity.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
