// Optional, local-only input preparation. Reuses the existing fixed conversion profile.
// Run from repository root: pnpm exec tsx scripts/spikes/1462-block-identity/prepare-lsr.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { convertPdfToArchive } from "../../../community-plugins/docling/conversion.js";
import { readDoclingArchive } from "../../../community-plugins/docling/archive.js";

await mkdir("tmp/block-identity", { recursive: true });
// Passing an existing raw result path replays evidence extraction without a server request.
async function preserveResult(raw: string) {
  const result = JSON.parse(raw);
  await writeFile("tmp/block-identity/lsr-result.json", raw);
  await writeFile("tmp/block-identity/lsr-document.json", JSON.stringify(result.document.json_content));
  console.log(JSON.stringify({ status: result.status, errors: result.errors }));
  if (result.status !== "success") process.exitCode = 1;
}
if (process.argv[2]) {
  await preserveResult(await readFile(process.argv[2], "utf8"));
} else {
  try {
    let lastPhase = "";
    const bytes = await convertPdfToArchive({
      file: "community-plugins/docling/sample/lsr-1.1/LSR-1.1-standards.pdf",
      serverUrl: "http://127.0.0.1:5001", onPhase: phase => {
        if (phase !== lastPhase) console.log(phase);
        lastPhase = phase;
      },
    });
    const archive = readDoclingArchive(bytes);
    await writeFile("tmp/block-identity/lsr-document.json", archive.documentJson);
    await writeFile("tmp/block-identity/lsr-conversion.json", JSON.stringify({
      source: archive.manifest.source, document: archive.manifest.document,
      profile: archive.manifest.profile, server: archive.manifest.server,
      task: archive.manifest.task, result: archive.manifest.result,
    }, null, 2));
    console.log("Saved successful local LSR conversion; page images are not committed.");
  } catch (error) {
    // Read the already submitted task. Never resubmit after archive refusal.
    if (!error.taskId) throw error;
    const response = await fetch("http://127.0.0.1:5001/v1/result/" + encodeURIComponent(error.taskId));
    if (!response.ok) throw error;
    await preserveResult(await response.text());
    process.exitCode = 1; // Evidence retained does not mean conversion accepted.
  }
}
