import { createHash } from "node:crypto";
import { readdirSync, lstatSync, realpathSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
export function artifactDigest(directory) {
    const hash = createHash("sha256");
    const walk = (dir) => { for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (lstatSync(file).isSymbolicLink()) throw new Error("Artifact must contain real files, not linked dependencies");
      const relative = path.relative(directory, realpathSync(file));
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Package reference escapes artifact");
      const metadata = statSync(file);
      hash.update(JSON.stringify([path.relative(directory, file).replaceAll("\\", "/"), metadata.isDirectory() ? "directory" : "file", metadata.isDirectory() ? 0 : metadata.size]));
      if (metadata.isDirectory()) walk(file); else hash.update(readFileSync(file));
    } };
    walk(directory);
    return hash.digest("hex");
}
