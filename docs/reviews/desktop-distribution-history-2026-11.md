# Desktop distribution and updates v1 — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../design/desktop-distribution-v1.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Previous verification metadata

- Public release verification: 2026-11-13 — v0.0.3-beta.1 tag, third unsigned workflow success, prerelease status, Korean body and asset API metadata checked. Anonymous installer SHA-256/SHA-512 match; see the [release record](../releases/v0.0.3-beta.1.md). Stable/Latest remains v0.0.2. Actual GitHub installation/update remains unverified.
- Release policy verified: 2026-11-12 — owner-authorized unsigned Stable policy; controller, workflow and updater configuration reviewed. Actual unsigned Stable GitHub installation/update remains unverified.
- Last verified: 2026-11-10 — #1448 main 회귀 검사와 Windows query의 미저장 작업 보류 계약 대조. 실제 트레이·Electron/NSIS·OS 로그아웃 수락은 미확인.
- Lifecycle CI scope verification: 2026-11-03 (#1009 P6; policy/workflow and unit contracts; actual package/install/update/uninstall execution is CI-only).
- Brand CI policy verification: 2026-11-02 (#888; path/aggregate/release workflow regressions and docs checks; package/install execution remains PR Windows CI).
- CI artifact policy verification: 2026-10-30 (#808; generated evidence paths compared with packaged/update/uninstall tests, workflow policy regressions and docs check; package/install execution remains required CI).
- Feature sample verification: 2026-10-28 (#528 localized folders, Core read-model coverage and canonical CLI check/format; Desktop replacement/preservation unit tests and development browser entry/captures; no local packaged Desktop run).
- Window startup verification: 2026-10-28 (#643 / #644 review: production-minified renderer bridge matrix, Desktop main lifecycle/strict-IPC unit tests including absent first paint; saved light/flat packaged restart regression is CI-only).
- Version correction verification: 2026-10-28 (#632: `0.0.2-beta.1` published; anonymous assets and withdrawal of both `0.1.0` Beta Releases/assets/remote tags verified; actual GitHub installation/update unverified; [record](../releases/v0.0.2-beta.1.md)).
- CLI directory cleanup verification: 2026-10-28 (#629: isolated disable/uninstall ownership tests, Desktop typecheck and CI channel-order tests; actual Stable→Beta and NSIS checks run only in disposable Windows CI).
- CLI integration verification: 2026-10-27 (#604: isolated environment/shim tests, CLI tests/offline package, Editor tests/typecheck/build, persistent-Chrome Settings and layout checks; packaged runtime and real registry/install/update/uninstall checks are required Windows CI, not local execution).
- Title-bar verification: 2026-10-27 (#605: Desktop 48 tests, typecheck, browser bridge/theme/geometry checks; actual native overlay and packaged checks run in CI, manual Windows items remain explicit below).
- Separator verification: 2026-10-28 (#635: persistent Windows Chrome, light/dark, 1440/1424/1423/640px, Outline/sidebar open and closed, representative 138px/zero caption reservations; four 1440/640px before/after PNG pairs differ only in the missing 138×1px line. Actual native geometry remains Windows packaged CI; native visual acceptance is separate).
- Previous execution verification: 2026-11-04 (public 0.0.2-beta.6, first release run succeeded; tag/commit, Korean Release body and asset metadata checked; orchestrator anonymous download and SHA-512 evidence recorded; actual installation/update unverified; [record](../releases/v0.0.2-beta.6.md)).
- Previous verification: 2026-10-26 (public 0.1.0-beta.1, release CI, anonymous assets, real GitHub 0.0.1-beta.4→0.1.0-beta.1 update and Korean Windows packaged regression with #450; see the release record).
- Previous verification: 2026-10-16 (#204: all-tabs close/restart aggregation and native close wording; 39 Desktop tests and desktop-updates browser regression; no installer/updater boundary change).
- Previous verification: 2026-10-15 (public beta.4, release CI, anonymous assets and actual GitHub beta.3→beta.4 update; see the release record).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).

## Evidence and limits

Beta.2 candidate verification on 2026-10-12: frozen install, full typecheck/docs, workspace tests (520 passed and 2 existing Windows skips), final Desktop integration (37), final full browser regression (43), clean Windows Beta package with PE versions/SHA-512/size/recomputed blockmap, packaged regressions (8), real NSIS local-feed Stable and Beta updates, actionlint and 21 Windows PowerShell run-step parses passed. The packaged live Stable lookup showed the expected absence message with the actual archive-tag feed. Installer remains unsigned. An initial browser run missed one expected save-session HTTP400 console entry; unchanged isolated and full rechecks passed without weakening criteria. The expanded install test initially needed its canary parent folder created, which was fixed; both final install/update runs passed and uninstalled their own app.

See the [beta.2 release record](../releases/v0.0.1-beta.2.md) for exact scope, failure defenses and public artifact fingerprints. The approved manual workflow published beta.2 after successful Linux browser and Windows NSIS/package checks. Anonymous downloads and the actual public beta.1→beta.2 installation passed, including ordinary-quit protection, unsaved-work refusal and saved Markdown/preferences/channel/user-data preservation. The following initial implementation/preparation measurements are historical evidence and remain unchanged.

Initial Desktop implementation verification on 2026-10-12:

| Check | Result |
| --- | --- |
| Frozen install, full workspace typecheck, docs checker tests/check and diff whitespace | Passed; docs checker tests 5 |
| Core / File commit / CLI / Editor / Desktop unit/integration | 210 / 2 / 46 / 225 / 30 passed; File commit has 2 existing Windows-only environment skips |
| Full browser suite | 43 passed after the unload fix; source fixture preservation and runner cleanup included |
| Actual NSIS install/update with a local stand-in feed | Passed: ordinary quit does not install; missing IPC answer/renderer check error/dirty document refuse; Save then update 0.0.1→0.0.2, relaunch, document preservation and uninstall |
| Normal 0.1.0 package and packaged regressions | Artifact verification and all 7 regressions passed; no forced process termination needed |
| Initial Beta test package | 0.1.0-beta.1 built/verified with `beta.yml`, no `latest.yml`; at that stage the normal package was reset to 0.1.0 and github.com |
| Public build without credentials | Refused by `forceCodeSigning`; this is an expected negative check |
| Workflows | actionlint 1.7.12 and PowerShell parsing of all 21 Windows run steps passed; GitHub jobs/publication not executed |

The initial 0.1.0 Windows app showed its window in 732 ms: 4 processes, 396 MB combined working set after 3 seconds, 0 TCP listening ports. This is a local single-run observation, not a performance guarantee. That development installer was approximately 102.5 MiB and unsigned.

First Beta preparation additionally verified `0.0.1-beta.1 → 0.0.1-beta.2` with actual NSIS installation and a local feed containing no Stable release. The installed default was Beta, `beta.yml` supplied the update, ordinary quit did not install, missing/failed Editor answers and unsaved work refused restart, and Save allowed installation/relaunch with document preservation and uninstall. Windows `ProductVersion` drops the prerelease identifier (`0.0.1.0` for both Betas); the regression now compares the complete `FileVersion` exactly, retaining `beta.1`/`beta.2`. Its first run exposed the old numeric-version assumption before that correction. This remains unsigned local-feed evidence, not signed GitHub delivery.

The same regression also passed for Stable `0.0.1 → 0.0.2`. Full workspace unit/integration and type checks passed, along with docs and whitespace checks. The final clean `0.0.1-beta.1` package passed artifact verification (`beta.yml` only, correct version/hash and GitHub provider without a test host) and all 7 packaged regressions, including initial Beta selection and saved Stable selection after restart. Direct execution showed the window in 681 ms, 4 processes, 395 MB combined working set after 3 seconds and no TCP listeners. The final approximately 102.5 MiB installer is unsigned and exists only in generated `apps/desktop/release/`; no remote CI, tag or public release was executed for Beta preparation.

The [first remote CI run](https://github.com/litzio/litzio/actions/runs/38190001483) passed the Windows installer/update/package job and both Editor browser shards. Its Linux quality job exposed a fixture error: the Windows `NsisUpdater` mock inherited the runner platform and requested `latest-linux.yml`/`beta-linux.yml`. The fixture now uses electron-updater's test platform option to model Windows on every runner; the actual provider, download/checksum/signature paths and assertions are unchanged. The initial unsigned Beta policy supersedes the original requirement that every public Beta be signed.

Before the unload fix, the first Saved DOM commit still prevented unload using the earlier Saving closure. The added browser regression failed on that state and passed when the guard read the current rendered busy ref. The real packaged Save→close→reopen path then completed normally. This changes no document, revision, selection/history or Save semantics. Electron test profiles retain Chromium state between runs; only app-owned test preferences/sample/logs are reset, and a failed close has a bounded cleanup that still fails the test.

Visual review used the same sample at 1440×1000 before/after the Desktop bridge, plus About at 1440×1000 and 375×812, DPR 1 / 100% zoom after fonts/images loaded. Captures are local `tmp/desktop-visual/`; only the Desktop footer was added to the sample view and About/actions fit the phone width. These are real Editor UI captures with a mock bridge, separately from packaged Windows execution.

`pnpm audit` reported 16 advisories (5 high, 10 moderate, 1 low), compared with 15 on the current baseline lockfile. The added advisory is optional build-time `sprintf-js@1.1.3` under electron-builder's download/proxy logger; it is not a runtime import or a shipped module in the bundled app. Existing Core/MyST and Editor tooling advisories remain; this work does not claim a clean security audit or change those dependencies. See the existing [MyST security follow-up](https://github.com/litzio/litzio/issues/11).

Signing credentials are not installed by this work. SmartScreen/reputation, corporate endpoint policy, OS IME/clipboard and physical touch require their respective real environments; automated mocked feeds and clipboard events do not establish those results. Signed real GitHub delivery and signing environment/secret setup remain future work. The first unsigned Beta was published from verified CI artifacts. Before it existed, GitHub update check errors were expected and did not block editing. These preceding paragraphs preserve preparation evidence; they do not describe the current public-release state.

## Settings update cue verification (#665)

This changes only Desktop notification preferences and Editor interactions; Core document semantics
and CLI operations are unaffected. Unit coverage checks bilingual accessible cues in both Sidebar
states, preference persistence and trusted/current-offer IPC acknowledgement. The mock-bridge browser
scenario checks acknowledgement, reload, a newer version, direct About navigation, highlight and
existing download/restart work protection. Packaged/install/update/uninstall execution is CI-only.

Same-state 1440px and 640px English/dark captures compare the former banner with the Settings dot:

| Width | Before | After |
| --- | --- | --- |
| 1440px | [banner](../design/assets/update-dot-665/before-en-dark-1440.png) | [dot](../design/assets/update-dot-665/after-en-dark-1440.png) |
| 640px | [banner](../design/assets/update-dot-665/before-en-dark-640.png) | [dot](../design/assets/update-dot-665/after-en-dark-640.png) |

Additional states: [640px rail](../design/assets/update-dot-665/after-en-dark-640-rail.png),
[640px About highlight](../design/assets/update-dot-665/about-en-dark-640.png).

The complementary Korean/light states show [1440px](../design/assets/update-dot-665/after-ko-light-1440.png),
[640px](../design/assets/update-dot-665/after-ko-light-640.png) and the
[direct About highlight](../design/assets/update-dot-665/about-ko-light-640.png).

Local verification (2026-10-28): Editor 331 and Desktop 68 unit tests passed, workspace typecheck,
Editor production build, docs check, desktop-updates, layout-rules and quiet-document passed.
The browser used this checkout's persistent Chrome profile. BadPasswordAttempts checks were
0 before the first launch, then 1, 3, 4 and 5 after the final run; no further browser run was
started at 5. The dedicated 5365 Vite server and owned browser context were closed. Packaged
Desktop, installer/update/uninstall, Edge and fresh-profile probes were not run locally.


## Additional previous verification metadata

- PR4 daemon lifetime verification: 2026-11-04 — existing fake app-server/HTTP, shutdown/uncertain/no-replay, CLI ownership subprocess tests and persistent Chrome reconnect preservation; restored packaged worker/native comparison is required Windows CI.
- PR3 verification: 2026-11-04 — CLI 90, Editor 433, Desktop 76 tests; ownership/crash/stale subprocess cases; typecheck and dev build; persistent Chrome Desktop/HTTP scenarios. Windows packaged checks remain CI-only.
- Sample safety verification: 2026-10-28 (#686 review fixes; OS-temp ownership/junction/copy/rename unit regressions and Host/client failure propagation; no additional local browser or packaged execution).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Documentation verification: 2026-10-26 (Host startup response versus Editor tab restoration compared with first-document.ts, host-protocol.ts, App.tsx and the session contract; no new Desktop execution).
- Previous verification: 2026-10-16 (#296 PR3: actual packaged Windows process crash/normal close, same-profile recovery, pending Figure, Save/Reload and external conflict. Native close answer is stubbed; no install/update/release performed).
- Previous verification: 2026-10-16 (#296 PR2: native Close without saving wording; Desktop tests/typecheck and mock-bridge browser guards).
