# ADR-0013: Official plugin distribution and lifecycle

- Status: Proposed
- Last verified: 2026-11-01 (documentation and existing runtime/UI/branding contracts reviewed for #867; no installer, catalog publication or signature verification implemented).
- Scope: recommendations awaiting owner approval; extends ADR-0012 only after acceptance. Existing Accepted decisions and Implemented contracts remain authoritative.
- Related: [#867](https://github.com/litzio/litzio/issues/867), [Discussion #767](https://github.com/litzio/litzio/discussions/767), [ADR-0012](0012-plugin-runtime-and-ui-contributions.md), [ADR-0004](0004-desktop-host-distribution.md), [ADR-0005](0005-http-host.md), [ADR-0011](0011-code-module-boundary.md), [branding guide](../guides/branding.md).

## Context and document choice

The owner decided in Discussion #767 that the provider-neutral AI agent framework
will be a default-included plugin, while Docling will become an independently
installed official plugin. Docling stays bundled until that installation flow
is ready. Distribution choices below are recommendations, not owner-approved
details of that decision.

[Documentation governance](../contributing/documentation-governance.md) calls for
a new ADR for a major architectural decision. ADR-0012 is already Accepted and
explicitly excludes remote distribution. This separate Proposed ADR preserves
that accepted runtime record while isolating the new distribution/trust decision
for owner approval. If accepted, it supersedes only ADR-0012's exclusion of
official remote distribution; third-party distribution and AI-generated plugin
approval remain excluded. ADR-0012's worker, UI, Core and Host boundaries stand.

Current [worker](../design/plugin-runtime-v1.md) and
[UI](../design/plugin-ui-v1.md) contracts implement trusted local registration,
immutable hashed installations, shared registration/request records, pinned work,
drain and complete-result publication (#855/#861). They do not implement a
download installer. The [brand configuration](../guides/branding.md) (#863) has
`officialPluginsUrl: null` and no plugin-signing-key setting today.

## Recommended decisions

Every subsection compares alternatives and recommends one for acceptance.

### 1. Catalog and package location and format

| Option | Trade-off |
| --- | --- |
| **Recommend: GitHub Releases in a dedicated first-party plugin distribution repository** | Reuses Desktop's release assets and verified-publication pattern; keeps independent plugin releases out of Desktop's Stable/Beta feed. |
| Same repository/feed as Desktop releases | One publication location, but independent plugin tags/latest releases would have to be isolated from app update discovery. |
| npm registry or a new catalog service | Adds a registry/account or server dependency without a present requirement. |

Recommend `litzio/official-plugins` as the distribution repository, with source
and implementation continuing in `litzio/litzio`. This is a proposed destination,
not a claim that the repository or assets exist. `brand.officialPluginsUrl` will
point to its latest catalog release's `catalog.json`; `catalog.sig.json` is its
sibling. Only a catalog release is marked latest. Package releases are versioned,
never marked latest, and have immutable tag/asset URLs. A catalog points only to
already published, verified package assets. No assets/tags are overwritten;
publish packages first, then a new catalog release. A failed publication leaves
a private Draft, following Desktop's preflight, exact-asset verification and
publish-last pattern; a lost final response requires read-back, not blind retry.
This proposal neither publishes assets nor changes the Desktop release workflow.

Catalog format 1 is UTF-8 JSON: a catalog identity, increasing generation,
publication time, and entries with plugin id, display name/description, version,
relative package URL, byte size, SHA-256, worker/UI API requirements and release notes.
Resolve package references against the configured catalog URL, before any HTTP
redirect, and require HTTPS within that distribution's repository/mirror path.
For GitHub, `../../download/<package-tag>/<asset>.zip` addresses a versioned
Release from `releases/latest/download/catalog.json`. A mirror preserves this
relative layout, so catalog bytes and signatures need not change.
Use strict SemVer for official package versions, independently of app versions;
initial update offers select stable versions only. This narrows official
distribution inputs without changing the runtime's existing permissive version
field. A same-id/version release with different bytes is refused.

A package is a ZIP containing `release.json`, `release.sig.json` and `payload/`.
The signed release descriptor has format 1, catalog identity, plugin id/version,
the worker/UI requirements and the complete list of payload paths, sizes and
SHA-256 hashes. Payload is the existing manifest, self-contained `worker.cjs`
and/or `ui.mjs` with optional `ui.css`. Descriptor, catalog entry and runtime
manifest must agree. There are no install scripts, runtime dependency downloads
or source builds. Use a maintained ZIP library; do not implement an archive parser.

### 2. Integrity, signatures and key lifecycle

| Option | Trade-off |
| --- | --- |
| **Recommend: SHA-256 plus pinned-key Ed25519 signatures** | Authenticates catalog and package on Desktop and Node HTTP Host, including offline installation. |
| HTTPS plus hashes alone | Detects corruption, but a replaced catalog can supply replacement hashes. |
| Authenticode-only packages | Reuses Windows signing but cannot authenticate a JSON/ESM/CSS package for the independent Node Host. |

Reuse the existing installation SHA-256 checks and Desktop's verify-before-use
and verify-cached-bytes policy. Desktop continues using electron-updater's
SHA-512 and, for signed builds, Authenticode/publisher checks; those checks do not
authenticate arbitrary plugin ZIPs. Its unsigned-Beta exception does not permit
unsigned official plugins. The current
[Desktop signing contract](../design/desktop-distribution-v1.md#verification-and-signing)
and [electron-builder v26 documentation](https://www.electron.build/v26/docs/features/auto-update/)
remain the app-update authority; this ADR does not upgrade electron-updater or
reuse NSIS metadata as a plugin manifest.

Use Node's existing [`crypto.sign`/`crypto.verify`](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback)
Ed25519 support. Sign the exact published UTF-8 JSON bytes, without parsing and
reserializing for verification. Prefix the signed bytes with the fixed UTF-8
context `litzio-official-catalog-v1\n` or `litzio-official-package-v1\n` respectively.
Each signature file is an array of `{ keyId, signature }`, with base64 signatures;
the algorithm is fixed by format 1, not chosen by untrusted metadata. Accept at
least one valid signature from an embedded, non-revoked key. Reject unknown
formats, malformed/duplicate JSON keys, missing/invalid signatures, mismatched
identity/version/API/hash/size and changed cached bytes before registration or
code loading. No bypass button or unsigned fallback belongs in the official flow.

The application build pins a catalog identity and public-key map in the single
brand configuration; private keys are separate from Windows certificates and
exist only in the restricted release signing environment, never source, packages
or logs. Publication requires a trusted source revision, validation and the same
least-privilege publish-last approach as Desktop. Repository access alone does
not supply plugin-signing authority.

Keep the signed descriptor/signatures and catalog identity with each managed
installation so every Host can recheck provenance against its own build's trust
policy. This does not reclassify the existing explicit developer trusted-source
registration as verified official code.

For planned rotation, ship an app/CLI build trusting old and new keys first,
dual-sign catalogs/packages during overlap, then ship a build removing the old
key. Old Hosts can continue checking the old signature during overlap. Never
accept a replacement public key merely because a catalog/package supplies it.
On compromise, stop publication, remove affected offers and ship an app/CLI trust
update revoking the key; affected installations are disabled on observation of
that updated trust policy. Existing offline/older Hosts cannot learn a revocation
until updated, and retaining an old executable is not proof of current trust.
Verified catalog generations never decrease for the same catalog identity;
record that high-water mark as installation metadata, not a separate backend.
First contact/offline operation cannot prove that a newer catalog exists.

### 3. Host API compatibility and presentation

| Option | Trade-off |
| --- | --- |
| **Recommend: exact supported worker/UI API integers, checked separately** | Reuses API 1 and UI API 1/React 19 admission checks; easy to refuse incompatible code. |
| App-version equality | Unnecessarily couples independent plugins to every app release. |
| Negotiated ranges or compatibility shims | Adds compatibility machinery without a demonstrated need. |

The signed descriptor declares each present worker/UI API and, for UI, React
major. All declared components must be compatible; no worker-only partial
installation of a worker/UI package. Current support is worker API 1 and UI API
1 with React 19. Brand changes never rename `@litzio/plugin-api`, manifest fields,
routes or API values. Future incompatible APIs require an explicit contract
decision; SemVer of a plugin alone does not imply Host compatibility.

Check catalog metadata before offering an install, the signed package before
activation, and the installed bytes at existing registration/admission/UI-load
boundaries. Display an incompatible entry with required and available API/React
versions and an app-update action when applicable; disable install/update/enable.
Keep the installed version and offer the latest compatible newer stable version;
also explain when a newer release requires a newer Host. Do not silently downgrade.
With different app/CLI versions sharing a folder, each Host independently refuses
incompatible execution/UI loading and shows that state. One Host's successful
registration does not certify another Host's compatibility.

### 4. Install, update, removal and interruption

| Option | Trade-off |
| --- | --- |
| **Recommend: verified private staging and atomic registration replacement** | Reuses immutable installed revisions, SQLite registration transactions, pinned requests and drain. |
| Overwrite the active installation in place | Can expose partial code and change bytes beneath accepted work. |
| A second installer service/store | Duplicates ownership and introduces an unneeded daemon. |

The shared Host owns this flow for Desktop and `serve`; the UI is a thin surface:

1. Show source, id, installed/offered version and requirements; obtain explicit
   download/install consent. Download only into a private installation staging
   area, outside document Roots and ordinary plugin discovery/asset routes.
2. Verify the catalog signature and package archive hash/size for online input.
   Parse only bounded metadata from the ZIP, verify the release signature, then
   extract the declared payload into private staging and verify every file.
   Local packages enter the same flow at package verification (section 6).
3. Reject traversal, absolute/drive paths, links, duplicate or Windows-aliased
   names, undeclared files and excessive compressed/uncompressed sizes or entry
   counts. Enforce limits before/during extraction, not after unbounded allocation.
   Check manifest/API and rehash the completed staged bytes before committing.
4. Reuse the immutable installation revision and existing registration transaction
   to publish the complete candidate. Compare the previously observed registration
   revision/enabled state; concurrent update/removal makes the operation conflict,
   rather than undoing another Host's choice. Preserve disabled state on update.
   No partial installation is discoverable or executable. Already accepted work
   retains its old installation; future work sees the committed revision.
5. Download, verification or pre-commit activation failure leaves the previous
   registration intact. On interruption, registration is wholly old or wholly new;
   a committed new registration points only to a completely verified installation.
   Private leftovers never auto-activate. Clean only this attempt's recorded files;
   do not scan document Roots or delete other requests' staging.

Activation here means publication of a validated registration, not successful
execution of every plugin action or atomic rendering across all open Hosts.
After commit, UI/worker faults use ADR-0012's existing failure boundaries. Keep
the prior immutable revision for an explicit user rollback, rechecking its trust,
hash and this Host's APIs. Rollback is a deliberate exception to newer-version
update selection, not an automatic downgrade. A crash after commit does not
silently undo a valid installation or replay work. Native ESM cannot be unloaded;
detach/dispose and retained disabled-tab context keep their existing contract.

Removal first commits disabled/unregistered state, refusing new requests across
Hosts, then detaches contributions and drains all already admitted requests at
their pinned versions. Host death leaves uncertain receipts without replay;
drain does not promise cancellation of a remote Docling task. Preserve request
records, original PDF/JSON, complete conversion results and native documents.
Removal is logical removal from active registration: immutable code/receipts
remain, as in the existing unregister contract; physical garbage collection is
not introduced. Never delete bytes still pinned by another Host. Explicit removal
must not be reversed by discovery, app update or default-plugin seeding.

### 5. Update checks and user consent

| Option | Trade-off |
| --- | --- |
| **Recommend: automatic metadata checks, explicit download and activation** | Reuses Desktop's check/consent rhythm without changing code behind the user's back. |
| Manual checks only | Minimizes network use but makes available fixes hard to discover. |
| Automatic download/install | Removes consent and can replace a plugin during work. |

When an Editor client is connected, check 15 seconds after initial connection,
then every 6 hours; after an error retry no sooner than 30 minutes. Opening
Settings → Plugins exposes immediate manual Check. Allow one check in flight
per Host and reuse its result across clients; concurrent independent Hosts need
no scheduler service. A CLI conversion does not start periodic checks, and
closing clients does not create background work. Reuse Desktop's timing policy,
not its Electron-only updater instance. HTTP Host fetches from its own network;
the browser does not fetch executable code from the catalog origin.

Allow automatic checks to be disabled for offline/private deployments. A check
fetches metadata only. Download and Install/Update are separate explicit actions;
no install on ordinary quit, silent activation, bulk opt-in or automatic enable
of a disabled plugin. Confirm the exact id/version/hash the user reviewed; if
the offer changes, require a fresh review. Errors retain the installed version
and remain visible in plugin settings without blocking ordinary editing.

### 6. Offline and intranet installation

| Option | Trade-off |
| --- | --- |
| **Recommend: install the same signed ZIP from a local file** | Supports offline transfer without a second package/trust format. |
| Online catalog only | Simpler UI, but excludes disconnected and restricted networks. |
| Unpacked/unsigned packages in official settings | Makes origin verification optional and bypasses the official trust boundary. |

Support Install from file with the same confirmation, signature, identity,
payload hash, compatibility, staging and registration checks; a live catalog is
not required because the package carries its signed descriptor. The file picker
and thin Host input obey existing HTTP Root/real-path access rules. A browser
local path is not automatically a path on a remote HTTP Host; use a file available
to that Host inside an allowed Root. No arbitrary server filesystem access is
added. Local ZIP installation is distinct from existing developer trusted-source
registration, which is not presented as verified official installation.

An intranet may mirror the exact signed catalog/packages under a packager-selected
HTTPS URL; URLs may differ while signed identities/bytes and pinned keys remain
unchanged. A repackaged or internally authored plugin requires that distribution's
own catalog identity/key and is labelled accordingly. No certificate/signature
checks are disabled. Offline status explains that update/revocation freshness
cannot be established. Package installation does not remove Docling's separate
external-service requirement or make PDF conversion itself offline.

### 7. Default-included framework and installable Docling

| Option | Trade-off |
| --- | --- |
| **Recommend: bundle the AI framework; install Docling after the transition gate** | Follows the owner's decision, keeps AI provider choice separate and exercises a real official installer. |
| Bundle both permanently | Avoids an installer transition but loses the requested independent Docling distribution. |
| Remove bundled Docling before installation is ready | Leaves users without the initial PDF conversion entry point. |

The future provider-neutral AI agent framework ships with the app, enabled on
first installation, using the same manifest/lifecycle and allowing disable/remove.
An app update does not re-enable or restore a deliberately removed default plugin.
Provider adapters remain user-selected plugins; credentials, document proposals
and approval are a separate AI decision. The core product works without AI.

Docling remains bundled and follows today's registration behavior until the
official catalog/package, trust provisioning and Desktop/HTTP install/update/
remove flow pass the adoption checks below and the owner approves the transition.
Only that implementation PR switches to installable Docling; this ADR changes
no bundle. Settings and first-run guidance must expose “Official plugin:
Docling PDF conversion · Install”. A normal app update must not silently delete
an existing installed/pinned Docling revision, disable setting or request record.
This preserves the transition boundary without designing legacy-data migration.

### 8. Packager configuration and trust

| Option | Trade-off |
| --- | --- |
| **Recommend: catalog URL, catalog identity and public keys in the build-time brand configuration** | Extends the existing single configuration and explicit rebuild rule. |
| Runtime environment/catalog-supplied trust keys | Can redirect trust without a reviewed application build. |
| Hard-coded official keys scattered through Hosts | Makes rebranding inconsistent and duplicates trust policy. |

Retain `officialPluginsUrl` as the catalog endpoint; the implementation adds
`officialPluginsCatalogId` and `officialPluginsPublicKeys` (key id → Ed25519
SPKI PEM public key) alongside it in `brand.ts`. These are proposed keys, absent
today. A null URL disables online discovery/checks; local-file installation still
requires a configured catalog identity and keys. A configured URL without valid
identity/keys, or keys without an identity, fails the packager build. No private
key is included. Desktop and CLI/HTTP consume the same generated trust values.

Changing a URL requires rebuilding and validating the catalog identity/signatures;
changing trust keys requires a reviewed build and the rotation/revocation rules
above. A mirror retains official identity/keys. A separately curated catalog uses
its own identity/keys and distribution label, not the Litzio official label.
Network/catalog content cannot add trust anchors. Isolate different brands using
the existing app/data/shared-installation folder rules; an explicit same-folder
override cannot promise trust isolation. Do not rename internal APIs or weaken
Core/Root/CSP restrictions. Package/trust acceptance is checked by every Host,
including an existing registration created by another distribution.

## Adoption and verification gates

Owner acceptance precedes implementation. The official-installer PR must update
the worker/UI/branding contracts with actual behavior and verification, including:

- Tampered catalog/package/cached files, absent/unknown/revoked keys, rotation
  overlap, mismatched metadata, replayed catalog generations, ZIP extraction
  attacks/limits and rejection before worker execution/UI loading.
- Compatible and incompatible worker/UI/React requirements, mixed-version Hosts,
  disabled/removal persistence and exact-version consent. Ordinary editing remains
  usable after network, validation, load and worker errors.
- Interrupted download/extraction/commit, concurrent Desktop/HTTP mutations,
  old-version pinning, explicit rollback and removal during work; no partial
  discovery, request replay, document deletion or cross-request cleanup.
- The actual packaged Windows Desktop and independent Node HTTP Host sharing an
  installation; offline signed-file installation without network and an intranet
  mirror. Build checks cover official and alternate brand URL/identity/key sets.
- Real publication/read-back and signed package delivery before the Docling
  transition. Synthetic/local-feed checks do not establish public delivery,
  real Docling service conversion or source fidelity; retain the existing
  [manual Docling check](../test/README.md#docling-worker-runtime-853).

No new document semantic operation is proposed, so no semantic CLI command is
required. The installer belongs in the existing shared Host with thin interfaces;
the current headless Docling conversion and independent `serve` remain available.

## Consequences and non-decisions

This adds a first-party distribution/trust boundary, not a marketplace or general
plugin platform. It reuses GitHub Releases and verified publication, the shared
installation/registration store, immutable revisions, staging, request records
and drain. Catalog trust metadata belongs only to installation management under
ADR-0012's narrow durable-state exception, not document/session persistence.

Third-party marketplaces, AI-generated plugin installation/approval, AI provider
credentials/document proposal semantics, OS sandbox, daemon, background jobs,
new permissions infrastructure and physical installation garbage collection are
outside this decision. Signatures identify an approved publisher; they do not
sandbox trusted plugin code. Revisit the decision if required platforms cannot
verify the chosen signature format or a concrete third-party distribution need
appears.
