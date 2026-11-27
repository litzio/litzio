/**
 * Generic Markdown reference (not a Q1 criterion): tracked repository .md files read by Core with a
 * marker prepended (as in the 11-25 measurement), and by each candidate reader without a marker.
 * "stable" = the candidate's own write of what it read reads back to the same model.
 */
import { writeFileSync } from "node:fs";
import { parse } from "../../../packages/core/src/index.ts";
import { Unsupported } from "./directive/read.ts";
import { PROFILES } from "./profiles.ts";
import { canonicalJson } from "./roundtrip.ts";
import { trackedMarkdown } from "./corpus.ts";

const files = trackedMarkdown();
const withMarker = (source: string) => {
  const text = source.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (/^---\n/.test(text)) {
    const end = text.indexOf("\n---", 4);
    return end > 0 && !/^litzio:/m.test(text.slice(4, end)) ? `---\nlitzio: 1\n${text.slice(4)}` : text;
  }
  return `---\nlitzio: 1\n---\n\n${text}`;
};
const core: Record<string, number> = {};
for (const { source } of files) {
  try { parse(withMarker(source)); core.accepted = (core.accepted ?? 0) + 1; }
  catch (error: any) { const key = error?.code ?? "error"; core[key] = (core[key] ?? 0) + 1; }
}
const report: Record<string, unknown> = { files: files.length, core };
for (const name of ["directive", "external"]) {
  const profile = PROFILES[name];
  const counts: Record<string, number> = {};
  let stable = 0;
  for (const { source } of files) {
    try {
      const model = profile.readDocument(source.replace(/\r\n/g, "\n"), { requireMarker: false });
      counts.accepted = (counts.accepted ?? 0) + 1;
      const written = profile.writeDocument({ ...model, frontmatter: { litzio: 1, ...model.frontmatter } });
      if (canonicalJson(profile.readDocument(written).blocks) === canonicalJson(model.blocks)) stable++;
    } catch (error) {
      const key = error instanceof Unsupported ? error.category : "error";
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  report[name] = { ...counts, stableAfterOwnWrite: stable };
}
writeFileSync(new URL("../results/generic.json", import.meta.url), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report));
