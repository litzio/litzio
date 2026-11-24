import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { cp, lstat } from "node:fs/promises";
import path from "node:path";
import { canonicalFilePath, inside } from "../file-access.ts";
import { artifactDigest } from "./artifact-digest.mjs";

export const installationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const includeSourceFile = (file: string) => path.basename(file).toLowerCase() !== ".git";
// Dependency changes show in package.json and the lockfile; hashing node_modules would stall the Host.
const digestSourceFile = (file: string) => includeSourceFile(file) && path.basename(file).toLowerCase() !== "node_modules";

/** Resolve aliases in the existing prefix even when a registered source has gone missing. */
function canonicalRecordedPath(directory: string): string {
  try { return canonicalFilePath(directory); }
  catch (error) {
    const parent = path.dirname(directory);
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || parent === directory ||
        lstatSync(directory, { throwIfNoEntry: false })) throw error;
    return path.join(canonicalRecordedPath(parent), path.basename(directory));
  }
}

/** Private to the Host that owns the registration file. */
export class InstalledArtifacts {
  private readonly location: string;
  private pinnedRoot?: string;
  constructor(settingsFile: string, private warn = console.warn) { this.location = path.resolve(`${settingsFile}.artifacts`); }

  private root(): string {
    const directory = canonicalFilePath(path.dirname(this.location));
    const root = path.join(directory, path.basename(this.location));
    if (this.pinnedRoot && path.relative(this.pinnedRoot, root) !== "") throw new Error("Host plugin artifact storage moved");
    this.checkDirectory(root);
    this.pinnedRoot ??= root;
    return root;
  }

  private checkDirectory(directory: string) {
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (entry.isSymbolicLink() || !entry.isDirectory() || path.relative(directory, canonicalFilePath(directory)) !== "")) {
      throw new Error("Invalid Host plugin artifact directory");
    }
  }

  directory(installationId: string): string {
    if (!installationIdPattern.test(installationId)) throw new Error("Invalid plugin installation ID");
    const directory = path.join(this.root(), installationId);
    this.checkDirectory(directory);
    return directory;
  }

  /** Authoring and management work never targets installed copies; only Host loading writes there. */
  assertOutside(directory: string) {
    const storage = path.join(canonicalRecordedPath(path.dirname(this.location)), path.basename(this.location));
    if (inside(storage, canonicalRecordedPath(path.resolve(directory)))) {
      throw Object.assign(new Error("Installed plugin copies belong to the Host; use the plugin source folder"), { code: "installed_copy" });
    }
  }

  /** Install and update check share this rule: the recorded source digest skips .git and node_modules. */
  sourceDigest(source: string): string { return artifactDigest(source, digestSourceFile); }

  /** Asynchronous so a large node_modules does not stop the Host from serving other requests. */
  async copy(source: string) {
    mkdirSync(path.dirname(this.location), { recursive: true });
    const root = this.root();
    if (inside(root, source) || inside(source, root)) throw new Error("Plugin source overlaps Host artifact storage");
    const installationId = randomUUID();
    const directory = this.directory(installationId);
    mkdirSync(root, { recursive: true });
    mkdirSync(directory);
    try {
      await cp(source, directory, { recursive: true, filter: async file => {
        if (!includeSourceFile(file)) return false;
        const entry = await lstat(file);
        if (!entry.isDirectory() && !entry.isFile()) throw new Error("Artifact must contain real files, not linked dependencies");
        return true;
      } });
      const sourceDigest = this.sourceDigest(directory);
      if (this.sourceDigest(source) !== sourceDigest) throw new Error("Plugin source changed while copying");
      return { installationId, directory, sourceDigest };
    } catch (error) {
      this.remove(installationId);
      throw error;
    }
  }

  remove(installationId: string) {
    try { rmSync(this.directory(installationId), { recursive: true, force: true }); }
    catch { this.warn("Unable to clean up a Host plugin artifact"); }
  }

  cleanOrphans(retained: ReadonlySet<string>, sources: readonly string[]) {
    const root = this.root();
    if (!lstatSync(root, { throwIfNoEntry: false })) return;
    const registered = [...Array.from(retained, id => path.join(root, id)), ...sources];
    const protectedPaths = registered.flatMap(directory => [directory, canonicalRecordedPath(directory)]);
    for (const name of readdirSync(root)) {
      const candidate = path.join(root, name);
      if (installationIdPattern.test(name) &&
          !protectedPaths.some(directory => inside(candidate, directory) || inside(directory, candidate))) this.remove(name);
    }
  }
}
