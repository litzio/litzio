import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x } from "tar";

/** Publish only a complete extraction, including when several Hosts race. */
export async function prepareScreenNpm(archive: string, cache: string) {
  const started = performance.now();
  const payload = await readFile(archive);
  const digest = createHash("sha256").update(payload).digest("hex");
  const target = path.join(cache, `npm-${digest}`), entry = path.join(target, "bin/npm-cli.js");
  const ready = () => stat(entry).then(value => value.isFile(), error => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (await ready()) return { entry, extracted: false, milliseconds: Math.round(performance.now() - started) };
  await mkdir(cache, { recursive: true });
  const staging = await mkdtemp(path.join(cache, ".npm-"));
  let extracted = false;
  try {
    await pipeline(Readable.from([payload]), x({ cwd: staging, strict: true }));
    if (!(await stat(path.join(staging, "bin/npm-cli.js"))).isFile()) throw new Error("Bundled npm entry is missing");
    try { await rename(staging, target); extracted = true; }
    catch (error) { if (!(await ready())) throw error; }
  } finally {
    // This unique directory is owned by this attempt; an interrupted one is never reused.
    if (!extracted) await rm(staging, { recursive: true, force: true });
  }
  return { entry, extracted, milliseconds: Math.round(performance.now() - started) };
}
