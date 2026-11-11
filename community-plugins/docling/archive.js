import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { PLUGIN_VERSION, DOCLING_FORMAT_VERSION } from "./versions.js";
import { validateDoclingDocument } from "./schema.js";

// Plugin-owned .docling: ZIP32, stored entries only. No filesystem extraction.
// Node has no ZIP API; this deliberately supports our small fixed envelope, not general ZIP.
// The opaque review ledger is independent of immutable source hashes.
// Record semantics belong to review.js; this envelope only preserves its bytes.
const validName = name => ["manifest.json", "document.json", "source.pdf", "review.json", "current/document.md", "current/snapshot.json"].includes(name);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
function imageBytes(image) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.uri ?? "");
  if (!match || match[1] !== image.mimetype) throw new Error("Expected embedded image");
  const bytes = Buffer.from(match[2], "base64");
  const valid = image.mimetype === "image/png" ? bytes.subarray(0, 8).equals(pngSignature)
    : image.mimetype === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid || bytes.toString("base64") !== match[2]) throw new Error("Invalid embedded image");
  return bytes;
}
function imagesOf(document) {
  const images = [];
  function visit(value, pointer) {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "uri") && Object.hasOwn(value, "mimetype") && Object.hasOwn(value, "dpi") && Object.hasOwn(value, "size")) {
      const bytes = imageBytes(value), page = /^\/pages\/([1-9]\d*)\/image$/.exec(pointer);
      if (page && value.mimetype !== "image/png") throw new Error("Expected PNG page");
      images.push({ pointer, path: page ? `pages/${page[1]}.png` : `document.json#${pointer}`, sha256: sha256(bytes), bytes: bytes.length, mimetype: value.mimetype, data: bytes });
      return;
    }
    for (const [key, child] of Object.entries(value)) visit(child, pointer + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1"));
  }
  visit(document, "");
  return images;
}
function validateEntries(entries) {
  if (!entries.has("manifest.json") || !entries.has("document.json") || !entries.has("source.pdf")) throw new Error("Incomplete .docling");
  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  if (manifest?.format !== "docling" || manifest.version !== DOCLING_FORMAT_VERSION || !["success", "partial_success"].includes(manifest.status) || typeof manifest.converter?.pluginVersion !== "string" ||
      typeof manifest.source?.name !== "string" || !manifest.source.name || /[/\\]/.test(manifest.source.name) ||
      !hashPattern.test(manifest.source.sha256) || !Number.isSafeInteger(manifest.source.bytes) || manifest.source.bytes < 0 ||
      manifest.server?.versions?.["docling-serve"] !== "1.32.0" || !hashPattern.test(manifest.server.openapi?.sha256) ||
      !manifest.profile?.request || typeof manifest.task?.id !== "string" || !manifest.task.id ||
      !Number.isFinite(Date.parse(manifest.task.startedAt)) || !Number.isFinite(Date.parse(manifest.task.completedAt)) ||
      !hashPattern.test(manifest.result?.sha256) || !Number.isSafeInteger(manifest.result.bytes)) throw new Error("Invalid .docling manifest");
  if (!Array.isArray(manifest.failedPages) || manifest.failedPages.some(page => !Number.isInteger(page) || page < 1)) throw new Error("Invalid failed pages");
  const documentBytes = entries.get("document.json"), documentJson = documentBytes.toString("utf8"), document = JSON.parse(documentJson);
  validateDoclingDocument(document);
  if (document?.schema_name !== "DoclingDocument" || document.version !== "1.10.0" || !Array.isArray(document.body?.children) ||
      manifest.document?.sha256 !== sha256(documentBytes) || manifest.document.bytes !== documentBytes.length) throw new Error("Invalid DoclingDocument");
  const sourcePdf = entries.get("source.pdf");
  if (!sourcePdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || manifest.source.sha256 !== sha256(sourcePdf) || manifest.source.bytes !== sourcePdf.length) throw new Error("Original PDF mismatch");
  const images = imagesOf(document);
  if (JSON.stringify(manifest.images) !== JSON.stringify(images.map(({ data, ...record }) => record))) throw new Error("Image record mismatch");
  for (const name of entries.keys()) if (!validName(name)) throw new Error("Unsupported .docling entry");
  return { manifest, manifestBytes: entries.get("manifest.json"), manifestHash: sha256(entries.get("manifest.json")), documentJson, document, sourcePdf, cacheEntries: new Map([...entries].filter(([name]) => name.startsWith("current/"))), ...(entries.has("review.json") ? { reviewBytes: entries.get("review.json") } : {}) };

}

/** Return bytes only; the generic K1 Host result will own storage. */
export function createDoclingArchive({ manifest, documentJson, sourceBytes, reviewBytes, manifestBytes }) {
  const entries = new Map([["manifest.json", manifestBytes ?? Buffer.from(JSON.stringify(manifest, null, 2))], ["document.json", Buffer.from(documentJson)], ["source.pdf", Buffer.from(sourceBytes)]]);
  if (reviewBytes !== undefined) entries.set("review.json", Buffer.from(reviewBytes));
  validateEntries(entries);
  return packEntries(entries);
}

