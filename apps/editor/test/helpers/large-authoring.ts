import assert from "node:assert/strict";
import { crc32 } from "node:zlib";

// Synthetic stand-in for a large converted PDF (#1763): about 470 KB of canonical
// Markdown and 33 figures, with the same kinds of labels, numbered references,
// footnotes and admonitions a real import produces. No real document content.
const FIGURES = 33, TABLES = 40, HEADINGS = 240, FOOTNOTES = 141, ADMONITIONS = 37, PARAGRAPHS = 885;
const IMAGE_BYTES = 200_000;

function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** Structurally complete PNG with distinct, incompressible-sized payload per index. */
export function syntheticPng(index: number) {
  const header = Buffer.alloc(13); header.writeUInt32BE(256, 0); header.writeUInt32BE(256, 4); header[8] = 8; header[9] = 2;
  const data = Buffer.alloc(IMAGE_BYTES);
  let seed = index * 2654435761 >>> 0;
  for (let i = 0; i < data.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; data[i] = seed >>> 24; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", data), chunk("IEND", Buffer.alloc(0))]);
}

const words = "requirement interconnection voltage frequency response distributed resource operator protection ride-through capability measurement interval setting category performance".split(" ");
const sentence = (seed: number, length: number) => Array.from({ length }, (_, i) => words[(seed * 7 + i * 3) % words.length]).join(" ");

/** SDK AuthoredDocumentRequest for `PUT /api/document` (plus its `authoring` part). */
export function largeAuthoringRequest(paragraphs = PARAGRAPHS) {
  type Block = Record<string, unknown>;
  const blocks: Block[] = [];
  let figure = 0, table = 0, footnote = 0, admonition = 0, heading = 0, references = 0;
  for (let paragraph = 0; paragraph < paragraphs; paragraph++) {
    if (heading < HEADINGS && paragraph % 4 === 0) blocks.push({ kind: "heading", level: 1 + heading % 3, text: `${++heading} ${sentence(heading, 5)}` });
    const content: Block[] = [{ kind: "text", text: `${sentence(paragraph, 40)} ` }];
    // References point at labels authored earlier, like captions numbered by a converter.
    if (figure > 0 && references < 183 && paragraph % 5 === 0) { content.push({ kind: "reference", role: "numref", label: `fig-${1 + paragraph % figure}` }, { kind: "text", text: " " }); references++; }
    if (table > 0 && references < 183 && paragraph % 5 === 2) { content.push({ kind: "reference", role: "numref", label: `tbl-${1 + paragraph % table}` }, { kind: "text", text: " " }); references++; }
    const noted = footnote < FOOTNOTES && paragraph % 6 === 1;
    if (noted) content.push({ kind: "footnote", label: `n${++footnote}` });
    blocks.push({ kind: "paragraph", content });
    if (noted) blocks.push({ kind: "footnote", label: `n${footnote}`, text: sentence(footnote, 18) });
    if (admonition < ADMONITIONS && paragraph % 24 === 3) blocks.push({ kind: "admonition", variant: "note", text: sentence(++admonition, 25) });
    if (figure < FIGURES && paragraph % 27 === 13) {
      figure++;
      blocks.push({ kind: "figure", imageAsset: `figure-${figure}`, imageAlt: `Figure ${figure}`, caption: sentence(figure, 12), label: `fig-${figure}`, enumerator: String(figure) });
    }
    if (table < TABLES && paragraph % 22 === 7) {
      table++;
      blocks.push({ kind: "table", rows: [["Parameter", "Range", "Default"], ...Array.from({ length: 6 }, (_, row) => [sentence(table + row, 3), `${row}–${row + 10}`, String(row)])],
        caption: sentence(table, 8), label: `tbl-${table}`, enumerator: String(table) });
    }
  }
  return {
    authoring: { title: "Synthetic large import", inputs: [{ key: "document", blocks }] },
    images: Array.from({ length: figure }, (_, index) => ({ key: `figure-${index + 1}`, mime: "image/png", base64: syntheticPng(index + 1).toString("base64") })),
  };
}

// Owner limit (#1763): every health round trip during the save stays within 3 s.
// With the authoring thread the measured maximum is a few hundred ms (request
// parsing and image writes stay on the main thread), against ~10 s of blocking
// without it, so 3 s separates the two states with wide margin on slower CI machines.
export const HEALTH_LIMIT_MS = 3000;
const PROBE_INTERVAL_MS = 250;

/** Saves through `PUT /api/document` while a client in this process probes health and a small read every 250 ms. */
export async function measureAuthoringSave(url: string, protocol: string, target: string, small: string, request: ReturnType<typeof largeAuthoringRequest>) {
  const body = JSON.stringify({ path: target, ...request });
  const health: number[] = [], pending: Promise<unknown>[] = [], failures: string[] = [];
  const record = (label: string) => (error: Error & { cause?: { code?: string } }) => { failures.push(`${label}: ${error.cause?.code ?? error.message}`); };
  // Only a read issued after the save request counts: it must overlap the computation.
  let issued = false, saved = false, smallReadBeforeSave = false;
  const probe = () => {
    const started = performance.now(), duringSave = issued;
    pending.push(fetch(`${url}/daemon/health`, { headers: { "x-litzio-protocol": protocol } }).then(async response => {
      assert.equal(response.status, 200); await response.arrayBuffer();
      health.push(performance.now() - started);
    }).catch(record("health")));
    pending.push(fetch(`${url}/api/document?path=${encodeURIComponent(small)}`).then(async response => {
      assert.equal(response.status, 200); await response.arrayBuffer();
      if (duringSave && !saved) smallReadBeforeSave = true;
    }).catch(record("small read")));
  };
  const timer = setInterval(probe, PROBE_INTERVAL_MS);
  probe();
  const saving = fetch(`${url}/api/document`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: url }, body });
  issued = true;
  const response = await saving;
  const receipt = await response.json() as { path: string; source: string; revision: string; identity: unknown; inputs: unknown };
  saved = true;
  clearInterval(timer);
  await Promise.all(pending);
  const sorted = [...health].sort((a, b) => a - b), maximum = sorted.at(-1) ?? Infinity;
  const summary = `${health.length} health probes, median ${Math.round(sorted[sorted.length >> 1] ?? NaN)} ms, max ${Math.round(maximum)} ms, failed ${failures.length}`;
  const check = () => {
    assert.equal(response.status, 201, JSON.stringify(receipt));
    assert.deepEqual(failures, [], "probes failed while saving");
    assert.ok(maximum <= HEALTH_LIMIT_MS, `health max ${Math.round(maximum)} ms exceeds ${HEALTH_LIMIT_MS} ms`);
    assert.ok(smallReadBeforeSave, "a small document read issued during the large save must succeed before it completes");
  };
  return { receipt, maximum, summary, check };
}
