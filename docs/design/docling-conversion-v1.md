# Docling conversion v1

- Status: Implemented
- Structure-review verification: 2026-11-02 (#884; synthetic fake-service and installed Host/worker tests; real-provider flow trial and owner checks described below).
- Dashboard verification: 2026-11-01 (#871; synthetic Host receipts/results, feature lifecycle, 1440px English Light and 640px Korean Dark; real service remains manual).
- Plugin-folder verification: 2026-11-01 (#869; independent folder build/typecheck/tests, shared Host, CLI and unchanged Docling conversion browser assertions; no real Docling service launched).
- Worker boundary verified: 2026-10-31 (#853 synthetic REST/shared Host tests; real service and packaged checks follow the plugin contract).
- Last verified: 2026-10-30 (module/CLI tests, public and synthetic fixtures, canonical reopen, local IEEE conversion and NIST PDF REST conversion).
- Scope: `@litzio/docling` and thin CLI, under [ADR-0011](../adr/0011-code-module-boundary.md).
- Decisions: [#766](https://github.com/litzio/litzio/discussions/766), [#767](https://github.com/litzio/litzio/discussions/767), table flattening [#778](https://github.com/litzio/litzio/issues/778); implementation [#768](https://github.com/litzio/litzio/issues/768), [#780](https://github.com/litzio/litzio/issues/780).

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Input and output

`litzio docling convert <document.json> --output <new-folder>` converts the
**whole** DoclingDocument 1.10.0. There is no chapter/range option. The destination
must not exist. It contains `document.md`, `document.docling-map.json` and copied
image assets. Input files remain unchanged. Automatic heading numbers are off;
original heading numbers remain literal heading text. PDF extraction and OCR
run in an external Docling service. Automated tests use saved data or a fake HTTP
server and never launch Docling.

Conversion uses only public Core creation, semantic operations and read models.
All output passes Core serialization and byte-stable parse/serialize reopening.
Failures to preserve an individual source structure are recorded in the map;
invalid source schema/graph or an invalid final native document refuses output.

## Approved correction records and replay (#876)

`litzio docling apply-corrections <conversion-folder>` replays `corrections.json`
without AI or a Docling server. The CLI calls the installed plugin Host operation;
interpretation stays in Docling and existing Core operations remain unchanged.
This explicit regeneration replaces manual edits to generated Markdown.

The single human-readable JSON ledger has this versioned shape:

```json
{
  "format": "litzio-docling-corrections",
  "version": 1,
  "source": { "file": "document.json", "sha256": "<original file SHA-256>" },
  "entries": [
    {
      "id": "heading-1",
      "self_ref": "#/texts/0",
      "operation": "heading",
      "value": { "level": 2 },
      "reason": "The source section belongs under the preceding H1.",
      "aiEvidence": "",
      "approvedAt": "2026-11-02T01:00:00Z"
    }
  ]
}
```

`id` is unique and identifies an approval for removal; `self_ref` always names
an original text-array item. Reason and approval timestamp with timezone are
required. `aiEvidence` is an optional string and may be empty in this phase.
Unknown fields, versions, operations, duplicate IDs and invalid values refuse
the entire request. There is no SQLite store or native-document metadata.

JSON `convert` creates an empty ledger with the absolute original input path.
Its copied assets remain self-contained for reading; replay additionally needs
that original file and its local images. The original JSON is never rewritten.
PDF bundles use the unchanged local `document.json`: without a ledger, replay
starts with an empty one pointing there and saves it on success. Relative source
paths resolve from the conversion folder. The source hash must match both the
original bytes and the map's source hash. Source paths pass Host Root checks.

The three operations act on a private, schema/graph-validated copy:

| Operation and value | Source-copy change and conditions |
| --- | --- |
| `heading`, `{ "level": 1 }` through `6`, or `{ "level": null }` | Reachable body `text`, `title` or `section_header` becomes `section_header` with that level, or `text` with `level` removed. Text, `orig`, provenance, layer, parent and order stay unchanged. Covers depth changes and both heading/body decisions. |
| `merge-paragraphs`, `{ "next": "#/texts/3" }` | Target and continuation must be consecutive body `text` leaves in reading order, ignoring furniture and traversing containers (including distinct parents). Target's final provenance page and continuation's first page must be consecutive. Formatting/hyperlinks must match. Append one space plus continuation `text`/`orig` to the target; concatenate provenance, shifting continuation character spans by preceding text's Unicode character count plus one. Remove the continuation's child edge and set its parent to null; retain its array slot, original text and `self_ref`. Never compact arrays or renumber refs. The surviving target can consume further consecutive-page continuations. |
| `furniture`, `{ "label": "text" }`, `"page_header"` or `"page_footer"` | A body text/heading/header/footer becomes that label and respectively `content_layer: body` or `furniture`; remove heading `level`. Text, `orig`, provenance, parent and order stay unchanged. Label/layer and tree placement are independent Docling facts; conversion already visits both roots and recognizes furniture in either tree. |

All operations require nonempty, unassociated leaf text, preserving picture,
table, list, footnote and caption relationships. Each ref may receive one heading/
furniture classification; another classification, including one after a merge, conflicts. Classification can
precede a merge when it satisfies its conditions. Consumed continuations cannot
be targeted again; a continuation already surviving another merge is refused.
Missing targets, unsatisfied conditions, conflicts and corrections the existing
converter cannot represent return an entry-specific reason before any write.
No entry is skipped. uint64 and fields outside the stated changes stay intact.

Internal functions `addDoclingCorrection(folder, entry)`,
`removeDoclingCorrection(folder, id)` and `applyDoclingCorrections(folder)` replay
the complete resulting ledger from the original. Removal is approval undo, not
an inverse patch. Installed Host operations `add-correction`, `remove-correction`
and `apply-corrections` take `{folder, entry}`, `{folder, id}` and `{folder}`;
conversion must be enabled. They add no UI route or dashboard change. Removing a
prerequisite that invalidates a remaining entry refuses the removal. Structure-review
execution and proposal records are defined below; approval screens and block
confirmation state remain follow-up work.

Publication builds a complete private sibling copy of the folder, including
untouched source/assets/user files, then renames the old folder to a private
backup and the new generation to the public name. An exclusive folder lock
rejects simultaneous correction writers. Native canonical paths determine both
the public name and lock: Windows 8.3 aliases preserve the original long name
and share its lock. An HTTP Root configured with its 8.3 locator admits that
same pinned root's native long paths for source and pre-publication rechecks;
the shared Root boundary still rejects outside targets and replaced roots.
Source/folder revisions are checked
immediately before replacement. A second-rename failure rolls back the first;
temporary sibling cleanup and owned-lock release are attempted independently.
Cleanup failures report each retained sibling/lock path together with the original
publication/rollback error, retaining all causes. A failure after publication
explicitly states that the result was published. As with existing
file replacement, revision checking and rename are separate, not atomic CAS.
The two renames can briefly make the path unavailable but never publish
individual files from an incomplete generation. A process/OS interruption in
that interval can leave a complete backup and lock beside the folder; automatic
crash recovery is outside this concept-validation scope. Failed rollback reports
the retained backup path. Filesystem aliases inside the folder are refused.

The map stays v1, bound to the **original** source hash and new Markdown hash.
Original refs, labels, layers, parents and individual provenance regions remain
inspection evidence. Status/targets describe corrected conversion; notes disclose
approvals. Merged refs share a result target with their own original page/bbox/
character spans. Existing readers report the new pair as current and an old map
with changed Markdown as stale. Open comparison tabs retain opening snapshots;
close/reopen after replay to read the new generation.

Verification uses synthetic inputs and the saved NIST bundle: all operations,
original-byte preservation, invalid/conflicting entries, dependent-removal refusal,
byte-identical output after undo, publication rollback, concurrent-edit refusal
and thin installed-Host CLI integration. Windows regressions cover real 8.3 alias
publication/locking; injected sibling cleanup failures cover lock release and
preserved publication/rollback diagnostics. No Docling server or review/AI UI is used.

## Structure review without UI (#884)

Authority: the 2026-11-02 “C 구조 검수” decision, items 1–4, 6 and 7 in
[Discussion #766](https://github.com/litzio/litzio/discussions/766), over A (#876)
and the [Host-mediated AI task service](plugin-runtime-v1.md#ai-task-service-880)
under [ADR-0013](../adr/0013-ai-agent-task-service.md). Docling obtains
`host.aiTasks()` and imports no agent plugin or provider implementation. An absent
service returns `available: false` and an explicit disabled-agent error. No AI
work starts in that case; existing conversion and document use remain available.

The one whole-document task is `docling-structure-review`, caller `docling`.
Its materials are byte-preserving original DoclingDocument JSON, a snapshot of
the current ordered corrections, and rejected suggestions. The feature instruction
asks the agent to read only needed portions using search/jq and find only heading
depth/heading-versus-body, cross-page paragraph merges, and body-versus-header/footer
classification. It distinguishes labels, content layers and tree placement.
Original `self_ref`, the same A operation/value, reason, and nonempty evidence
`[{"page": 1, "text": "literal original fragment"}]` are required for each result.
Evidence shape is checked; its truth and suggestion accuracy are not established
by these checks.

The strict draft-07 result Schema is the exported `structureReviewSchema` in
[structure-review.ts](../../plugins/docling/src/structure-review.ts). The root is
`{proposals: [...]}`; each array item is an `anyOf` of the three A operation/value
objects with the shared fields above. All object properties are required and extra
properties are refused. `heading.level` is an integer 1–6 or null; merge `next`
is a string; furniture labels are `text`, `page_header`, `page_footer`.
This is the actual schema passed to B, including Codex structured output.

The opaque task baseline is JSON containing the original `sourceSha256` and
`correctionsSha256`, the SHA-256 of `JSON.stringify` of A's parsed ledger, including
its source binding and ordered entries. Original bytes must match A's source/map
binding before admission. Material files are frozen as three UUID-named
`.structure-review-<UUID>-*.json` files inside the conversion folder; B snapshots
only those files using the three plain material names. They do not contain partial
AI results. They remain until terminal receipt observation, then are removed in
the same complete-folder publication as the result or failure. A restarted Host
can finish this observation; it never starts the task again. An interrupted
admission without a B receipt becomes `uncertain` on observation. These temporary
input copies are not a queue or additional proposal ledgers.

Only B's completed success receipt is consumed, with matching caller/task/baseline.
Docling checks the JSON shape again and dry-runs each suggestion independently
through `checkDoclingCorrection`, which invokes A's full ordered replay and native
conversion checks without writes. Checks use the frozen original and current
ledger; one suggested correction never silently satisfies another's prerequisites.
Passing proposals become `pending`; failures become `inapplicable` with an
entry-specific `validationError`. A prerequisite approval can make a later rerun's
proposal applicable. No Markdown or correction is written by running review.
Provider/timeout/cancelled/format/uncertain outcomes retain B's failure code and
leave the previous proposals intact.

One human-readable `structure-review.json` is the durable proposal file:

```json
{
  "format": "litzio-docling-structure-review",
  "version": 1,
  "updatedAt": "2026-11-02T01:00:01.000Z",
  "task": {
    "id": "2f922033-366c-4c8f-bcc1-a86186da5bfd",
    "baseline": { "sourceSha256": "<64 hex>", "correctionsSha256": "<64 hex>" },
    "startedAt": "2026-11-02T01:00:00.000Z",
    "finishedAt": "2026-11-02T01:00:01.000Z",
    "status": "success"
  },
  "proposals": [{
    "id": "ca3cf50c-d95a-4509-a82b-79aa74efed55",
    "taskId": "2f922033-366c-4c8f-bcc1-a86186da5bfd",
    "baseline": { "sourceSha256": "<64 hex>", "correctionsSha256": "<64 hex>" },
    "createdAt": "2026-11-02T01:00:01.000Z",
    "suggestion": {
      "self_ref": "#/texts/1", "operation": "heading", "value": { "level": 2 },
      "reason": "This subsection belongs below the preceding chapter.",
      "evidence": [{ "page": 1, "text": "Subsection" }]
    },
    "state": "pending", "history": []
  }]
}
```

States are `pending`, `approved`, `rejected`, `inapplicable`. Approval/rejection/undo
append timestamped history; undo returns the proposal to `pending` while retaining
its approval history. On a successful rerun only pending proposals with no review
history are replaced. Approved/rejected records, previously reviewed pending
records and inapplicable outcomes remain. Failed/cancelled reruns replace nothing.
The latest task is stored at the root; every proposal retains its task ID and
baseline, so retained decisions remain attributable across reruns.

Each read hashes the current original bytes and adds `stale: true` to **all**
proposals with a different source hash, including approved/rejected ones. A missing
or non-UTF-8 replacement is also stale. Stored decision states and evidence are
retained. Ledger-only drift is not stale: approval always revalidates against the
current ledger. Changed originals require a new conversion before another review.

Approval rejects stale/nonpending proposals, dry-runs the current ledger, then uses
the same `addDoclingCorrection` path as `add-correction`. The correction ID is
`review-<proposal UUID>`; reason is copied to `reason`, evidence is JSON-encoded
into A's string `aiEvidence`, and approval time is recorded. Undo uses the same
`removeDoclingCorrection` path as `remove-correction`, including refusal of a
removal that invalidates another correction. Rejection changes only the proposal
file. Approval/undo publish Markdown, map, corrections and proposal state in **one**
A-style locked complete-folder replacement; failure does not publish a mixed
state. Rejection/result publication use that same lock and replacement. Concurrent
proposal edits are revision-checked. A's existing source preservation, rollback,
cleanup diagnostics and concept-stage crash limitations still apply.

The installed Host operations use the existing `/api/plugin-operation` transport:

| Operation | Arguments | Behavior |
| --- | --- | --- |
| `review-start` | `{folder, id: UUID}` | Explicit admission; same latest UUID only observes, another UUID is refused while work runs. |
| `review-status`, `review-proposals` | `{folder}` | Read current task/proposals, consume a completed receipt, return availability and owning-Host `canCancel`. |
| `review-cancel` | `{folder}` | Await B's actual cancellation/uncertain outcome. |
| `review-approve`, `review-reject`, `review-undo` | `{folder, id: proposalUUID}` | Explicit human decision paths above. |

Start/decisions require the existing conversion feature; Host registration gates
new operations. Status/list/cancel drain after Docling disable. An accepted service
handle is retained only in the Host session so agent disable does not prevent its
accepted work from completing or being cancelled. On restart with the agent off,
availability is false and B observation waits for the service to become available.
B retains UUID deduplication, complete-result publication, dead-owner `uncertain`,
owning-Host-only cancellation, no automatic retry/replay and cleanup. Docling
polling never admits another task. There is no detached C background runner.
Terminal proposals are read from their saved file without consulting B's old
material locators, including after moving the completed conversion folder.

No CLI is added: AI execution is not a document semantic operation (the same
reason as B); approved record replay already has A's `apply-corrections` command.
The Host transport is the headless surface. Dashboard/review panel (C2), block
confirmation states, manual correction authoring, page ranges, image-dependent
errors, automatic runs/retries, dedicated Codex home and AI accuracy assessment
are outside #884. Core and the AI agent plugin are unchanged.

Fake-service tests use a synthetic document with all three error kinds. Installed
Host/HTTP tests replace only B's worker result, using its real service/runtime.
They establish execution, schema/domain validation, persistence, decisions, rerun,
staleness, disable, failures and byte preservation; they do not establish AI
correctness. Actual Codex/IEEE checks remain in the
[owner manual checklist](../test/README.md#docling-structure-review-884).

On 2026-11-02 one authenticated Codex call (`gpt-6.1-sol`) used the installed
Host/service/worker with the same synthetic fixture. The complete flow took
17.248 seconds and returned three schema-valid suggestions; all three passed A's
dry-run and were stored as pending. No suggestion was approved. Source SHA-256
remained `835820cce1b0e2f68d544ba23ec7323638fc6402ec4719ba014aea2ca2a9fdfe`,
the correction ledger stayed empty, and both B temporary folders and the three
Docling material copies were removed. The Host closed successfully. This proves
only return/validation/storage flow with that account, not suggestion accuracy,
real-provider cancellation, or IEEE fidelity.

## External PDF service and source bundle

```sh
litzio docling convert-pdf source.pdf --server http://127.0.0.1:8001 --output new-folder
```

`--server` takes precedence over `LITZIO_DOCLING_SERVER`. The URL can include a
reverse-proxy base path; credentials, query strings and fragments are refused.
`--timeout <seconds>` sets the overall deadline (default 1800 seconds), including
preflight, upload, polling and result download. The destination must not exist;
its parent must exist. An existing destination is never overwritten. Processing
uses an OS temporary directory and publishes files only after validation succeeds;
failure removes temporary files and any destination created by this invocation.

The module checks `GET /version` for docling-serve **1.32.0**, requires a successful
`GET /ready`, and fetches `/openapi.json`. The specification version must also be
1.32.0. Its exact byte SHA-256 and its comparison with the profile's reference
specification hash are recorded; a different hash alone is not a refusal.
Submission uses multipart `POST /v1/convert/file/async` with one PDF, then
`GET /v1/status/poll/{task_id}` (one-second intervals), then
`GET /v1/result/{task_id}`. Only complete `success` is accepted; partial success,
failure, skipped/unknown states, mismatched task IDs, result errors, invalid
schema/graph and any DoclingDocument version other than **1.10.0** refuse output.
Errors after submission include the task ID. Submission is never automatically
retried, including after a timeout: an upload can have reached the server even
when the client has no task ID. This command does not cancel or resume server jobs.

The sole fixed profile is
[`litzio-pdf-en-v1`](../../plugins/docling/profiles/litzio-pdf-en-v1.json).
There is no profile selector or individual conversion-option flag. Its request
values are copied verbatim from the owner's `crd-engine` profile
`profiles/crd-pdf-rest-v1.json`, under that project's ADR-0003. The copied source
file hash and reference OpenAPI hash are in `provenance`; that project's profile
name is not an Litzio profile. The independent local copy avoids a runtime
dependency on another checkout.

| Request group | Fixed values |
| --- | --- |
| Input/output | PDF → JSON, `target_type: inbody`, `image_export_mode: embedded` |
| PDF pipeline | `standard`, `threaded_docling_parse`, `layout_preset: default` |
| OCR | on, force off, `rapidocr`, language `en` |
| Tables | structure on, `tableformer_v1_accurate`, mode `accurate`, cell matching on |
| Heading hierarchy | on; bookmarks, numbering, style and font style on; size tolerance 0.05, max level 6, bookmark threshold 0.8 |
| Images | pictures and pages included, scale 2 |
| Enrichment | code and formula on with `codeformulav2`; picture classification on with `document_figure_classifier_v2` |
| Other | chart extraction off, picture description off, abort on error off |

No `page_range` is sent: the official API default processes the entire PDF.
Unlike crd-engine's dynamic page-count parameter, this needs no local PDF parser.
Server model caches and deployment remain external responsibilities; version and
readiness checks do not certify model-cache identity or source fidelity.

The server operator must prepare the models used by the profile: RapidOCR,
default layout, accurate TableFormer, **CodeFormulaV2** for
code/formula enrichment and **DocumentFigureClassifier-v2.5** for picture
classification. The tested official CUDA 1.32.0 image lacks CodeFormulaV2;
the fixture procedure downloads it into the disposable container. See the
[Korean server administration guide](../guides/docling-server.md) for pinned
images, startup, persistent model cache and troubleshooting.
The 1.32.0 OpenAPI has no profile/model-cache readiness endpoint. `/ready`
reports service readiness, not availability of every model requested by a
conversion. A successful connection check must disclose that limit.

The destination contains the source bundle and the native conversion together:

```text
document.json                 DoclingDocument; only image URI values change
pages/page-063.png             page_no, starting at 1
pictures/picture-012.png       Docling pictures array index, starting at 0
tables/table-000.png           table images, when present
images/image-001.png           other nested ImageRefs, traversal order
conversion-record.json        provenance and byte/content checks
document.md                   generated through the existing converter/Core
document.docling-map.json      bound to document.json and document.md hashes
```

Names use at least three digits and retain PNG/JPEG/WebP encoding (`.png`, `.jpg`,
`.webp`). Text images use `texts/text-000.*`; no UUID/hash names are generated.
Embedded image bytes are decoded without resizing or re-encoding. MIME, magic
bytes and base64 are checked, and each written file is compared byte-for-byte
with its decoded source. Image dimensions, DPI, labels, coordinates and all other
JSON fields are preserved. Unknown remote/file image URIs are refused rather than
fetched. The saved JSON is schema/graph validated and its content hash, masking
only ImageRef URI values, must equal the source's hash. Native Markdown and map
reuse these same image files; there is no duplicate hashed asset directory.
Node's native JSON reviver source/`rawJSON` preserves integers outside JavaScript's
safe numeric range (including Docling's uint64 `origin.binary_hash`).

`conversion-record.json` has `format: litzio-docling-conversion`, `version: 1`
and `status: success`. It records source PDF absolute path, SHA-256 and byte size;
server URL and reported package versions; fetched OpenAPI SHA-256 and reference
match; the full profile/request and its provenance; task ID; timestamps/elapsed
milliseconds; exact HTTP result-body SHA-256 and byte size; saved document hash,
schema version and page count; each image's JSON pointer, relative path, SHA-256
and size; and `verification.imageBytesMatchEmbedded` /
`verification.jsonExceptImageUrisMatches`. A second PDF hash check rejects input
changes during conversion. These checks establish extraction integrity, not OCR
or semantic accuracy.

The PDF is not copied. The result response is streamed to a temporary file while
hashing, parsed once with Node's JSON parser, then deleted. The parse briefly
requires a complete JSON string/object in memory; there is no new streaming
parser dependency. Embedded strings are released as images are externalized and
no raw response is retained. The existing `docling convert` path remains intact.

The public NIST excerpt and synthetic fixtures were regenerated in #784 through
`convert-pdf` with this fixed profile. They contain unresized images with readable
names, `conversion-record.json` and the native Markdown/map, alongside unchanged
source PDFs. The old #768 resized, hash-named images and manifests are replaced;
the [fixture README](../../plugins/docling/test/fixtures/README.md) records rights,
sizes and reproduction steps. Saved JSON and conversion records are unedited CLI
output; integrity checks do not certify OCR or semantic fidelity.

## App PDF conversion (#797)

Settings has a Docling category with the server address (default
`http://127.0.0.1:8001`) and Check connection beside it. A valid address is saved
on field exit or Enter/check; there is no document Save/Apply action. Errors
preserve the input, with an associated field message. The setting is the Host
user's `~/.litzio/docling.json`, shared by Desktop, HTTP Host and Vite running
as that OS user. `LITZIO_DOCLING_SETTINGS_FILE` overrides that file for an
isolated Host/test installation. It is outside documents, Root folders and
browser storage: HTTP clients configure the Host's external service, not their
own localhost. Settings links to the administration guide through the existing
external-link opener; the link remains available after a failed check.

The module's same preflight supplies both conversion and connection checking:
response/readiness, reported server version, compatibility with 1.32.0 and exact
OpenAPI-reference match. Same-version spec differences remain visible but do not
refuse conversion, matching CLI policy. Invalid URLs are refused before storage. Serial address
writes compare against the saved value after earlier writes settle, so reverting
A → pending B → A stores and checks A. Older field-write errors cannot override
the latest edit/check result.

Explorer PDF file menus and Command Center's **Convert with Docling** enter the
same explicit conversion dialog. Command Center first uses the existing Host
file picker filtered to PDFs. Results go beside the PDF in `<stem>.docling`,
then `<stem>.docling-2`, `-3`, etc. Existing files/folders are never overwritten;
exclusive module publication also refuses a name claimed after the initial
choice. PDF read and output checks use the Host's existing Root/real-path policy,
including a recheck before publication. No browser request goes directly to
Docling. The native document is created by the existing converter/Core.

Each Host admits one conversion at a time. Its UI snapshot remains process-local;
execution uses a separate installed worker with shared UUID request receipts under
[Host worker plugins](plugin-runtime-v1.md). Interrupted outcomes become uncertain
and are never automatically replayed. The browser polls the Host once a second while work is active;
the module polls Docling. Progress shows checking/upload/queue/processing/download/
bundle stages, elapsed seconds, task ID once known and the result folder, without
invented page percentages. Closing the progress dialog leaves work running;
Command Center opens it again. **Stop waiting** aborts Litzio requests/waiting,
waits for local cleanup and explicitly says the server task may continue. There
is no server API cancellation call, automatic retry, persisted queue or resume service. The CLI
still has no interactive cancellation UI. Completed jobs/tabs are not restored
on page startup. A page may observe a still-running Host job. The UI and hook refuse Start until the first successful Host status snapshot
(including a known null/no-job snapshot). Failed status reads are retried as GETs,
so an unavailable initial read cannot leave Start permanently disabled. If a start response is lost, the UI re-reads the Host's
current snapshot before allowing another start; it never automatically repeats
the POST. This can recover a newly accepted job, including one already completed,
while ignoring an older completed snapshot. Reading that same older success
does not clear the new request's rejection/transport error; read failures and
action failures have separate lifetimes. A delayed comparison response may
change tabs/dialogs/notifications only while its conversion is still current;
it cannot clear or replace a newer task's failure.

Success opens the existing Docling comparison tab while comparison is enabled. Failure uses the same single
window NotificationCenter as stale comparison maps, with Go to problem opening
the conversion dialog. Retry removes that cause; new failures can appear again.
This adopts P07 only for Docling; aggregation of existing shell/document errors
remains [#792](https://github.com/litzio/litzio/issues/792).

Public `failure.message`, `error_message` and result `errors[].error_message`
are interpreted in the module, with short translated cause/action text and task
ID in the UI. Explicit missing-model/capacity/source/timeout causes are retained;
raw traces are not displayed. The tested missing-CodeFormulaV2 case returns only
`Internal processing error.` and `failure: null` (the result endpoint returns
404). Litzio cannot recover that hidden cause: it asks the operator to check
server logs and profile models using the task ID, rather than asserting a model
is missing. The existing CLI diagnostic retains its error/context.

This is Host/UI access to the already headless `docling convert-pdf` operation;
no new Core semantics or CLI command is needed. Connection checks, REST conversion and module UI stay in `@litzio/docling`;
the Host owns worker admission, lifetime, request receipts and result publication; Editor provides shared controls, translation,
file picker, generic dialogs/tabs/settings sections and external-link handling under ADR-0012.
#869 moves the remaining settings/conversion UI and Host facade into `plugins/docling`;
CLI commands use installed [Host operations](plugin-runtime-v1.md#plugin-owned-host-operations-and-folder-869).
Conversion policy, source preservation, failure reporting and public command results remain unchanged.

## Plugin dashboard and feature selection (#871)

The expanded sidebar footer now opens **Docling**, a plugin-contributed dashboard
tab. Command Center also offers **Docling dashboard**. Its five areas are connection
status, conversion jobs, recent conversion results, feature selection and quick
actions. It reuses shared Settings controls, themed tokens and the 640px desktop
layout. Review, statistics, multiple servers, notification settings, plugin splitting,
distribution and security mechanisms remain outside this concept-validation scope.

Connection status shows the configured Host address, checking/connected/not
connected, last check time, Check again and the conversion Settings link. It
reuses the version/readiness preflight and discloses its model-readiness limit.
The last check is view-local, not persisted.

Jobs read existing runtime receipts filtered by this Host's Roots. Running jobs
show PDF, phase, elapsed time and Stop waiting only on their owning Host. Terminal
jobs show status/time and failures reuse the public translated cause. Retry and
Start again open the existing confirmation dialog; only explicit Start admits a
**new UUID**. Observation, opening a dialog and feature changes never resubmit
uncertain work. Clear record hides only an uncertain receipt while retaining its
UUID/fingerprint tombstone. It removes neither output nor staging and states that
the server task may continue. Admission and duplicate execution protection remain
runtime-owned; there is no new persistent store.

Recent results read successful receipts' output folders for document name, map
page count, completion time and current/stale correspondence. The shared map
reader checks exact Markdown bytes. Missing folders are marked explicitly with
disabled open actions; other unreadable result files have a separate error.
Open comparison uses the unchanged #815 view, Open document the ordinary editor,
and Open folder the existing Explorer folder opening. An explicit history view
does not restore tabs on startup.

Conversion and comparison default to enabled. Their flags share the runtime's
plugin registration record, survive Host restart and explicit re-registration,
and propagate to other Editors through registration polling. Turning conversion
off removes its command, PDF file action, dialog and Settings section. Turning
comparison off removes its tab kind, picker and quick/result actions. Open
comparison tabs keep their identity and snapshot in the existing disabled state;
re-enabling restores them. The dashboard remains available with both features
off. Detach/reactivate never cancels accepted work. Host operations also reject
new disabled-feature work while preserving status/cancel and admitted UUID replay.
Already open PDF and comparison-folder pickers also close on detachment, including
when another Editor changes the feature flag. Their input/pending completion is
discarded and focus returns to a safe shell control if the opener was detached.

Plugin entry points compose `conversion/`, `comparison/` and `shared/`. Neither
feature imports the other or a composition entry. Shared source types and
correspondence format/readers are the data boundary; the features meet through
published conversion-folder files. Build and boundary tests check runtime, erased
and dynamic imports. There is no new Core semantic operation. Headless conversion
and [correction replay](#approved-correction-records-and-replay-876) use installed Host operations.

Visual review pairs: [1440px before](assets/docling-dashboard-871/before-1440-light-en.png)
/ [after](assets/docling-dashboard-871/after-1440-light-en.png),
[640px before](assets/docling-dashboard-871/before-640-dark-ko.png)
/ [after](assets/docling-dashboard-871/after-640-dark-ko.png).
The new dashboard has no preceding dashboard screen; Before shows the original
sidebar entry. After shows running/completed/failed synthetic jobs together.
[Capture conditions and hashes](assets/docling-dashboard-871/capture-metadata.json)
record the manual review of alignment, wrapping, Settings consistency and scroll
access. Synthetic conversion does not establish real-service fidelity.

## Correspondence sidecar

Format `litzio-docling-map`, `version: 1` is owned by the module. `source`
identifies the Docling name/schema/version and SHA-256 of the exact input UTF-8
text; `document.sha256` binds the map to the exact generated Markdown bytes.
`pages` records original page numbers, page sizes and image references. Coordinates
are never rescaled or inverted: each `provenance` entry preserves `page_no`,
`bbox` including `coord_origin`, and `charspan`. Missing provenance is an empty
array, never an invented position. An omitted coordinate origin is made explicit
as Docling's `TOPLEFT` default. Every source item/group, including roots and
unreachable items, has one `items` entry with `self_ref`, label, layer, parent,
provenance, status, targets and conversion `notes`.

| Status | Meaning |
| --- | --- |
| `converted` | Has at least one target in the reopened native document. Notes disclose any representation change. |
| `decoration` | Furniture layer, page header or footer. No document target. |
| `unsupported` | No document target; `reason` explains the unsupported, empty or unreachable source. |

Targets are snapshot-relative public Core block `path` plus `block` kind and
`role`. A list item uses the parent list block path and an `item` index path into
the public recursive `ListContent`; an endnote target uses its final definition
path and label. A group may target multiple blocks; several elements may target
one block (for example Figure and captions). `notes` always exists, leaving room
for conversion observations such as two groups contributing to one target.
The module's map check verifies format, document hash and targets before a
consumer uses the correspondence. It rejects a stale map even if old paths still
exist. It establishes correspondence integrity, not fidelity to PDF pixels.

## Representation policy

The source reading order follows root/group `children`, with associated captions
owned by their Figure/Table. Furniture is classified from both label and layer,
including furniture stored under the body root. Unknown or unreachable content
is reported. Paragraph boundaries, original numbering and cross-reference text
are retained; no semantic cross-reference or cross-page join is guessed.
Text whitespace is normalized to one line with a per-item note when it changes.

Headings require H1-H6. Text formatting uses Core inline content; unsupported
formatting is reported. Plain formulas use Core Equation operations.

Tables use one native `{table}` directive with a rectangular GFM table. Merged
cells repeat their text in every covered grid position. Consecutive leading
column-header rows become one header: each column joins its nonempty labels
from top to bottom with ` / `, suppressing consecutive identical labels. All
text in a partial header row is retained in that header. Nonleading column
headers remain at their source row positions as ordinary body cells; they are
not moved across intervening body content. Row headers and row sections become
ordinary cells, including text repetition for merged sections. Per-table map
`notes` disclose merged source-cell and covered-position counts, combined header
row counts, and any header/section role changes. This preserves cell text while
explicitly giving up native merged-cell and hierarchical-header semantics;
Core's table model is unchanged.

Rectangular tables retain genuine empty cells and uncovered grid positions;
a table without leading column headers gets an explicitly noted empty native
header. Fillable form cells remain `unsupported` because a text-only table cannot
preserve their input semantics. Empty tables, tables exceeding the 100,000-cell
limit, invalid/out-of-bounds coordinates, inconsistent spans and overlapping
source cells also remain unsupported with a reason; conversion cannot assign
their contents to a valid, unambiguous grid.

Pictures use their source image and caption, with child text represented by the
image and noted in the map. Missing images are unsupported. List markers that
the Core list model cannot express are retained as literal prose with notes.

Docling does not encode an inline footnote call site. A numeric token alone is
insufficient evidence: standalone footnotes retain their full original text as
paragraphs, with a note explaining that no endnote link was inferred. Explicit
owner `footnotes` relationships attach endnote calls to that owner's supported
inline surface, with notes explaining the insertion point. Original footnote
display numbers are not a new Core feature in this issue. Conversion never
silently treats an unrelated occurrence of the same number as an endnote call.

Read-only comparison is defined by [Docling comparison](docling-compare-v1.md).
Confirmation state, proposal screens and post-edit relinking remain outside
this contract; headless structure proposals and approved correction replay are
defined above. Public fixture provenance, licenses and reproduction
commands are in the [fixture README](../../plugins/docling/test/fixtures/README.md).

## App verification on 2026-10-30

Fake HTTP service tests cover connection success/unreachable/not-ready/version
mismatch, Host configuration persistence, Root denial, one active task,
no-overwrite naming, completion, explicit/redacted failures and cancellation with
no server cancel request. The Desktop protocol test covers the new routes.
The `docling-server` persistent-browser scenario exercises Settings, PDF context
menu and Command Center picker, stopped waiting, failure notification/reveal and
automatic comparison. It passes against Vite and the built production HTTP Host.
The same run verifies address/check-button alignment, delayed A→B→A settings,
initial GET failure and loss of an accepted POST response with GET-only recovery,
and a delayed comparison response returning after a newer task fails. Other browser regressions
are left to required CI as requested by the owner.

The real pinned CUDA server required a disposable-container CodeFormulaV2
download before conversion could succeed. NIST's committed 11-page PDF then
completed through the app in 46,570ms (warm server, one observation), with 19
images and both bundle-integrity checks true; the comparison tab opened
automatically. Task ID: `851907ac-82e9-4924-be68-db5f868cc357`. The fetched OpenAPI
matched the profile reference. This is execution/integrity proof, not OCR QA or
CPU/large-document capacity evidence.

Manual review captures live in [assets/docling-server-797](assets/docling-server-797/):
[Settings 1440 Light](assets/docling-server-797/settings-success-en-1440.png),
[failed check 640 Korean](assets/docling-server-797/settings-failure-ko-640.png),
[Settings 640 Dark](assets/docling-server-797/settings-dark-ko-640.png),
[PDF menu](assets/docling-server-797/pdf-menu-en-1440.png),
[progress 640 Korean](assets/docling-server-797/progress-ko-640.png),
[real NIST comparison Light](assets/docling-server-797/real-completed-en-1440.png),
[real NIST comparison Dark](assets/docling-server-797/real-completed-dark-ko-1440.png).
Settings and progress were checked for alignment, readable wrapping, clipping,
occlusion and translation against the existing Appearance/recovery/FolderDialog
patterns. The comparison's existing 640px usability exception remains; its
640px capture is observation, not a new support guarantee.
