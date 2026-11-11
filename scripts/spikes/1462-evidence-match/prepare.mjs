// Run from repository root: pnpm exec tsx scripts/spikes/1462-evidence-match/prepare.mjs
// Large inputs and conversion outputs stay in ignored tmp/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { convertPdfToArchive } from '../../../community-plugins/docling/conversion.js';
import { readDoclingArchive } from '../../../community-plugins/docling/archive.js';

const out = 'tmp/evidence-match';
await mkdir(out, { recursive: true });
const revision = 'ce90560aacaee2482d37c4b25e36e93060ed156c';
for (const name of ['source.pdf', 'document.json']) {
  await writeFile(`${out}/nist-${name}`, execFileSync('git', ['show', `${revision}:plugins/docling/test/fixtures/nist-sp1108r4/${name}`], { maxBuffer: 64 * 1024 * 1024 }));
}
try { await readFile(`${out}/lsr-document.json`); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const started = performance.now();
  const bytes = await convertPdfToArchive({
    file: 'community-plugins/docling/sample/lsr-1.1/LSR-1.1-standards.pdf',
    serverUrl: process.env.DOCLING_SERVER_URL ?? 'http://127.0.0.1:5001',
    onPhase: phase => console.log(phase),
  });
  const archive = readDoclingArchive(bytes);
  await writeFile(`${out}/lsr-document.json`, archive.documentJson);
  await writeFile(`${out}/conversion.json`, JSON.stringify({ elapsedMs: performance.now() - started, versions: archive.manifest.server.versions, profile: archive.manifest.profile }, null, 2));
}
console.log('Inputs ready (LSR conversion is cached on subsequent runs).');
