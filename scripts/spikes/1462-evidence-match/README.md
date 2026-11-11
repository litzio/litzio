# #1462 independent PDF evidence spike

Non-merging experiment on `spike/1462-evidence-match`, base `519a1018`.
The [report](../../../docs/reviews/1462-spike-evidence-match.md) describes the failed noise criterion.
No product code, SDK, UI, document format, or AI invocation is changed or added.

`protocol.json` fixes the selection and scoring rules before the first matching run.
`measurement.json` is the small measured result, with source hashes, complete case verdicts,
per-page counts, timings, and fingerprints of all baseline alert texts.
`noise-labels.json` assigns one primary cause to every baseline alert; it never controls matching.
Mixed alerts have one primary cause, so category counts sum to the alert total.

From repository root on Node 24, after `pnpm install --frozen-lockfile`:

```powershell
# Only needed to produce the LSR DoclingDocument if no cached JSON exists.
# Use the existing container, and stop it afterwards only if this run started it.
docker start docling-serve
# Wait for GET http://127.0.0.1:5001/ready to return {"status":"ok"}.
pnpm exec tsx scripts/spikes/1462-evidence-match/prepare.mjs
pnpm exec tsx --tsconfig scripts/spikes/1462-evidence-match/tsconfig.json scripts/spikes/1462-evidence-match/run.mjs
node scripts/spikes/1462-evidence-match/summarize.mjs
docker stop docling-serve
```

Preparation retrieves the NIST PDF and immutable Docling JSON from repository commit
`ce90560aacaee2482d37c4b25e36e93060ed156c`. The existing conversion helper makes the LSR
JSON with the unchanged `litzio-pdf-en-v1` profile; raw JSON from another run may instead
be placed at `tmp/evidence-match/lsr-document.json`. Exact reproduction requires the
hash in `measurement.json`; summarization refuses drift instead of reusing stale labels.
The small tsconfig resolves the SDK's repository source for the unmodified community
converter, which is outside the pnpm workspace. It changes no package manifest or dependency.

All generated PDF evidence (page text items, viewport point positions, baseline lines),
tokens, LCS matches, full alerts,
initial canonical Litzio sources, and 12 independently mutated sources stay in ignored
`tmp/evidence-match/`. `result.json` contains both baseline comparisons and case results.
`summary.json` validates exhaustive labels and hashes against the committed measurement.
Timings are expected to vary. No raw NIST excerpt, image, PDF, or large conversion output is committed.

`run.mjs` uses the editor's pinned `pdfjs-dist` legacy Node build. Both the initial source
and every mutation go through existing Core read/write operations. The script checks
canonical writes, variant round trips, source JSON immutability, duplicate/deletion
detection, and strict number/unit/comparison/superscript differences. It does not run
Host, SDK workers, browsers, or agents. LCS allocation is explicitly capped at
140 million Uint16 cells; larger inputs must stop this spike rather than grow a library.

Only the LSR receives injections; the independent NIST 3-page slice measures baseline
noise. Its full JSON is converted unchanged, then the requested pages' output units
are selected using the converter's report and original provenance. Every PDF text item
on the selected pages remains eligible. LSR matching uses no Docling provenance.
