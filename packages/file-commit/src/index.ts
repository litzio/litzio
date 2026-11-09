import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Strict text decoding preserves a leading BOM for the caller's source/revision. */
export function decodeUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (cause) { throw new Error("Invalid UTF-8 input; nothing was written", { cause }); }
}

/** Reject lossy UTF-8 encoding of text or a Host filesystem locator. */
export function assertUnicode(text: string): void {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error("Invalid Unicode: unpaired surrogate; nothing was written");
}

/** The revision of valid UTF-8 text, identical to the hash of its encoded bytes. */
export function textRevision(text: string): string {
  assertUnicode(text);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export class FileChangedError extends Error {
  constructor(filePath: string) {
    super(`${filePath} changed after it was read; nothing was written`);
    this.name = "FileChangedError";
  }
}

function assertRevision(filePath: string, target: string, revision: string): void {
  if (createHash("sha256").update(fs.readFileSync(target)).digest("hex") !== revision) {
    throw new FileChangedError(filePath);
  }
}

/** Read-only checks shared by previews and commits; does not guarantee later write/rename I/O. */
export function preflightFileCommit(filePath: string, text: string, revision: string): { target: string; mode: number } {
  assertUnicode(text);
  // Preserve a symlink itself by replacing its resolved target.
  // On Windows the JS resolver can retain a case alias. Renaming over that alias
  // would change the stored leaf spelling on Save, so preserve the native name.
  const target = process.platform === "win32" ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
  assertRevision(filePath, target, revision);
  // A rename needs only directory permission; still refuse a file that cannot be written.
  fs.accessSync(target, fs.constants.W_OK);
  const { mode } = fs.statSync(target);
  return { target, mode };
}

/**
 * Replace an existing file with UTF-8 text while it still has the revision the caller read.
 * The text is completed in a temporary sibling, the revision is checked again, and the
 * sibling is renamed over the file. A failure keeps the file and removes the sibling.
 * The last check and the rename are separate steps: this is not an atomic compare-and-swap.
 */
export function commitFile(filePath: string, text: string, revision: string): void {
  const { target, mode } = preflightFileCommit(filePath, text, revision);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx", mode });
    // The creation mode is reduced by the umask; the replacement keeps the file's own.
    fs.chmodSync(temporary, mode & 0o7777);
    assertRevision(filePath, target, revision);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * Publish completed UTF-8 text under a new name, atomically refusing any existing
 * directory entry (including a symlink). Requires same-filesystem hard links;
 * unsupported filesystems fail without falling back to a non-exclusive rename.
 * A process crash may leave a temporary sibling, never an empty reserved target.
 * fsync completes before publication; power-loss directory durability is not promised.
 */
export function createFile(filePath: string, text: string): void {
  assertUnicode(filePath);
  assertUnicode(text);
  const target = path.join(fs.realpathSync(path.dirname(filePath)), path.basename(filePath));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporary, target);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

/** Copy opaque bytes with bounded memory into a Host-owned sibling, then publish
 * with the same exclusive hard-link protocol as createFile. The staging inode is
 * never published: later plugin writes cannot mutate the committed result.
 * beforePublish lets the owner recheck its Root and cancellation/lifetime boundary.
 */
export async function createFileFromPath(filePath: string, source: string, maxBytes: number, beforePublish: (target: string) => void = () => {}): Promise<string> {
  return publishFileFromPath(filePath, source, maxBytes, beforePublish);
}

/** Replace plugin-owned opaque bytes with revision checks and a completed temporary sibling. */
export async function commitFileFromPath(filePath: string, source: string, revision: string, maxBytes: number, beforePublish: (target: string) => void = () => {}): Promise<string> {
  return publishFileFromPath(filePath, source, maxBytes, beforePublish, revision);
}

async function publishFileFromPath(filePath: string, source: string, maxBytes: number, beforePublish: (target: string) => void, revision?: string): Promise<string> {
  assertUnicode(filePath);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Invalid file size limit");
  if (!fs.lstatSync(source).isFile()) throw new Error("Expected a regular staging file");
  const replacement = revision === undefined ? undefined : preflightFileCommit(filePath, "", revision);
  const target = replacement?.target ?? path.join(fs.realpathSync(path.dirname(filePath)), path.basename(filePath));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  const input = await fs.promises.open(source, "r");
  let created = false;
  try {
    const info = await input.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error("File result exceeds size limit or is not regular");
    const output = fs.createWriteStream(temporary, { flags: "wx", mode: 0o600, flush: true });
    output.once("open", () => { created = true; });
    const hash = createHash("sha256"); let size = 0;
    await pipeline(input.createReadStream(), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) return callback(new Error("File result exceeds size limit"));
      hash.update(chunk); callback(null, chunk);
    } }), output);
    beforePublish(target);
    if (replacement) {
      fs.chmodSync(temporary, replacement.mode & 0o7777);
      assertRevision(filePath, target, revision!);
      fs.renameSync(temporary, target);
    } else fs.linkSync(temporary, target);
    return hash.digest("hex");
  } finally {
    await input.close();
    if (created) fs.rmSync(temporary, { force: true });
  }
}
