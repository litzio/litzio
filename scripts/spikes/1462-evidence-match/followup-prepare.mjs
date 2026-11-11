import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { convertPdfToArchive } from '../../../community-plugins/docling/conversion.js';
import { readDoclingArchive } from '../../../community-plugins/docling/archive.js';
const out = 'tmp/evidence-match/followup';
await mkdir(out, { recursive: true });
const protocol = JSON.parse(await readFile(new URL('./followup-protocol.json', import.meta.url), 'utf8'));
const pdf = `${out}/source.pdf`;
try { await readFile(pdf); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  const response = await fetch('https://tsapps.nist.gov/srmext/certificates/1643f.pdf');
  if (!response.ok) throw new Error('Holdout download failed');
  await writeFile(pdf, Buffer.from(await response.arrayBuffer()));
}
try { await readFile(`${out}/document.json`); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  const begin = performance.now();
  const archive = readDoclingArchive(await convertPdfToArchive({ file: pdf, serverUrl: process.env.DOCLING_SERVER_URL ?? 'http://127.0.0.1:5001', onPhase: phase => console.log(phase) }));
  await writeFile(`${out}/document.json`, archive.documentJson);
  await writeFile(`${out}/conversion.json`, JSON.stringify({ elapsedMs: performance.now() - begin, versions: archive.manifest.server.versions, pdfSha256: archive.manifest.source.sha256, jsonSha256: archive.manifest.document.sha256, protocolSha256: createHash('sha256').update(JSON.stringify(protocol)).digest('hex') }, null, 2));
}
console.log('Fresh holdout ready; conversion cached without mutation.');
