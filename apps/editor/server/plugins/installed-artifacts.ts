import { randomUUID } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { canonicalFilePath, inside } from "../file-access.ts";
import { artifactDigest } from "./artifact-digest.mjs";

export const installationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const includeSourceFile = (file: string) => path.basename(file).toLowerCase() !== ".git";

/** Private to the Host that owns the registration file. Source paths never enter cleanup. */
export class InstalledArtifacts {
  private readonly location: string;
  private pinnedRoot?: string;
  constructor(settingsFile: string) { this.location = path.resolve(`${settingsFile}.artifacts`); }

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

  copy(source: string) {
    mkdirSync(path.dirname(this.location), { recursive: true });
    const root = this.root();
    if (inside(root, source) || inside(source, root)) throw new Error("Plugin source overlaps Host artifact storage");
    const installationId = randomUUID();
    const directory = this.directory(installationId);
    mkdirSync(root, { recursive: true });
    mkdirSync(directory);
    try {
      cpSync(source, directory, { recursive: true, filter: file => {
        if (!includeSourceFile(file)) return false;
        const entry = lstatSync(file);
        if (!entry.isDirectory() && !entry.isFile()) throw new Error("Artifact must contain real files, not linked dependencies");
        return true;
      } });
      const sourceDigest = artifactDigest(directory);
      if (artifactDigest(source, includeSourceFile) !== sourceDigest) throw new Error("Plugin source changed while copying");
      return { installationId, directory, sourceDigest };
    } catch (error) {
      this.remove(installationId);
      throw error;
    }
  }

  remove(installationId: string) {
    try { rmSync(this.directory(installationId), { recursive: true, force: true }); }
    catch { console.warn("Unable to clean up a Host plugin artifact"); }
  }

  cleanOrphans(retained: ReadonlySet<string>) {
    const root = this.root();
    if (!lstatSync(root, { throwIfNoEntry: false })) return;
    for (const name of readdirSync(root)) {
      if (installationIdPattern.test(name) && !retained.has(name)) this.remove(name);
    }
  }
}