/** Rewrite only the ledger of an already validated archive; immutable bytes are hash checked. */
export function rewriteReview(archive, reviewBytes, cacheEntries = archive.cacheEntries ?? new Map()) {
  const documentBytes = Buffer.from(archive.documentJson);
  if (sha256(documentBytes) !== archive.manifest.document.sha256 || sha256(archive.sourcePdf) !== archive.manifest.source.sha256 ||
      sha256(archive.manifestBytes) !== archive.manifestHash) throw new Error("Original changed");
  const entries = new Map([["manifest.json", archive.manifestBytes], ["document.json", documentBytes], ["source.pdf", archive.sourcePdf], ["review.json", reviewBytes], ...cacheEntries]);
  for (const name of cacheEntries.keys()) if (!["current/document.md", "current/snapshot.json"].includes(name)) throw new Error("Unsupported cache entry");
  return packEntries(entries);
}

function packEntries(entries) {
  if (entries.size >= 65535) throw new Error("ZIP64 is unsupported");
  const locals = [], directory = [];
  let offset = 0;
  for (const [name, bytes] of entries) {
    const filename = Buffer.from(name), crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, bytes); directory.push(central, filename);
    offset += local.length + filename.length + bytes.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

/** Read our stored ZIP32 envelope without extracting paths or loading external packages. */
export function readDoclingArchive(raw) {
  const bytes = Buffer.from(raw), end = bytes.length - 22;
  if (end < 0 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20)) throw new Error("Unsupported ZIP");
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 65535 || count !== bytes.readUInt16LE(end + 8) || start + size !== end) throw new Error("Invalid ZIP directory");
  const entries = new Map(); let cursor = start, localEnd = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP entry");
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), crc = bytes.readUInt32LE(cursor + 16);
    const length = bytes.readUInt32LE(cursor + 24), nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42);
    if ((flags !== 0 && flags !== 0x800) || method !== 0 || bytes.readUInt32LE(cursor + 20) !== length || bytes.readUInt16LE(cursor + 34) || local !== localEnd || cursor + 46 + nameSize + extra + comment > end) throw new Error("Unsupported ZIP entry");
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize), name = nameBytes.toString("utf8");
    if (!validName(name) || entries.has(name) || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== length || bytes.readUInt32LE(local + 22) !== length || bytes.readUInt16LE(local + 26) !== nameSize) throw new Error("Invalid ZIP local entry");
    const dataStart = local + 30 + nameSize + bytes.readUInt16LE(local + 28);
    if (dataStart + length > start || !bytes.subarray(local + 30, local + 30 + nameSize).equals(nameBytes)) throw new Error("Invalid ZIP bounds");
    const data = bytes.subarray(dataStart, dataStart + length);
    if (crc32(data) !== crc) throw new Error("ZIP checksum mismatch");
    entries.set(name, data); localEnd = dataStart + length;
    cursor += 46 + nameSize + extra + comment;
  }
  if (cursor !== end || localEnd !== start) throw new Error("Invalid ZIP size");
  return validateEntries(entries);
}

/** Preserve numeric source tokens with Node's parser, including uint64 binary_hash. */
export function createDoclingArchiveFromResult({ sourceName, sourceBytes, serverVersions, openapiBytes, profile, task, resultBody }) {
  const raw = Buffer.from(resultBody);
  const lossless = JSON.parse(raw.toString("utf8"), (_key, value, context) => typeof value === "number" ? JSON.rawJSON(context.source) : value);
  if (!["success", "partial_success"].includes(lossless.status)) throw new Error("Conversion failed");
  const errors = JSON.parse(raw.toString("utf8")).errors ?? [];
  const failedPages = [...new Set(errors.map(error => {
    const page = error.page_no ?? error.page ?? /Page (\d+) failed/i.exec(error.error_message ?? error.message ?? "")?.[1];
    if (!Number.isInteger(Number(page)) || Number(page) < 1) throw new Error("Conversion error has no failed page");
    return Number(page);
  }))].sort((a,b)=>a-b);
  if (lossless.status === "partial_success" && !failedPages.length) throw new Error("Partial conversion has no failed page record");
  const documentJson = JSON.stringify(lossless.document?.json_content);
  const document = JSON.parse(documentJson);
  validateDoclingDocument(document);
  if (document.schema_name !== "DoclingDocument" || document.version !== "1.10.0") throw new Error("Unsupported document version");
  const images = imagesOf(document);
  const reference = profile.provenance.openapi_sha256, openapiHash = sha256(openapiBytes);
  const manifest = {
    format: "docling", version: DOCLING_FORMAT_VERSION, converter: { pluginVersion: PLUGIN_VERSION }, status: JSON.parse(raw.toString("utf8")).status, failedPages, createdAt: task.completedAt,
    source: { name: sourceName, sha256: sha256(sourceBytes), bytes: sourceBytes.length },
    server: { versions: serverVersions, openapi: { sha256: openapiHash, referenceSha256: reference, referenceMatch: openapiHash === reference } },
    profile, task,
    result: { sha256: sha256(raw), bytes: raw.length },
    document: { sha256: sha256(Buffer.from(documentJson)), bytes: Buffer.byteLength(documentJson), schemaName: document.schema_name, version: document.version, pageCount: Object.keys(document.pages ?? {}).length },
    images: images.map(({ data, ...record }) => record),
    verification: { imageBytesMatchEmbedded: true, jsonExceptImageUrisMatches: true },
  };
  return createDoclingArchive({ manifest, documentJson, sourceBytes });
}
