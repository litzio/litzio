# #1315 historical SDK comparison experiment

This branch preserves a local experiment, not a product completion or a PR.
See [the full report](../../docs/reviews/sdk-compare-boundary-1315.md), including the known stale-navigation defect and unimplemented requirements.

Tracked reproduction inputs:

- `prepare.py`: extracts only NIST DoclingDocument and PNGs from archived Git SHA; no legacy Markdown/map input.
- `host.js`: external plugin template importing only the public SDK root and Node APIs.
- `run.mjs`: production Host + actual CLI scaffold/validate/register/trust/enable/invoke/K1/review lifecycle.
- `measure.mjs`: CLI mapping, revision-stale observations and restoration of original bytes.
- `preserve.py`: copies existing raw observations to a private ZIP outside this worktree, verifies every entry, and creates path-redacted evidence. The local ZIP location is deliberately ignored, not committed.
- `privacy-check.py`: staged text scan for local identities/paths and common credential forms; raster captures require manual review. The unchanged neutral `Example` OneDrive fixture is explicitly excluded from path warnings.
- `evidence/`: sanitized historical CLI/failure records, test/build output, measurements, input digests and the raw archive hash. Redacted copies are not fresh runs or unmodified raw transcripts.
- `nist-*.png`: reviewed raster captures; source/fixture paths are absent, and the account display in the Korean dark capture is masked. PNG text metadata was checked.
- The browser scenario and platform experiment are tracked in their repository locations.

Run from the repository root using the commands in the report. Each prepare creates a new external fixture root. Port 5197 must be free; the runner does not validate exclusive ownership of an already-running server, so do not run it against an occupied port. The foreground runner must be stopped and its exact owned process tree checked after use; Windows Ctrl-C alone did not clean up the recorded run.

The NIST materials retain their NIST rights basis and are not relicensed as MIT. Source: Gopstein et al. (2021), NIST SP 1108r4, doi:10.6028/NIST.SP.1108r4. Republished courtesy of the National Institute of Standards and Technology. The stored input inventory/hashes and archived Git SHA permit re-extraction without committing another copy of the dataset.

Ignored residuals intentionally remain local: raw JSON/logs, runtime paths, private preservation location, and one-off implementation edit scripts. Generated dist/node_modules/tmp are not evidence of a product release. The committed sanitized evidence remains available from Git after this checkout is archived; the private raw ZIP is outside the checkout and must not be published without a separate privacy review.
