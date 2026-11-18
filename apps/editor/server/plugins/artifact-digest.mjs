import { createHash } from "node:crypto";
import { readdirSync, lstatSync, realpathSync, statSync, readFileSync } from "node:fs";
import { readdir, lstat, realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";

/** Shared admission and hash input for both walks: real files and directories inside the artifact. */
function entryHeader(directory, file, linked, real, metadata) {
  if (linked) throw new Error("Artifact must contain real files, not linked dependencies");
  const relative = path.relative(directory, real);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Package reference escapes artifact");
  if (!metadata.isDirectory() && !metadata.isFile()) throw new Error("Artifact must contain real files");
  return JSON.stringify([path.relative(directory, file).replaceAll("\\", "/"), metadata.isDirectory() ? "directory" : "file", metadata.isDirectory() ? 0 : metadata.size]);
}

export function artifactDigest(directory, include = () => true) {
    const hash = createHash("sha256");
    const walk = (dir) => { for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (!include(file)) continue;
      const linked = lstatSync(file).isSymbolicLink();
      const metadata = linked ? undefined : statSync(file);
      hash.update(entryHeader(directory, file, linked, linked ? file : realpathSync(file), metadata));
      if (metadata.isDirectory()) walk(file); else hash.update(readFileSync(file));
    } };
    walk(directory);
    return hash.digest("hex");
}

/** Same digest without holding the event loop; reads a bounded batch at a time and hashes in order. */
export async function artifactDigestAsync(directory, include = () => true) {
  const hash = createHash("sha256");
  const read = async (file) => {
    const linked = (await lstat(file)).isSymbolicLink();
    const metadata = linked ? undefined : await stat(file);
    const header = entryHeader(directory, file, linked, linked ? file : await realpath(file), metadata);
    return { file, header, directory: metadata.isDirectory(), bytes: metadata.isDirectory() ? undefined : await readFile(file) };
  };
  const walk = async (dir) => {
    const files = (await readdir(dir)).sort().map(name => path.join(dir, name)).filter(file => include(file));
    for (let start = 0; start < files.length; start += 64) {
      for (const entry of await Promise.all(files.slice(start, start + 64).map(read))) {
        hash.update(entry.header);
        if (entry.directory) await walk(entry.file); else hash.update(entry.bytes);
      }
    }
  };
  await walk(directory);
  return hash.digest("hex");
}
