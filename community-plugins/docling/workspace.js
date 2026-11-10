import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { REVIEW_AUTHORING_CONTRACT, workspaceSnapshotSchema } from "@litzio/plugin-sdk";
import { readDoclingArchive, rewriteReview } from "./archive.js";
import { readReview, applyCorrections, reviewItems, setProgress, comparison } from "./review.js";
import { convertDocument } from "./document.js";

// Adapter semantics, not the plugin package version or whole-workspace revision.
export const WORKSPACE_ADAPTER_VERSION = "docling-replay-1/converter-1/mapping-1";
const hash = value => createHash("sha256").update(value).digest("hex");
const contentRevision = (archive, record) => hash(JSON.stringify([archive.manifest.document.sha256, record.patches]));
const cacheKey = snapshot => hash(JSON.stringify([snapshot.contentRevision, snapshot.adapterVersion, snapshot.authoringContract, snapshot.images]));

export function workspaceState(archive) {
  const record = readReview(archive.reviewBytes);
  const items = reviewItems(applyCorrections(archive.document, record.patches));
  let snapshot = null, cacheState = archive.cacheEntries?.size ? "invalid" : "missing";
  if (cacheState === "invalid") {
    try {
      const metadata = JSON.parse(archive.cacheEntries.get("current/snapshot.json").toString("utf8"));
      const source = archive.cacheEntries.get("current/document.md").toString("utf8");
      const { integrity, correspondence, ...saved } = metadata;
      const parsed = workspaceSnapshotSchema.parse({ ...saved, source });
      if (hash(JSON.stringify(correspondence ? [source, saved, correspondence] : [source, saved])) !== integrity || hash(Buffer.from(source)) !== parsed.documentRevision ||
          parsed.contentRevision !== contentRevision(archive, record) || parsed.cacheKey !== cacheKey(parsed)) throw new Error("Mixed workspace cache");
      if (new Set(parsed.images.map(image => image.key)).size !== parsed.images.length || parsed.images.some(image =>
        !archive.manifest.images.some(original => original.pointer === image.ref && original.sha256 === image.revision && original.mimetype === image.mime))) throw new Error("Mixed workspace images");
      snapshot = parsed;
      cacheState = parsed.adapterVersion === WORKSPACE_ADAPTER_VERSION && parsed.authoringContract === REVIEW_AUTHORING_CONTRACT ? "current" : "created-version";
    } catch { /* Invalid derived data requires explicit preparation; never import it as source. */ }
  }
  return { record, items, snapshot, cacheState };
}

/** Host owns all commits. This adapter only reads supplied files and fills Host staging. */
export async function workspaceOperation(input) {
  const raw = await readFile(input.file);
  if (hash(raw) !== input.sourceRevision) throw new Error("Workspace revision changed");
  const archive = readDoclingArchive(raw), state = workspaceState(archive), record = state.record;
  if (input.mode === "workspace-read") return state;
  if (input.mode === "workspace-material") {
    if (!state.snapshot) throw new Error("Workspace snapshot unavailable");
    if (input.ref) {
      const binding = state.snapshot.images.find(image => image.revision === input.ref);
      if (!binding) throw new Error("Unknown workspace image");
      const image = binding.ref.split("/").slice(1).reduce((value, key) => value?.[key.replace(/~1/g,"/").replace(/~0/g,"~")],archive.document);
      return { mime: binding.mime, base64: image.uri.slice(image.uri.indexOf(",")+1), revision: binding.revision };
    }
    const { correspondence } = JSON.parse(archive.cacheEntries.get("current/snapshot.json").toString("utf8"));
    if (!correspondence) throw new Error("Explicit regeneration is required for correspondence");
    const pageNo = input.pageNo ?? record.lastPage ?? 1, image = archive.document.pages[pageNo]?.image;
    if (image?.mimetype !== "image/png") throw new Error("Page image unavailable");
    const bytes = Buffer.from(image.uri.slice(image.uri.indexOf(",")+1),"base64");
    await writeCandidate(input,bytes);
    const material = comparison(archive,record,correspondence,{...input,result:{revision:state.snapshot.documentRevision}});
    const ref = `page-${pageNo}`; material.pages.find(page=>page.pageNo===pageNo).imageRef=ref;
    material.images=[{ref,path:input.resultFile.path,revision:hash(bytes)}];
    return material;
  }
  let bytes;
  if (input.mode === "workspace-prepare") {
    if (input.patches) {
      record.patches.push(...input.patches); record.checkedPages = []; record.lastPage = null;
      readReview(Buffer.from(JSON.stringify(record)));
    }
    if (input.progress) setProgress(archive.document, record, input.progress);
    // Progress must preserve the exact cache bytes; semantic changes discard the old cache.
    bytes = rewriteReview(archive, Buffer.from(JSON.stringify(record)), input.progress ? archive.cacheEntries : new Map());
    if (!input.progress) {
      const authored = await convertDocument(archive.document, archive.manifest.document.sha256, record.patches);
      const imageRefs = authored.document.images.map(image => {
        const revision = hash(Buffer.from(image.base64, "base64"));
        const original = archive.manifest.images.find(item => item.sha256 === revision && item.mimetype === image.mime);
        if (!original) throw new Error("Image is not owned by this archive");
        return { key: image.key, ref: original.pointer, revision, mime: image.mime };
      });
      await writeCandidate(input, bytes);
      return { build: authored.document, sealInput: authored.report, imageRefs, contentRevision: contentRevision(archive, record), adapterVersion: WORKSPACE_ADAPTER_VERSION };
    }
  } else if (input.mode === "workspace-seal") {
    const snapshot = workspaceSnapshotSchema.parse({ ...input.snapshot, cacheKey: cacheKey(input.snapshot) });
    if (snapshot.contentRevision !== contentRevision(archive, record) || snapshot.adapterVersion !== WORKSPACE_ADAPTER_VERSION || snapshot.authoringContract !== REVIEW_AUTHORING_CONTRACT) throw new Error("Mixed workspace input");
    // Bind source-format correspondence to the final Host canonical targets, without storing images again.
    const report = input.sealInput;
    if (report?.sourceHash !== archive.manifest.document.sha256 || !Array.isArray(report.items)) throw new Error("Prepared correspondence required");
    const targets = new Map(snapshot.inputs.flatMap(item => item.targets).map(target => [JSON.stringify(target.path), target]));
    const bind = values => values.map(value => {
      const target = targets.get(JSON.stringify(value.path));
      if (!target || value.documentHash !== report.documentHash || value.documentRevision !== report.documentRevision) throw new Error("Mixed prepared correspondence");
      return target;
    });
    const correspondence = { ...report, documentRevision: snapshot.documentRevision, documentHash: snapshot.documentRevision,
      items: report.items.map(item => ({ ...item, targets: bind(item.targets), ...(item.cells ? {cells:item.cells.map(cell => ({...cell,targets:bind(cell.targets)}))} : {}) })) };
    const { source, ...saved } = snapshot;
    const metadata = { ...saved, correspondence, integrity: hash(JSON.stringify([source, saved, correspondence])) };
    bytes = rewriteReview(archive, archive.reviewBytes, new Map([["current/document.md", Buffer.from(source)], ["current/snapshot.json", Buffer.from(JSON.stringify(metadata))]]));
  } else throw new Error("Unknown workspace operation");
  await writeCandidate(input, bytes);
  return workspaceState(readDoclingArchive(bytes));
}
async function writeCandidate(input, bytes) {
  if (bytes.length > input.resultFile.maxBytes) throw new Error("Workspace exceeds Host limit");
  await writeFile(input.resultFile.path, bytes, { flag: "r+" });
}
