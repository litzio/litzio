# Host worker plugins v1

- Status: Implemented
- Folder/Host boundary verified: 2026-11-01 (#869: relocated-folder build/typecheck/tests, shared Host and headless CLI, Docling browser scenarios; packaging remains required CI and the real service remains manual).
- Last verified: 2026-10-31 (#853 and PR #855 review: shared Host tests, filesystem alias denial, ancestor-listing permission regression, scoped image-reference scans and shutdown/admission races; real Docling remains manual and packaged Desktop is checked by CI).
- Authority: [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), with [ADR-0004](../adr/0004-desktop-host-distribution.md) and [ADR-0005](../adr/0005-http-host.md).
- Scope: trusted local worker execution in Vite, in-process Desktop and independent `litzio serve`. The same registration also supports [UI contributions](plugin-ui-v1.md) under ADR-0012 (#857).

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Installation and API

All Hosts running as one OS user share `~/.litzio/plugins`.
`LITZIO_PLUGINS_DIR` selects an isolated installation, including for tests.
Use a local filesystem supporting SQLite locks; network shares and hostile
mutation of this user-owned directory are outside the contract.

A worker manifest is JSON with `id` (lowercase ASCII identifier), `version`
(1–128 letters/digits, underscore, dot, plus or hyphen), `workerApi: 1` and
`entry: "worker.cjs"`. The entry is a self-contained Node CommonJS bundle beside
the manifest. Registration copies its bytes into `installed/<SHA-256>/worker.cjs`
and stores the selected manifest and hash. With #857, the directory SHA-256 is
the complete installation revision (manifest plus worker/Host/UI hashes), and optional
UI assets share that immutable directory. Each admission pins that installation;
the runtime checks its hash before execution. Re-registering changes future work
only. API mismatch is refused before registration or execution. Worker API 1
accepts the PDF request shape published by `@litzio/plugin-api/worker`; it is not a general document API.

The first-party Docling bundle ships with the CLI and Desktop, and Vite builds
the same entry at startup. UI discovery or first conversion registers it only if no Docling
registration exists. Explicit unregistration is never silently reversed. Existing
registrations stay pinned until explicit re-registration, including app updates.
This preserves the existing conversion screen without adding an install UI.

The thin shared Host surface is available without restarting:

| Request | Result |
| --- | --- |
| `GET /api/worker-plugins` | Current registrations, including disabled entries. |
| `POST /api/worker-plugins`, `{ manifest: absolutePath }` | Validate and register/replace trusted installed code. HTTP Root checks apply to both source manifest and entry. |
| `DELETE /api/worker-plugins`, `{ id }` | Disable registration; retain installation/receipts and drain accepted work. |
| `POST /api/docling-conversion`, `{ path, id? }` | Admit a PDF request. Optional `id` is a UUID; omitted IDs are generated once by the Host for the existing UI. |
| `GET /api/docling-conversion?id=<UUID>` | Read that receipt, subject to this Host's input/output Root checks. Without `id`, retain the current process-local UI snapshot. |

HTTP retains its Origin/Host/body limits. Desktop uses the same handler through
`litzio://app`, with no TCP listener. #857 adds the read-only UI listing/asset
surface described in [Plugin UI contributions](plugin-ui-v1.md). Registration is explicit trusted code execution, without an OS
sandbox, download, approval workflow or additional permissions model.

## Plugin-owned Host operations and folder (#869)

Docling lives in `plugins/docling`, with its own package, source, profile, schema,
fixtures, build and tests. Application/Host/CLI runtime and type imports cannot
reference that folder or `@litzio/docling`. `pnpm boundaries:check` checks that
boundary and all plugin source/build imports, including erased types and dynamic
imports. Repository dependencies are restricted to public `@litzio/core` and
`@litzio/plugin-api` exports; existing Node, React and validation libraries remain.
The plugin build runs the same source check. No document semantics move to Host.
Package test scripts prepare the bundled plugin. Direct source-Host test calls
using `pnpm exec tsx --test` must first run
`pnpm exec tsx packages/cli/scripts/build-docling-worker.ts`; the Windows HTTP
boundary CI step does this explicitly. A packaged CLI bundle is a separate output
and does not prepare `tmp/docling-worker` for source tests.

An optional `host: { api: 1, entry: "host.cjs" }` declares a self-contained trusted
Host facade. Registration validates/copies/hashes it alongside worker and UI assets.
Optional `routes` lists the existing `/api/<name>` endpoints it contributes.
The shared handler dispatches those declared routes and
`POST /api/plugin-operation`, `{ plugin, operation, args }`, to the same installed
facade. Core/native admission, text decoding, Root/media resolution, worker
execution and publication remain injected Host services. Host modules are trusted
in-process adapters, not isolated workers; PDF conversion still runs in a worker.
Installation introduces no new sandbox or permissions system.

`createPluginHost().invoke(id, operation, args)` is the matching headless entry.
There was no generic installed-operation entry before #869: the old Host imported
the Docling facade directly. CLI `docling convert` now calls the installed facade
synchronously to preserve `runCli`; `convert-pdf` calls it asynchronously and uses
the existing worker admission/publication path, explicit output/server/timeout
and result fields. Both work without UI loading or an HTTP listener.

Host facade activations follow installation revisions. Plugin-owned transient
session data preserves the current job/admission gate across re-registration;
it is not durable state or startup restoration. Disable refuses new operations,
except declared draining operations: Docling status/cancel and UUID replay. A new
UUID still fails worker admission after disable. Accepted work keeps its pinned
worker. CJS module records, like UI ESM records, are not claimed to unload.

The only first-party composition connections are the build wrapper that invokes
the folder's build, bundled manifest location, and CLI `docling` command dispatch.
No installed source or application code imports the implementation. Docling remains
bundled; official distribution/installation/signing (#867) remains deferred.

### Later extraction

1. Move `plugins/docling` intact, including `package.json`, `scripts`, `src`,
   `profiles`, `schema`, fixtures/tests and licenses. Its tests use the public API
   package's shared test helper and resolve Core through its public package entry.
2. Replace only the two `workspace:*` API dependencies with the chosen released
   `@litzio/core` and `@litzio/plugin-api` versions (or explicit local package
   references while developing). Create the new repository lockfile and run
   `pnpm build`, `pnpm typecheck`, `pnpm test` there. Publishing those APIs and
   choosing release/install policy are separate work, not implemented here.
3. Point first-party build composition at the resulting `manifest.json`,
   `worker.cjs`, `host.cjs`, `ui.mjs` and `ui.css` bundle. Keep the existing Host/UI
   API versions and bundled default; remove the workspace entry/source scan and
   relocate fixture consumers/links. No application implementation imports need
   changing. License collection must continue to include plugin dependencies.

## Identity, durable state and recovery

The only durable authority is `runtime.sqlite`: the `plugins` table holds
registration state; `requests` holds UUID, source/server fingerprint, pinned
installation, progress/task ID, owning session UUID, exact staging path once
created and final job status.
The fingerprint includes the PDF's absolute locator, SHA-256 and server URL.
An admitted UUID returns its original receipt, even after disable; changed input
bytes, locator or server refuse conflicting reuse. SQLite transactions make
registration/admission atomic across independent Hosts. Work never starts before
the admission commits, and an uncommitted crash leaves no accepted request.

`owners/<session-UUID>.sqlite` is a request-ownership lock, not a job queue.
The owning Host holds a SQLite write transaction on this file for its lifetime.
An observer probes that session's OS lock: busy means still owned; an unlocked
or missing file means the owner ended. Other I/O errors fail closed. Process IDs,
wall-clock deadlines and heartbeat expiry do not decide ownership, so a reused
PID or a new Host session in the identical live process cannot revive old work.
SQLite releases writer locks and rolls back incomplete transactions on crash.
Owner lock files and installed bundles are retained; no garbage collector is
introduced. These files carry only installation/request ownership information.

A receipt left `running` without its owner becomes `uncertain` on observation.
The existing UI receives an error snapshot explaining interruption. Neither a
read nor replay of the same UUID executes it again. Starting another UUID is an
explicit new request. There is no persistent queue, resume, automatic retry,
cross-Host cancellation, shared live task controller or document/session store.
Startup does not restore completed jobs/tabs; an explicit receipt read remains
possible. Each Host still admits one new conversion at a time.

## Worker lifetime and publication

Worker API 1 uses one IPC request `{ input, output, server }`. Progress and task
ID messages update the receipt. A complete message **and exit code zero** are
required for publication; failure messages preserve module failure codes. The
Host deadline defaults to 30 minutes and covers startup through publication.
Stop waiting, deadline and normal Host close terminate local workers and await
cleanup. Desktop closes workers only after its ordinary unsaved-work close gate.
Close first permanently blocks lazy runtime creation and new admissions, including
HTTP bodies that finish arriving during shutdown. An initialized runtime blocks
forks immediately, stops all its accepted workers and awaits every execution's
exit and cleanup before closing the ownership store, even when one cleanup fails.
Host death disconnects IPC; this Docling worker exits when its event loop services
disconnect. Trusted code is not protected against hostile infinite loops.
No local Docling service is launched. A remote task may survive any local stop.

Each execution has a private sibling `.litzio-plugin-*` directory. This prefix and the `.litzio-incomplete` publication barrier are fixed internal runtime identifiers, independent of branding (#859 review). Separate per-brand plugin installation folders do not isolate work beside a shared source PDF. Both local and Root-constrained Hosts must reject the other brand's staging and crash publication leftovers; completed results remain ordinary document paths. Worker OS
temporary files and its complete bundle stay inside it. All ordinary Host file
surfaces refuse private paths, including symlink, Windows case and 8.3 aliases
and local Desktop/Vite. Native OS realpath resolves actual case, short names and
links; JS realpath alone can preserve a Windows caller's spelling. Only actual
reserved directory candidates need a directory-type check. There is no sibling
or ancestor enumeration, no Unicode case folding and no new listing permission
requirement above an allowed Root. Both lexical and resolved paths are checked;
a missing new leaf is checked through its nearest existing ancestor.
The module uses only public Core operations and validates its native bundle;
original PDF/JSON remain unchanged. Input SHA-256 and Root/real-parent access
are checked again before publication.

The Host exclusively creates the final directory, adds `.litzio-incomplete`,
copies only a successful exited worker's complete bundle, rechecks access, then
removes the marker. Ordinary file routes reject the entire marked directory.
This avoids POSIX rename replacing a concurrently created empty directory and
keeps no-overwrite behavior on Windows too. It is atomic **Host visibility**,
not an atomic filesystem directory rename: direct OS tools can observe the
reserved directory while copying. Failure cleans owned output and staging;
an abrupt Host crash can leave hidden staging or a marked final directory for
inspection. These are never automatically published or replayed. A crash after
marker removal but before receipt commit may leave a complete result with an
uncertain receipt; it still cannot cause duplicate execution. External hostile
filesystem replacement retains the shared Host's existing check/use limitation.

Image-reference discovery excludes only these private directories and their
contents. Ordinary directories, including hidden folders, still participate in
dirty-document refusal and reference updates. A retained private directory does
not block a rename elsewhere in the same Root, and renames never edit or remove
its files. Other file-access errors are not silently excluded.

Cleanup is scoped to the current execution's exact recorded staging path and,
if this execution exclusively created it, its incomplete output. Neither startup
nor unrelated file operations scan the Root to delete other requests' leftovers.
After a crash, keep the receipt and private files for inspection; do not replay
or publish them. An operator may stop the owning Host, confirm `uncertain` and the
request UUID, then remove only that receipt's recorded staging and its matching
UUID-marked incomplete output. Preserve ordinary files, complete results and
other requests' directories. An unrecorded empty directory from interruption
between creation and recording is not an automatic cleanup candidate.

## Verification and remaining adoption

The shared tests cover synthetic conversion, worker kill while downloading a
partial response, timeout, source immutability, private paths/aliases, occupied
publication name, cross-process duplicate admission/conflicts, disable/drain,
Host death/restart, no replay, crashed registry-lock rollback and new ownership
at an identical live PID. Desktop registers the same installation an independent
HTTP Host executes. Distribution smoke tests exercise the shipped worker through
offline Node CLI and the actual packaged Desktop protocol in required CI.
Review regressions additionally cover real document endpoints through Windows
case/available 8.3 and junction aliases, unrelated image renames with retained
private data, ordinary hidden-folder references, a partial HTTP body completing
after close begins, and closing before fork or during an actual running worker.
The ancestor-permission regression injects EACCES only for listing the parent
above an allowed Root, retains real file reads/stat and verifies local/Root
document endpoints return 200 with unchanged source while staging returns 403.
This is deterministic error injection, not a claim of changing actual OS ACLs.

The existing `docling-server` and `docling-compare` browser scenarios exercise the
unchanged screens. Real Docling verification remains an explicit
[manual check](../test/README.md#docling-worker-runtime-853); synthetic REST does
not establish OCR/model readiness or fidelity. ADR-0012's UI compatibility and
disposal conditions are implemented separately by [#857](plugin-ui-v1.md). No new Core semantics are
introduced: existing headless `docling convert-pdf` remains the CLI surface;
registration is available through the shared Host API and adds no semantic CLI
operation.
