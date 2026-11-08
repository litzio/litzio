import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";

// Plugin-owned .docling v1: ZIP32, stored entries only. No filesystem extraction.
// Node has no ZIP API; this deliberately supports our small fixed envelope, not general ZIP.
const validName = name => name === "manifest.json" || name === "document.json" || /^pages\/[1-9]\d*\.png$/.test(name);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function validateManifest(manifest) {
  if (manifest?.format !== "docling" || manifest.version !== 1 ||
      typeof manifest.source?.name !== "string" || !manifest.source.name || /[/\\]/.test(manifest.source.name) ||
      !/^[a-f0-9]{64}$/.test(manifest.source.sha256) ||
      typeof manifest.doclingServe?.version !== "string" || !manifest.doclingServe.version ||
      !manifest.doclingServe.options || typeof manifest.doclingServe.options !== "object" || Array.isArray(manifest.doclingServe.options) ||
      typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))) throw new Error("Invalid .docling manifest");
}
function validateEntries(entries) {
  if (!entries.has("manifest.json") || !entries.has("document.json")) throw new Error("Incomplete .docling");
  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  validateManifest(manifest);
  const documentJson = entries.get("document.json").toString("utf8");
  const document = JSON.parse(documentJson);
  if (document?.schema_name !== "DoclingDocument" || !Array.isArray(document.body?.children)) throw new Error("Invalid DoclingDocument");
  const pages = [];
  for (const [name, bytes] of entries) {
    if (!validName(name)) throw new Error("Unsupported .docling entry");
    if (name.startsWith("pages/")) {
      if (!bytes.subarray(0, 8).equals(pngSignature)) throw new Error("Expected PNG page");
      pages.push({ page: Number(name.slice(6, -4)), bytes });
    }
  }
  // Every declared page must have its original image; images are never regenerated here.
  const expected = Object.keys(document.pages ?? {});
  if (!expected.length || expected.length !== pages.length || expected.some(page => !entries.has(`pages/${page}.png`))) throw new Error("Missing page image");
  return { manifest, documentJson, document, pages };
}

/** Return bytes only. The Host's future generic K1 file result owns all storage. */
export function createDoclingArchive({ sourceName, sourceSha256, serveVersion, options, documentJson, pages, createdAt = new Date().toISOString() }) {
  const manifest = { format: "docling", version: 1, source: { name: sourceName, sha256: sourceSha256 }, doclingServe: { version: serveVersion, options }, createdAt };
  const entries = new Map([["manifest.json", Buffer.from(JSON.stringify(manifest, null, 2))], ["document.json", Buffer.from(documentJson)]]);
  for (const { page, bytes } of pages) {
    const name = `pages/${page}.png`;
    if (entries.has(name)) throw new Error("Duplicate page");
    entries.set(name, Buffer.from(bytes));
  }
  validateEntries(entries);
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

/** Package the verified inbody/embedded API result; no requests or storage here. */
export function createDoclingArchiveFromResponse({ sourceName, sourceBytes, serveVersion, options, response, createdAt }) {
  if (response?.status !== "success") throw new Error("Conversion did not succeed");
  const document = response.document?.json_content;
  const pages = Object.values(document?.pages ?? {}).map(page => {
    const uri = page.image?.uri;
    if (page.image?.mimetype !== "image/png" || typeof uri !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri)) throw new Error("Expected embedded PNG page");
    return { page: page.page_no, bytes: Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64") };
  });
  return createDoclingArchive({ sourceName, sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"), serveVersion, options, documentJson: JSON.stringify(document), pages, createdAt });
}
