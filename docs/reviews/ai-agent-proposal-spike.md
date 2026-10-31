# AI agent proposal concept spike

- Status: Historical
- Date: 2026-11-01
- Last verified: 2026-11-01 KST; Windows Vite, persistent Chrome, Core/Editor checks and real Codex CLI. No packaged/Edge execution.
- Authority: owner-approved, non-merging experiment in [Discussion #767](https://github.com/litzio/litzio/discussions/767). Current architecture remains [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md).
- Branch: `spike/ai-agent-proposal`; push only, no PR, issue or master changes.

## Experiment boundary

One trusted plugin in `plugins/ai-agent`, one Codex CLI adapter and a deterministic fake adapter. Selected top-level paragraphs and headings support inline replacement only. No section restructuring, streaming, credentials UI, deployment or provider selection UI. The plugin receives public Core models and injected UI capabilities, never editor-engine state or file-writing access.

The existing worker API 1 accepts only Docling jobs. This spike adds worker API 2 for request/result IPC and a narrow proposal Host route, with shared installation, UUID receipts, uncertain recovery and disable/drain. UI additions expose an opaque selection snapshot, Core-validated inline application and the existing comparison renderer. These experimental additions are not an adoption decision.

The Core operation is callable headlessly through the proposal Host API. A separate CLI semantic command is intentionally omitted for this non-merging spike: the Host already exposes the exact validation path without a screen; CLI productization needs an adoption decision.

## Measurements

All eight concept conditions passed locally. This is evidence for the scoped experiment, not a product-adoption decision or AI factual-quality guarantee.

| Condition | Result | Measured evidence |
| --- | --- | --- |
| a. Request → comparison → apply → one Undo | PASS | Real fake-adapter worker/Host/Core pipeline. Added `Before AI.` manually first; applied the proposal, then one `Ctrl+Z` restored the **exact engine JSON** captured before the proposal, retaining the manual edit. Asserted immediately after Undo, without reload or polling. The same editor DOM instance survived. |
| b. Reject leaves document unchanged | PASS | Rejected a second proposal; exact engine JSON equalled the baseline. Disk source remained unchanged throughout a–f, including the successful unsaved application. |
| c. Core-invalid proposal refused with reason | PASS | Fake returned an unsupported MyST directive. Host receipt `7de60e85-45d6-45f9-86e7-55e4031e7804` ended `error`, reason `Unsupported native content: mystDirective`, without a result. UI displayed the reason, offered no Apply, and retained the exact document. Core tests also reject multiple blocks, kind/heading-level changes and injected frontmatter. |
| d. Changed document refuses apply | PASS | Edited the original document after its comparison appeared. Apply reported `문서가 제안 기준 이후 바뀌었습니다. 문서에서 다시 요청하세요.`; exact changed engine JSON was retained. The guard uses a monotonically changing instance revision, rather than selection or text equality. |
| e. Worker failure and timeout preserve editor | PASS | Worker exit 7 produced `AI worker failed (7).`; a non-finishing fake worker hit the actual 1s watchdog and produced `AI proposal worker timed out. Request again.` Both left the same document JSON/DOM and accepted further typing. Separate headless shutdown test waits for worker exit and records no partial result. The real CLI-child timeout was not deliberately induced. |
| f. Disable removes command; app stays usable | PASS | Deleted `ai-agent` through the existing registration API. Its command disappeared live, with no page navigation; unsaved content and further typing survived. Plugin registration was restored explicitly after the scenario. |
| g. Real Codex CLI proposal | PASS | CLI 0.164.0 reported ChatGPT login. Initial real request completed in 5,105ms; final installed bundle request in 4,198ms. Both returned Core-valid proposals. Final output: `This sentence is lengthy and vague.` See the preserved [first receipt](assets/ai-agent-proposal-spike/codex-first.json) and [final receipt](assets/ai-agent-proposal-spike/codex-final.json). |
| h. Proposal request without a screen | PASS | Both real requests used PowerShell HTTP POST/GET, independently of the plugin UI. Headless Node tests additionally verify shared UUID/result reuse across Host instances, conflicts, disable/drain, uncertain/no replay after owner end in the same live PID, and shutdown. |

The final a–f scenario took 11.9s (19.8s including browser setup/teardown).
The [comparison capture](assets/ai-agent-proposal-spike/comparison-1440.png) is the actual 1440×1000 Light/English-shell view with Korean plugin copy. It was generated during the assertions and visually inspected. It shows the original paragraph, proposal, word differences and Apply/Reject controls.

## Implementation and reproduction

- `plugins/ai-agent`: provider-neutral adapter function, Codex/fake adapters, IPC worker and contributed command/tab. No Editor/Tiptap/ProseMirror imports, Markdown parser, file commit or API-key UI.
- `packages/core/src/myst/proposal.ts`: native parse of the replacement, one-block/same-kind/heading-level check, existing inline semantic operation, whole-document canonical/native validation. The original Core document stays unchanged.
- `apps/editor/server/proposal-runtime.ts`: installed worker execution, Core validation and complete-result publication. The ordinary file Host still owns Save.
- `packages/plugin-api/src/ui.ts`: opaque selection, proposal request, injected comparison and narrow apply capability. Editor engine types stay in the Editor.

The current worker API 1 was explicitly Docling-shaped, so it was not reused by pretending an AI request was a PDF conversion. API 2 and the small separate receipt table are branch-only. Generic registration/runtime handlers changed; `packages/docling` and its plugin source/build implementation were not edited. The AI build reuses the existing generic `buildPluginUi` helper.

Start from this checkout after `pnpm install --frozen-lockfile`:

```powershell
$env:LITZIO_PLUGINS_DIR = Join-Path $PWD 'tmp/ai-spike-plugins'
$env:LITZIO_DOCLING_SETTINGS_FILE = Join-Path $PWD 'tmp/ai-spike-docling.json'
pnpm --filter @litzio/editor dev --port 5283
```

Vite builds/seeds the plugin only if absent. After changing its code, explicitly re-register `tmp/ai-agent/manifest.json` through `POST /api/worker-plugins`; existing registrations intentionally stay pinned. The final measured installation revision was `ea1c7dd768f65f8e818a50dd2a45374349fc80cb3d8767405bd120e79c530d0d`.

Headless request body for `POST http://127.0.0.1:5283/api/ai-proposal`:

```json
{
  "id": "<new UUID>",
  "source": "---\nlitzio: 1\n---\n\nThis sentence is very very long and vague.\n",
  "index": 0,
  "instruction": "Rewrite the selected sentence concisely, preserving its meaning. Return one paragraph.",
  "adapter": "codex"
}
```

Read `GET /api/ai-proposal?id=<UUID>` until it leaves `running`. Omit `adapter` for the same Codex default; automatic browser verification injects `fake` only into the POST, retaining the actual Host/worker/Core pipeline. No request writes the document.

The Codex adapter invokes the installed executable directly, without a shell. It uses stdin, `exec --ignore-user-config --ignore-rules --skip-git-repo-check --ephemeral --sandbox read-only --model gpt-6.1-sol`, low reasoning, JSON schema and `--output-last-message`, in an isolated temporary working directory. Existing CLI authentication is reused; no account/configuration changes were made. The [official non-interactive guide](https://learn.chatgpt.com/docs/non-interactive-mode) and local `codex exec --help` were checked. Temporary schema/answer files are adapter output, not native-document writes; normal completion removes them.

## Verification record

Environment: Windows, Node 24.21.0, pnpm 12.5.1, Codex CLI 0.164.0; base `4e49489963fedc237d44154e5b6da85302dde7e7`.

| Command | Result |
| --- | --- |
| `pnpm --filter @litzio/core test` | 350/350 passed, including new native proposal preservation/refusal coverage. |
| `pnpm --filter @litzio/editor test` | 380/380 passed, including 3 headless proposal runtime checks. |
| `pnpm typecheck` | All existing workspace checks passed. |
| `pnpm --filter @litzio/ai-agent typecheck` | Passed. |
| `pnpm --filter @litzio/editor build` | Passed; existing large-chunk warning remains. |
| CI quality/execution policy Node tests | 15/15 passed after adding the stable browser scenario. |
| `pnpm browser:test ai-agent-proposal --screenshots` | 1/1 passed with `LITZIO_BROWSER_URL=http://127.0.0.1:5283`. |
| `pnpm browser:test plugin-ui pre-save-diff layout-rules quiet-document` | 4/4 passed on the same checkout profile/origin. |
| `pnpm docs:check`, `git diff --check` | Passed. |

Initial verification found two harness/compatibility failures, both resolved without weakening assertions: the old registry test used API 2 as its incompatible version (now 99, while conversion admission still explicitly rejects API 2); the new browser file needed registration in the stable suite/fixture inventory. Captures are gated by `--screenshots`, so ordinary tests do not rewrite the retained PNG.

## Limits and decision point

- Only one selected top-level paragraph or heading, with inline changes and a stable heading level. No block/section restructuring. Output requiring additional definitions, such as endnote-bearing fragments, fails closed at Core validation; supporting those contexts is outside this spike.
- The comparison uses canonical applied document snapshots, so it includes surrounding content; only the selected Core block and instruction are sent to Codex. Validation establishes supported syntax/round-trip stability, not factual correctness.
- UI copy is intentionally Korean, with no provider configuration. Closing/disabling the view loses its view-local request/decision state; accepted work and receipts remain available through Host API. This adds no startup-restoration guarantee.
- Vite is the measured entry point. Shared HTTP/Desktop handlers have the route, but packaged Desktop, offline distribution and other platforms were not exercised. Local packaging, `test:update`, `test:uninstall` and Edge were not run, as requested.
- Security, credentials management, multiple real providers and deployment remain excluded. Existing native ESM detachment limitations remain unchanged.

No blocking issue remains for a–h. Adopting the experiment would require a separate scope/API decision; this branch is not proposed for merge.

## Process cleanup

Only the checkout-owned persistent Chrome profile was used: `%TEMP%/ieumdoc-browser-profile/24fa83b0eb62c956`. Runner-owned contexts closed after each invocation; the profile was retained. No temporary profile or Edge launch occurred. The Windows account remained unlocked before/after; no password-failure counter baseline was collected.

Vite PIDs 23244 and 51356 were started by this task. The first was replaced after runtime changes; both owned process trees, including their esbuild children, were terminated. Before final shutdown the isolated receipt store had zero running proposals. Final checks found zero task worker/CLI/profile processes, neither Vite PID alive, and zero listeners on 5283; see [cleanup result](assets/ai-agent-proposal-spike/cleanup.json). No user-owned process was terminated.
