import { brand } from "../../../brand.ts";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import type { SampleAvailability, SampleDocuments } from "../shared/document-protocol.ts";

const FILES = ["converter-control.md", "references.bib", "assets/current-loop.svg"];

/** Never traverse a junction, including in the parent path of the destination. */
function realDirectories(folder: string): void {
  const parent = path.dirname(folder);
  if (parent !== folder) realDirectories(parent);
  const stat = lstatSync(folder, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Sample folder is not a real directory: ${folder}`);
}

/** Validate the whole tree without following links before any recursive removal. */
function realTree(folder: string): boolean {
  realDirectories(folder);
  if (!lstatSync(folder, { throwIfNoEntry: false })) return false;
  for (const name of readdirSync(folder)) {
    const file = path.join(folder, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new Error(`Sample contains a linked or unsupported entry: ${file}`);
    if (stat.isDirectory()) realTree(file);
  }
  return true;
}

function copySamples(source: string, destination: string): SampleDocuments {
  destination = path.resolve(destination);
  const paths = { ko: path.join(destination, "ko", "converter-control.md"), en: path.join(destination, "en", "converter-control.md") };
  realTree(destination);

  const parent = path.dirname(destination);
  mkdirSync(parent, { recursive: true });
  const staged = mkdtempSync(path.join(parent, `.${brand.appName}-sample-stage-`));
  try {
    // Keep ASAR reads on Electron's established single-file copy path.
    for (const language of ["ko", "en"]) {
      mkdirSync(path.join(staged, language, "assets"), { recursive: true });
      for (const file of FILES) copyFileSync(path.join(source, language, file), path.join(staged, language, file));
    }
    let backup: string | undefined;
    // Recheck after copying, before moving or deleting anything at the old path.
    if (realTree(destination)) {
      backup = `${staged}-previous`;
      if (lstatSync(backup, { throwIfNoEntry: false })) throw new Error(`Sample backup path already exists: ${backup}`);
      renameSync(destination, backup);
    }
    try { renameSync(staged, destination); }
    catch (cause) {
      if (backup) {
        try { renameSync(backup, destination); }
        catch { throw new Error(`Sample installation failed; the previous copy is kept at ${backup}`, { cause }); }
      }
      throw cause;
    }
    if (backup && realTree(backup)) rmSync(backup, { recursive: true });
    return paths;
  } finally {
    if (lstatSync(staged, { throwIfNoEntry: false })) {
      // Only this call's generated sibling is cleaned; never traverse a substituted junction.
      realTree(staged);
      rmSync(staged, { recursive: true });
    }
  }
}

/** A sample failure is an optional Host capability failure, never a document-start failure. */
export function prepareSampleDocuments(source: string, destination: string, onWarning: (message: string) => void = console.error): SampleAvailability {
  try { return { samples: copySamples(source, destination) }; }
  catch (cause) {
    onWarning(`Sample documents unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { sampleProblem: "unavailable" };
  }
}
