# Desktop distribution and updates v1

#1285: 설정 → 저장·복구에서 [완전 초기화](app-reset-v1.md)를 제공한다. 현재 제거기의 사용자 데이터 보존 정책과 별개로 Desktop profile·로컬 Host 사용자 데이터·secret·sample·cache를 전부 비우며, 빈 대상 폴더 자체의 제거만 선택한다. 기존 pending-work/restart 보호 후 앱을 닫고 별도 helper가 정확한 부모 종료와 계정 공용 writer gate를 확인해 삭제·receipt·재실행한다. 다른 채널/CLI-owned daemon을 강제 종료하지 않는다. 외부 브라우저 profile·원격 서비스·별도 문서·계정은 유지하며 실행 전 표시한다. 로컬 fixture/main/helper 및 Chrome stand-in UI 검증과 실제 packaged CI의 경계는 연결한 계약을 따른다.

#1150 ③ (2026-11-04): AI는 daemon 공식 기능이며 Settings → AI agent에서 관리한다. 공통 Button·SettingsSelect·Dialog와 기존 설정 화면 배치를 재사용한다. 플러그인 등록/관리/기여 탭·Docling은 제거했다. 아래 플러그인·Docling 관련 과거 캡처/검증 서술은 현재 기능이 아니며 [보관 소스](https://github.com/litzio/litzio/tree/archive/plugins-docling-2026-11) (`ce90560a`)의 기록이다. 현재 AI 계약은 [Main agent](main-agent-v1.md), 결정은 [ADR-0017](../adr/0017-bundled-client-and-official-ai.md)을 따른다. Host 클라이언트와 Desktop 번들 UI는 [HTTP Host 계약](http-host-v1.md#desktop-bundled-origin-1150-⑤)을 따른다.

- Status: Implemented
- Public release verification: 2026-11-09 — beta.9 tag, successful first unsigned-beta workflow, Korean Release body and asset API metadata checked; orchestrator anonymous download/hash evidence recorded in the [release record](../releases/v0.0.2-beta.9.md). Actual GitHub beta.8 → beta.9 installation/update remains unverified.
- Last verified: 2026-11-10 — #1448 main 회귀 검사와 Windows query의 미저장 작업 보류 계약 대조. 실제 트레이·Electron/NSIS·OS 로그아웃 수락은 미확인.
- Remote registration PR3a verification: 2026-11-05 — temporary-path registry/CLI, exact CSP and health preflight tests; production HTTP persistent Chrome recovery/Save/Reload/conflict (2 passed). Settings/protected restart and live Windows Desktop → Linux remote connection remain unverified and outside PR3a.
- PR4 daemon lifetime verification: 2026-11-04 — existing fake app-server/HTTP, shutdown/uncertain/no-replay, CLI ownership subprocess tests and persistent Chrome reconnect preservation; restored packaged worker/native comparison is required Windows CI.
- PR3 verification: 2026-11-04 — CLI 90, Editor 433, Desktop 76 tests; ownership/crash/stale subprocess cases; typecheck and dev build; persistent Chrome Desktop/HTTP scenarios. Windows packaged checks remain CI-only.
- Lifecycle CI scope verification: 2026-11-03 (#1009 P6; policy/workflow and unit contracts; actual package/install/update/uninstall execution is CI-only).
- Brand CI policy verification: 2026-11-02 (#888; path/aggregate/release workflow regressions and docs checks; package/install execution remains PR Windows CI).
- CI artifact policy verification: 2026-10-30 (#808; generated evidence paths compared with packaged/update/uninstall tests, workflow policy regressions and docs check; package/install execution remains required CI).
- Log-folder access: 2026-10-29 (#712; [Host-only diagnostics](#log-folder-and-process-diagnostics-712)).
- Sample safety verification: 2026-10-28 (#686 review fixes; OS-temp ownership/junction/copy/rename unit regressions and Host/client failure propagation; no additional local browser or packaged execution).
- Feature sample verification: 2026-10-28 (#528 localized folders, Core read-model coverage and canonical CLI check/format; Desktop replacement/preservation unit tests and development browser entry/captures; no local packaged Desktop run).
- Window startup verification: 2026-10-28 (#643 / #644 review: production-minified renderer bridge matrix, Desktop main lifecycle/strict-IPC unit tests including absent first paint; saved light/flat packaged restart regression is CI-only).
- Version correction verification: 2026-10-28 (#632: `0.0.2-beta.1` published; anonymous assets and withdrawal of both `0.1.0` Beta Releases/assets/remote tags verified; actual GitHub installation/update unverified; [record](../releases/v0.0.2-beta.1.md)).
- CLI directory cleanup verification: 2026-10-28 (#629: isolated disable/uninstall ownership tests, Desktop typecheck and CI channel-order tests; actual Stable→Beta and NSIS checks run only in disposable Windows CI).
- CLI integration verification: 2026-10-27 (#604: isolated environment/shim tests, CLI tests/offline package, Editor tests/typecheck/build, persistent-Chrome Settings and layout checks; packaged runtime and real registry/install/update/uninstall checks are required Windows CI, not local execution).
- Title-bar verification: 2026-10-27 (#605: Desktop 48 tests, typecheck, browser bridge/theme/geometry checks; actual native overlay and packaged checks run in CI, manual Windows items remain explicit below).
- Separator verification: 2026-10-28 (#635: persistent Windows Chrome, light/dark, 1440/1424/1423/640px, Outline/sidebar open and closed, representative 138px/zero caption reservations; four 1440/640px before/after PNG pairs differ only in the missing 138×1px line. Actual native geometry remains Windows packaged CI; native visual acceptance is separate).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Documentation verification: 2026-10-26 (Host startup response versus Editor tab restoration compared with first-document.ts, host-protocol.ts, App.tsx and the session contract; no new Desktop execution).
- Previous execution verification: 2026-11-04 (public 0.0.2-beta.6, first release run succeeded; tag/commit, Korean Release body and asset metadata checked; orchestrator anonymous download and SHA-512 evidence recorded; actual installation/update unverified; [record](../releases/v0.0.2-beta.6.md)).
- Previous verification: 2026-10-26 (public 0.1.0-beta.1, release CI, anonymous assets, real GitHub 0.0.1-beta.4→0.1.0-beta.1 update and Korean Windows packaged regression with #450; see the release record).
- Previous verification: 2026-10-16 (#296 PR3: actual packaged Windows process crash/normal close, same-profile recovery, pending Figure, Save/Reload and external conflict. Native close answer is stubbed; no install/update/release performed).
- Previous verification: 2026-10-16 (#296 PR2: native Close without saving wording; Desktop tests/typecheck and mock-bridge browser guards).
- Previous verification: 2026-10-16 (#204: all-tabs close/restart aggregation and native close wording; 39 Desktop tests and desktop-updates browser regression; no installer/updater boundary change).
- Previous verification: 2026-10-15 (public beta.4, release CI, anonymous assets and actual GitHub beta.3→beta.4 update; see the release record).
- Authority: [ADR-0004](../adr/0004-desktop-host-distribution.md); document semantics and Save remain owned by [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [Filesystem Host](filesystem-host-boundary-v1.md) and [Editing session](editing-session-save-v1.md).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).
- Scope: Windows x64 per-user Electron/NSIS app, Stable/Beta updates and local/CI packaging. Publication requires an owner-authorized release and manual workflow dispatch from master; no separate environment approval is required after validation succeeds.

Desktop은 [ADR-0017](../adr/0017-bundled-client-and-official-ai.md)에 따라 앱에 들어 있는
UI를 `litzio://app/index.html`로 연다. custom scheme은 static UI 전용이며 문서 처리는
[공유 HTTP daemon](http-host-v1.md#desktop-bundled-origin-1150-⑤)에서만 수행한다.
브라우저는 계속 daemon HTTP UI를 쓴다. Electron storage의 현재 origin은 `litzio://app`이며
과거 origin 데이터의 migration/하위 호환은 제공하지 않는다. 인증은 #1145에 보류한다.

## 원격 Host (#1174 PR0~4 완료)

[ADR-0018](../adr/0018-desktop-remote-hosts.md)의 PR0~4(#1175~#1180)는 완료했다. Desktop 원격 등록·자동 연결/재연결·Host별 탐색기·탭·필터·비서 선택을 제공한다. 실제 Windows Desktop → Linux 연결은 미검증이며, 템플릿 갤러리 진입은 [템플릿 계약](document-templates-v1.md)의 로컬 전용 경계를 따른다.

## Shared daemon Desktop (#1142 PR3)

Desktop discovers only unrestricted local-mode records at the fixed loopback origin. Without a live record it starts the shipped CLI's `daemon run` through a private IPC pipe, using the PR2 lock/HTTP/asset path. A ready identity proves which generation it spawned. Actual Desktop exit disconnects that pipe and waits for matching record removal and child-process exit; parent death also disconnects the pipe. Other clients/jobs are not counted. A CLI-started daemon survives Desktop exit. Explicit start/reconnect reclaims only OS-proven dead/reused process identities, never an HTTP timeout.

### Close to tray (#1448)

Ordinary close hides the existing BrowserWindow without unloading its renderer or disconnecting
its daemon pipe. Unsaved edits, unapplied drafts and Undo remain in the same session; opening
from the native tray (열기 or double-click) or launching a second instance reveals that same
window. The tray uses the existing packaged brand icon and a native menu (열기 / 종료).
The first close displays a Windows balloon explaining background execution and the exit menu;
`backgroundNoticeShown` in the app profile's `preferences.json` records that it was shown.
The tooltip reports 백그라운드 실행 중 or 연결 끊김 from the existing local connection checks.
No task count, keep-daemon preference, idle exit, login startup or multiple windows are added.

Tray 종료 first warns that Desktop-owned local daemon work stops, while CLI-owned and remote
Hosts continue; cancelling preserves the app. Accepted exit uses the existing native unsaved-work
guard and window-all-closed daemon cleanup. A refused unload restores ordinary close-to-tray.
Update install, protected Host restart and reset also close for real after their existing guards.
A downloaded update never installs merely because the window is hidden; failure to confirm owned
daemon exit still cancels installation. Local reconnect remains manual and never replays writes.

The installation helper enumerates top-level Electron windows by process identity, including
hidden windows. It sends the private installation-exit intent (WM_APP 0x8148), then WM_CLOSE;
main lets that close through and reveals the window for any unsaved-work question. Pre-tray
builds ignore the new intent and still handle WM_CLOSE normally. A cancelled close blocks
removal without forcing a process exit. Windows query-session-end synchronously prevents the
OS query when the existing all-tab guard reports unsaved edits, unapplied drafts or pending
operations. Main then restores/focuses the hidden window and runs the native unsaved-work
confirmation. Keep editing preserves both the window and daemon and clears exit intent.
Close without saving can exit Desktop, but the already-cancelled OS query is not automatically
replayed; Windows may require the user to request logout again. Clean work does not defer the
query and closes through existing cleanup. Windows may show its blocking-app screen and users
may force termination. Actual session-end never prevents OS termination; it only attempts the
same owned-daemon cleanup even if Windows omits normal quit events. Parent IPC loss remains
the crash/forced-session fallback. No remote stop is sent.

The renderer reuses its existing restart/all-tab protection predicate and synchronizes only
the pending boolean on state transitions through trusted main-frame IPC before returning from
its layout commit. Main owns this in-memory observation, not document content. It defaults to
protected until the renderer is ready, and resets to protected during main-frame navigation or
renderer loss. Comparison writes also publish their pending transitions. Main can therefore
answer the native OS query synchronously without waiting for a renderer round trip. The real
beforeunload guard remains the second check; no document meaning or save behavior changes.

Verification: the existing in-memory main lifecycle tests cover hide/restore, one-time notice,
tray cancellation/exit, installation intent + close, session end, update failure and protected
Host restart/reset. Existing CLI subprocess coverage verifies Desktop-owned cleanup and CLI
survival. Windows unit partitions are run locally; packaged hide/Undo and tray-hidden uninstall
cases are updated for queue execution. Native tray visuals, actual Electron/NSIS removal and OS
logout acceptance are not established by unit ports; no packaged Desktop, Edge or fresh profile
is launched locally.

The existing single Desktop instance, native exit protection, folder picker and Explorer integration remain. Folder selection has no Root-registration step. Before granting Explorer capability, main asks the connected daemon to validate the supplied opened-root listing and pins it through existing `RootAccess`. IPC accepts only this window's main frame at the exact bundled `litzio://app` origin; navigation outside it is refused. Browser links leave through the system browser. The bridge exposes startup file/sample paths, not a second document write API.

The existing sidebar DropdownMenu offers **Open in browser** and **Stop daemon**. Stop always confirms that connected tabs and ongoing work will be interrupted, regardless of launcher. The existing NotificationCenter reports disconnection and offers **Reconnect**, which explicitly repeats discovery/spawn without reloading or discarding local editing state. A five-second health check detects loss; it does not restart anything. About settings reuse SettingsRow and a details disclosure for daemon state, URL, launcher and versions plus process/access/path diagnostics. Launcher labels are localized (Desktop / CLI (start) / CLI (run)); CLI status JSON retains `desktop` / `cli-start` / `cli-run`. The window mounts independently of daemon discovery/startup, including failure. Connecting/disconnected states and explicit Reconnect use the same NotificationCenter/Button. Initial Host work waits for successful connection. Product mismatch warns in that surface and retains the connection; protocol mismatch refuses. Both direct the user to restart through the CLI, without a Desktop restart button.

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md). PR3 did not modify the installer; the subsequent phase-2 gate is defined below.

### Update and removal daemon gate (#1164)

Before an approved update closes the window, Desktop checks for CLI daemons using the same
installed executable, across all channel namespaces. Such a daemon blocks installation with
matching-CLI stop / foreground Ctrl+C guidance; it is never automatically stopped. This preserves
ADR-0016 ownership without adding another confirmation/force-stop policy. A CLI daemon from
another installation can stay running. The final owned-daemon close waits for process exit as
well as record removal; a shutdown failure prevents `quitAndInstall`.

NSIS setup and removal replace electron-builder's image-name process termination with a shared
installation helper. Both binaries embed their own built helper, extract it to their temporary
`$PLUGINSDIR`, and run it with the installed exe as RunAsNode. They never depend on an installed
copy of the helper. In particular the first update from public `v0.0.2-beta.6` works even though
that in-process-Host version has no helper or Desktop-owned daemon. No stop check is skipped.
The installed helper remains available for diagnostics/tests. It compares canonical installed executable paths (including the CLI shim's junction), checks CLI ownership and OS
creation identity, then requests installation exit intent and `WM_CLOSE` only from windows (including hidden ones) of that installation (rechecking
path and creation identity before the request). The existing unsaved-work confirmation remains.
The helper excludes itself and requires all other processes using that executable to exit and
observed discovery/lock files to disappear before replacement/removal. It fails closed on a
helper execution failure, unknown CLI listener, cleanup failure or a window that stays open. Silent
removal uses the same gate. Optional CLI/PATH cleanup remains a separate best-effort operation.
The mandatory OS-query child uses SystemRoot matching its Windows executable; the parent and optional CLI cleanup keep their original environment and failures. There is no image-name kill, automatic restart, stale-record deletion or remote Host handling.
A same-installation CLI daemon in another channel blocks the operation without being stopped;
other installations/channels are untouched. A CLI daemon started concurrently after a check can
still block file replacement; there is no cross-process installation lock in this phase.

The existing Windows Stable/Beta update scenarios now assert old Desktop daemon process exit,
new generation/version, and preservation of a live opposite-channel daemon from another tree.
Beta also checks update refusal with a same-installation CLI daemon. The existing uninstall
scenario adds one representative live Desktop case plus CLI refusal and opposite-channel
survival, without multiplying startup across optional-CLI fault cases. That live uninstall case
removes the installed helper before removal, proving that the uninstaller uses its own payload. These exercise real
Electron/NSIS file locks and cannot be replaced with unit ports. The additional subprocess
lifetimes are logged in CI. NSIS shell relaunch does not inherit process-only state overrides,
so the update fixture uses the disposable account's default shared data directory, refuses an
existing directory and removes only the directory it created (the same ownership boundary as
its userData/PATH installation fixture). Other automated daemon tests use temporary overrides.
Local installation/package tests are explicitly prohibited for this
work, so their duration is measured by PR CI. Existing deadlines/assertions remain unchanged;
no retries or fixed sleeps were added. Unit tests cover ownership/refusal, record cleanup and
updater failure ordering; the existing CLI lifecycle test also checks actual process exit. One owned Node child verifies actual Windows junction identity (about 1.8s locally), which in-memory ports cannot establish. The existing packaged CLI-refusal probes launch through the real integration junction.

CI and release verification run one independent public-beta.6 starting case before the unit suite. It downloads the actual
GitHub Release installer and metadata, verifies each download's API size/SHA-256 plus the
metadata's installer SHA-512 and a pinned beta.6 installer SHA-256, and installs/launches that
unmodified binary. It builds only the candidate (the old version is never rebuilt), then
executes the same NSIS `--updated /S --force-run` transaction as electron-updater and checks
new app/daemon startup, file version, document/user-data/preferences/PATH preservation and
cleanup. It does not duplicate updater UI/dirty guards already covered by the existing cases.
The same-source Stable/Beta cases remain the proof for subsequent daemon-to-daemon updates.
The new case is CI-only (including installer download); its additional runtime is recorded in
the PR after execution. The existing same-source Stable/Beta commands remain unchanged. This is the
explicitly required first-release update path, not a general historical-data migration policy.

### PR3 plugin test exception

Baseline: [CI 41782696099](https://github.com/litzio/litzio/actions/runs/41782696099), head `ff2c2936ab4349d44c81919d6a3292e90be2395a`, measured from job steps and per-test log durations before exclusion.

| Job/scenario | Measured duration | PR3 treatment |
| --- | ---: | --- |
| Windows Desktop package/update job | 16m05s; packaged step 60s | All non-plugin package/update/uninstall assertions retained |
| packaged in-process Host forks shipped Docling worker | 5.669s | Only PR3 exclusion; restored in PR4 as daemon-owned worker/native comparison coverage |
| Browser docling-dashboard / plugin-ui | 42.0s / 9.3s | Retained |
| Browser docling-server / docling-compare | 50.4s / 21.0s | Retained |
| Browser docling-review / recovery / retry | 36.7s / 23.3s / 26.5s | Retained |
| Browser plugin-settings / assistant / assistant-result | 6.9s / 1.2m / 10.7s | Retained |
| Host close waits admitted workers / partial REST worker kill (Windows) | 1.681s / 6.316s | Retained; existing integration adapters now call HTTP |

Historical PR4 record (before #1150 ③): no fast unit tests or data-preservation assertions were excluded. Obsolete custom-protocol transport tests were removed with that implementation; shared HTTP tests retained CSP, path, revision, trash, template and plugin protections. Startup/sample behavior was covered at the bridge/client and sample copier boundaries. PR4 restored the only skip as `packaged daemon forks its shipped Docling worker and opens a complete native comparison`, checking a separate daemon PID/launcher, shipped worker, notices, native comparison and disable/re-registration. The exception **ended**; all required PR4 CI passing completed phase 1 and lifted this exception's release hold. #1150 ③ removes the plugin/Docling feature tests while preserving Desktop main/CLI notice assertions in the startup/sample smoke. Update/uninstall daemon integration remains phase 2.

PR4 extends existing cases instead of adding a scenario: the fake app-server HTTP
case detaches the sending connection and observes the same turn through another
connection until completion, without replay. The HTTP recovery case owns a real
production CLI daemon subprocess and stops/restarts it at the same origin via a native bridge
stand-in; it asserts unsaved input, Undo/Redo and Save without page reload. The
two subprocess starts are necessary to exercise actual daemon loss/reconnection;
the existing recovery case took 16.3s locally. Native
daemon ownership/IPC lifecycle remains covered by existing subprocess tests.
No paid AI, local packaging, install/update/uninstall or Edge is used. The UI
retains SettingsRow and translations, with no common UI exception.

Manual persistent-Chrome capture review (production controls, bridge stand-in):
[1440px](assets/desktop-daemon-lifetime-1142/status-1440.png) /
[640px](assets/desktop-daemon-lifetime-1142/status-640.png). The localized launcher
and address fit both widths. Existing Desktop browser assertions check English
and Korean labels; the CLI JSON protocol is unchanged.

## Open folders in File Explorer (#487)

The Desktop preload exposes `openFolderInExplorer` as the Host capability, plus
`setOpenedFolders` to synchronize the renderer's currently opened root paths. Vite and HTTP
expose neither, so their folder menus omit the action. Root and child-folder More actions menus
use **Open in File Explorer** / **파일 탐색기에서 열기**. This adds no folder context menu.

Main's existing trusted top-frame IPC wrapper protects both calls. Main verifies shared daemon root listings and registers eligible local roots; synchronization accepts only those registered
roots and closing a section removes it from the active set. Main reuses pinned `RootAccess`
validation for lexical containment, real-path containment and root identity, and requires an
existing local directory before passing its canonical path to `shell.openPath`. Files (including
executables), absent paths, outside paths, UNC/device paths and escaping junctions are refused.
An OS error string or a rejected call produces a localized Editor error notice.

Automated checks inject the OS opener and never start Explorer. Manual Windows acceptance:
open both a root and a child via their menus; delete a displayed folder and confirm the failure
notice. Actual Explorer execution is deliberately unverified locally. Packaging/update/install
boundaries are unchanged; their tests remain Windows CI responsibilities.


## File context actions (#505 / #504 PR A)

Desktop uses the same web context menu and dialogs as Vite/HTTP; Electron `Menu.popup` is not
used. `GET /api/host-capabilities` declares `fileDeletion: "trash"` for daemon clients and `"permanent"` for Vite. Paths and file
content continue through the shared Host transport, not a second IPC filesystem API. The daemon routes `/api/file` to the shared handler and uses its OS trash adapter after the same root/symlink/regular-file checks. An unavailable or failed trash adapter
returns an error and keeps the file; it never falls back to permanent deletion. Rename reuses the
same exclusive Host operation. Folder operations and reference rewriting remain out of scope.
See [filesystem operations](filesystem-host-boundary-v1.md#file-deletion-and-rename-505--504-pr-a)
and [session/focus behavior](editor-ux-shell-v1.md#file-context-menu-505--504-pr-a).

Shared HTTP tests cover injected trash success/failure and shared path validation. Packaged
Windows behavior remains a required CI check; no local package/install/update run is required
because packaging and update boundaries are unchanged.


## Optional command-line tools (#604)

The #1128 assistant launcher is separate from this optional integration. Before
Codex launch, the Host prepends an assistant-cwd private bin to that child PATH,
using the bundled CLI and Electron RunAsNode. It works while this setting is off;
no user/system PATH or registry is changed. Source Desktop instead uses the source
CLI with tsx. See [template operations](document-templates-v1.md#shared-host-operations-and-assistant-1128).
The existing packaged CLI CI exercises one template read through that launcher
before enabling the optional integration. Local packaging is not part of #1128 verification.


Settings exposes **Command-line tools (CLI)** only when the Desktop bridge exists. The initial
state is Off; neither setup nor update adds anything to PATH. Enabled reports Installed, while
missing or mismatched owned files, application target or PATH registration report Broken path.
Broken registrations offer Repair and Turn off. A conflicting external `litzio` command or an
unowned file is reported without overwriting it. Operations report failures and allow another try.
The UI follows existing Settings sections, controls and tokens, in Korean and English.

The per-user `%LOCALAPPDATA%\litzio\bin` directory contains a marked `litzio.cmd`, ownership
record and an owned `app` junction to the fixed installation folder. The ASCII shim uses relative
paths, disables delayed expansion, forwards `%*` directly, preserves standard streams and returns
the CLI exit code. It runs `app\Litzio.exe` with `ELECTRON_RUN_AS_NODE=1` and the existing
`resources\cli\cli.mjs` bundle. It neither invokes a second command interpreter with `call` nor
changes the console code page. Core/CLI document semantics remain unchanged.

Like the [Paseo reference shim](https://github.com/getpaseo/paseo/blob/main/packages/desktop/bin/paseo.cmd),
it passes `--disable-warning=DEP0040`: the existing markdown-it dependency loads built-in punycode,
whose deprecation Node suppresses in npm's `node_modules` context but reports under `resources/cli`.
Other warnings and errors remain visible. Remove this targeted option when the shared bundle no
longer loads built-in punycode. This changes neither the dependency nor document parsing behavior.

The common CLI's standalone `--version` prints `litzio <CLI package version> (<commit>)`;
Desktop's bundle prints `litzio <Desktop package version> (desktop, <commit>)`. Both are one
stdout line with exit code 0. Combining it with any other argument fails through the existing
argument-error path. Build metadata is injected as literals, never read from files at runtime.
The commit is the actual checkout's `git rev-parse --short=12 HEAD`; a build without Git uses
`unknown`. Unbuilt source/tsx execution explicitly reports `litzio development (unknown)`.

The existing CLI build and all its chunks/notices/assets are packaged outside ASAR as
`resources/cli`. Desktop and CLI `daemon run` both use its `editor/` production files: one build and one
copy, so their contents cannot drift. The standalone Node CLI/HTTP package is unchanged.

Only explicit enable/disable changes HKCU Environment PATH. The raw registry value and its
REG_SZ/REG_EXPAND_SZ kind are preserved, along with unrelated entries and ordering. Comparisons
expand environment variables and normalize Windows paths; edits do not rewrite unrelated text.
WM_SETTINGCHANGE notifies Explorer. The Settings hint tells users to open a new terminal.
Conflict checks include fresh user/machine PATH and the app's inherited PATH. No administrator
rights or machine PATH writes are used.
Fixed PowerShell code receives base64 UTF-8 JSON on stdin, never in argv. Long values, Unicode,
quotes and literal `%VAR%` expressions are preserved. The pre-write value/kind comparison detects
a stale snapshot; another process can still write between comparison and SetValue (not atomic).

Updates preserve the external integration and fixed installation target. NSIS actual uninstall
runs the same cleanup before removing application files; update's internal uninstall skips it.
Cleanup removes owned files/junctions and the integration's PATH entry, then removes the bin
directory with a nonrecursive `rmdir` if it is empty. A nonempty bin is preserved without error,
including user files and subdirectories. The parent `%LOCALAPPDATA%\litzio` stays: its creation
is not ownership-tracked and it also holds uninstall diagnostics. User data remains at
`%APPDATA%\litzio`, the updater cache at `%LOCALAPPDATA%\litzio-updater`, and the default
installation at `%LOCALAPPDATA%\Programs\litzio`; none is part of CLI directory cleanup. An uninstall
from another installation cannot remove a registration owned by the current one. Damaged ownership
or conflicting files do not prevent removing our bin's PATH entries; unverifiable files stay and
Settings reports Off with the remaining conflict after successful PATH removal. Registry failures
remain errors. Optional cleanup failure never aborts app removal, including `/S`: NSIS writes a
unique diagnostic under `%LOCALAPPDATA%\litzio\uninstall-logs` (TEMP fallback), with the bin path,
helper error and manual Environment Variables cleanup instructions. Interactive removal displays
a warning; silent removal logs it without waiting for input. This does not claim CLI cleanup
succeeded.

Actual removal explicitly deletes the app executable after the lifecycle and optional CLI helpers
finish, before electron-builder removes the tree and uninstall registration. A failed deletion
retries at 200ms intervals for at most 3 seconds (16 attempts including the first). A successful
DeleteFile whose image is still present is also retried. Continued failure exits with code 1 and
retains the installation tree and uninstall registration so removal can be retried; optional CLI
cleanup may already have completed. It does not schedule deletion at reboot or report success.
Every failed attempt records its attempt number, Win32 error and executable path in the NSIS
details and a UTF-16LE diagnostic in the same uninstall-logs directory (TEMP fallback), reusing
the optional CLI warning log when present. The final success-after-retries or failure is appended.
The original intermittent lock holder remains unknown (#1231); retries are product handling of
deletion failures, not a relaxation of the CI executable-removal assertion. Disposable Windows CI
holds a delete-denying handle after the helper warning, releasing it after the first logged failure
or retaining it through the retry limit, to check both outcomes without launching the app.

Moving an installation leaves a broken target;
Repair from the new app rebinds it after the same ownership/conflict checks.

Verification scope: scratch files and an injected environment boundary test state, conflict, repair,
failure and raw PATH preservation without changing the developer's registry. Persistent-browser
bridge mocks exercise the actual Settings UI at 1440px and 640px. Disposable Windows CI checks
the packaged Electron Node engines range, Desktop version identity, shim help/check JSON and exit-code parity with Node,
argument/pipe forwarding, `daemon run`, real enable/disable, update preservation and uninstall cleanup.
All selected Desktop package CI runs silent normal removal, user-file preservation and foreign-command failure, including long raw registry PATH preservation. Installation-sensitive, shared build input and unclassified changes run the full ten interactive/silent combinations, including damaged ownership, missing helper and environment failures. Isolated CLI integration and Windows environment tests retain state/conflict/raw PATH coverage on every product quality run.
Empty-bin removal and nonempty-bin preservation are checked for disable and uninstall. General update-target PR CI runs Beta install/update; sensitive or unclassified changes select an independent Stable job. Release verification runs Stable then Beta on the same Windows runner, retaining the precondition that no CLI bin directory exists before either run. Published beta.6 runs only in release verification; every release mode requires it and full removal before publication. Beta reports CLI ownership, IPC timeout and renderer callback faults as separate subtests sharing the installed fixture, followed by the dirty-document/Save/install preservation subtest. Full execution paths and conservative fallback are defined in the [CI path policy](../../CONTRIBUTING.md#verification-matrix) and `scripts/ci-execution-policy.mjs`; direct invocation defaults to full removal.
Manual acceptance still includes enabling in an installed app, running from a new terminal,
disabling, running after update and checking cleanup after removal. Local tests must not modify
the real user's PATH or registry; packaged Desktop/install tests run in CI for this work.
Long-running `daemon run`, actual console Ctrl+C and all `%`/`^`/`!` argument combinations remain manual.

Real Settings captures with a Desktop bridge mock: [1440px](../reviews/assets/desktop-cli-604/settings-1440.png)
and [640px](../reviews/assets/desktop-cli-604/settings-640.png). These show the Korean initial Off
state and existing Settings layout; the mock does not establish native registry/install behavior.

## Document templates (#936)

The Desktop protocol forwards its source/packaged `HostRun` to the shared [template catalog and creation routes](document-templates-v1.md#host-api-for-the-gallery-and-assistant). User templates use `hostPaths(run).templates`; default ko/en templates remain read-only bundled Markdown resources rather than startup copies. The protocol unit test covers an injected source checkout; packaged execution is CI-only.

## Native sample

The bundled [converter control design notes](../../apps/editor/samples/en/converter-control.md)
ship as Korean and English folders, each containing a canonical native `.md`, `assets/` and
`references.bib`. The current UI language selects the sample when the user chooses **Open sample
document** on the start screen or in Command center, including when an argument document is open.
Changing UI language does not translate or replace an already open document.

Desktop copies samples once into `userData/samples-<encoded-app-version>`. Same-version restarts preserve edits, extra files and directory identity. A different app version uses a new folder and leaves earlier versions untouched. Missing/corrupt files in an existing folder report unavailable; they are never silently replaced. Destination/ancestor/nested junctions remain refused.

Copying finishes in a generated sibling directory before rename installs it. An existing sample
is moved aside only after staging succeeds; a failed installation rename restores it. Recursive
cleanup checks paths and contents for links first. Actual preparation failures are logged and
carried to the Editor as a standing sample-unavailable warning, while an argument document or
empty startup remains usable. Both start screen and Command center omit unavailable sample paths.
Runtime copies use explicit `copyFileSync` reads for the document, bibliography and image in each
language folder. Electron 44.7's ASAR wrapper extracts a file for `cpSync`, so it cannot copy the
bundled language directories as directories. The first PR CI hit an installed-start timeout on that
path; the correction keeps the existing archive-safe file-copy behavior. The unit test compares
all bundled files against the copied folder, so a new sidecar also requires updating the copy list.
The older unrelated `sample` directory is untouched. The development Editor uses the same copier
with a worktree-local `tmp/sample-native-v1` destination; HTTP Host offers no sample.

The samples use only [Native document support](document-support-v1.md). There is no new semantic
operation or CLI command: CLI `check` and `format` use the existing Core contract. The original
`apps/editor/document/technical-document.md` remains a regression fixture, not the distributed sample.
Core read-model feature coverage and canonical round-trip live in the existing Editor browser-fixture
tests. Desktop first-document unit tests use OS temporary folders outside the repository for
preservation of same-version edits and added files, new-version copies, destination/ancestor/nested junction safety, copy failure
and rename rollback; Host/client tests check that sample problems do not block startup.
Existing browser Command center checks
cover the UI entry and live language selection. See [sample capture evidence](editor-ux-shell-v1.md#localized-feature-samples-528).

For #528, packaged Desktop, install/update/uninstall, Edge and fresh-profile probes are intentionally
not run locally by owner decision. The packaged regression expectations are updated for CI.

## Start-up document path Unicode (#287)

`firstDocument()`는 시작 `.md` 인자의 단독 UTF-16 surrogate를 `assertUnicode()`로 파일 접근·경로 정규화 전에 거부한다. 원본 경로 없이 거부 사유만 `userData/logs/desktop.log`에 기록하고 해당 인자를 건너뛰며, 다른 유효한 문서 인자가 없으면 문서 없이 시작하고 기존 sample 사본을 제공한다. 정상 한글·emoji·리터럴 U+FFFD 파일명은 허용한다([경로 계약](filesystem-host-boundary-v1.md#path-unicode)).

## Scope and completion

The Desktop shell lives in `apps/desktop` and loads its bundled production Editor at `litzio://app`, using the shared daemon only for HTTP Host APIs/media. The shipped CLI owns the document/asset Host handlers; Desktop has no in-process document Host. Core, File commit and CLI document operations do not change. There is no portable release, remote service, original-file autosave, cloud account or second editor state.

Completion requires the Windows installer, channel/state tests, packaged app and actual install/update regressions, the existing Core/CLI/Editor/browser checks, CI configuration and this documentation. Unsigned publication is restricted to exact `vX.Y.Z-beta.N` releases after these checks, with its signature status and possible Windows warnings disclosed. Authenticode credentials are prerequisites for signed releases and Stable publication. All publication requires owner authorization and actual master-only environment protection configured in GitHub; it does not require a second approval of the publish job. Real GitHub update delivery is distinct from the local feed checks.

The native window enforces a minimum width of **640px** (minimum height 480px), following [ADR-0010](../adr/0010-supported-viewport-and-input.md). Keyboard and pointer input are the supported interaction model. The packaged regression checks the native minimum size.

## App and Host

- App/product name: `Litzio`; App ID: `io.github.litzio.litzio`; updater cache: `%LOCALAPPDATA%\litzio-updater`; preferences/sample/logs: `%APPDATA%\litzio`. These official defaults come from [brand.ts](../../brand.ts); #859 intentionally starts new identities without migrating previous Beta data.
- Windows EXE, NSIS installer/uninstaller, shortcuts and runtime window use the [Litzio wing/document icon](app-icon-v1.md). Its SVG source and generated ICO are tracked together; this does not replace previously published Beta assets.
- The per-user one-click NSIS installer requires no separate Node.js/pnpm/browser installation. Uninstall keeps user data. The Host supplies the first valid existing `.md` command-line file, or start information with writable samples copied into user data on every app start. Without an accepted argument it supplies no default document; the Editor may still restore tabs. Startup priority and session protection follow [Editing session and Save](editing-session-save-v1.md#tab-navigation-memory-383); if no tabs open, the Editor shows its [start](editor-ux-shell-v1.md#start-without-a-document-174). The sample opens only when chosen, through the same Open path as any file. Opening another argument into an already running instance and OS file association are not implemented.
- Electron main owns window lifecycle, protocol, preferences and updater. The sandboxed, isolated renderer has no Node integration; its typed preload exposes only update/settings calls and a restart check. Host/Markdown/file writes never pass through this bridge.
- IPC accepts only the app's main frame. External navigation/new windows are denied; http(s) links open in the system browser. Static paths are confined to the production build, including symlinks. CSP permits own scripts, own/inline styles needed by the editor/KaTeX, and local/data/blob plus registered exact-origin images; no remote code or frames.

## Integrated Windows title bar (#605)

`BrowserWindow` uses `titleBarStyle: "hidden"` and a 39px `titleBarOverlay`, retaining native
minimize/maximize/close controls. Editor CSS reserves their actual Window Controls Overlay
geometry without a fixed button width; browser Hosts have no reservation. Header empty areas
use `app-region: drag`, interactive controls and shared portal popup/positioner/backdrop
boundaries `no-drag`. Menus preserve pointer input to other triggers; while
a menu is open, underlying shell headers temporarily use no-drag for outside dismissal. Full-screen Settings leaves only its 40px header draggable and retains
caption reservation at 640px. Native move/double-click maximize and
maximized inset behavior require Windows manual checks. Document tabs remain below TopBar.
The full-width title strip introduced by #647 and the Settings header keep their 40px total
height, including the 1px bottom separator. The native height is the content height:
`--layout-header-row` (2.5rem = 40px at the UI root size) minus `--border-width` (1px), not a
separate adjustable metric (#694). Changing either token requires updating the main-process
height; packaged CI compares it with the resolved CSS values. Native button widths, symbols,
commands and theme colors retain Electron behavior; the native painted/hit region ends one
pixel earlier, before the web border. CSS drag/no-drag and env-based width reservation stay
unchanged. Outline is below this strip after #647, including when docked.

Before #488 phase 0, Base UI could retain a 15px viewport gutter beside Settings. OS probes
showed that this area accepted solid canvas colors but clipped background images and fixed
DOM paint. #488 moved document scrolling below the header and keeps the body viewport locked;
Base UI respects that existing lock without reserving a root gutter. Both title strips now
span the full viewport. #694 adds no scroll-lock override, padding compensation or document
scroll change; its Windows pixel checks cover the integrated #488 behavior as well as the
native overlay correction. The earlier 13px sampled gutter interruption is historical evidence
in PR #696, not a remaining exception to the full-edge assertion.

The cause is established from Electron's [overlay height/color API](https://www.electronjs.org/docs/latest/api/base-window#winsettitlebaroverlayoptions-windows-linux)
and its pinned [WinFrameView layout](https://github.com/electron/electron/blob/v44.7.0/shell/browser/ui/views/win_frame_view.cc)
and [opaque caption background](https://github.com/electron/electron/blob/v44.7.0/shell/browser/ui/views/win_caption_button_container.cc):
the old height 40 covers y=39, where the web separator is painted. A DOM border reaching the
right edge (#636) does not establish that the line survives native composition.
The renderer title is the active filename followed by ` — Litzio`, or `Litzio` without a
document, for native taskbar/Alt+Tab identification as well as browser tabs. The existing
beforeunload/unsaved-work protection remains authoritative for native Close.

Layout test scope (#1009 F08) uses `LITZIO_TEST_LAYOUT_SCOPE`: only `representative` reduces combinations; local/unset and release retain all combinations below. Ordinary PRs retain light document/Settings pixels at 1440px Outline closed and 640px, actual maximize/restore with Settings open, and the old-overlay-height negative control (7 OS samples instead of 19). The native minimum size, Window Controls Overlay geometry, title/drag exclusion, theme propagation and saved-theme restart checks remain unconditional. Shell/global CSS/titlebar/window controls/Desktop/Electron inputs and unclassified paths select the full matrix through the separate `fullLayout` CI output; install/update lifecycle selection is independent. The pixel sampler and its tolerances are unchanged.

Packaged CI checks actual Window Controls Overlay visibility/geometry at 1440px and 640px,
control exclusion from drag and BrowserWindow title. It also uses Win32 `ClientToScreen` and
`System.Drawing.Graphics.CopyFromScreen` to sample the OS-composed separator below all three
caption buttons, in document/Settings, light/dark, 1440px with docked Outline open/closed,
640px, and maximized states, plus maximize/restore while Settings remains open. It checks
that Settings wheel input does not scroll the document behind it, and records the document
viewport/scroll and root/body geometry with every capture. A reference pixel outside the buttons checks screen-coordinate
alignment; a negative control restores the old 40px height on light Settings and must cover
the line before the fix is restored. Captures/measurements are uploaded as `desktop-caption-pixels`,
including failures. A missing foreground window, unavailable screen, or wrong reference color
fails the test rather than substituting renderer screenshots or skipping the assertion.
Both Settings and document captures must pass through the full caption edge, with no gutter
exclusion. JSON summaries record the root client gap and title-strip edge gap alongside all
pixel mismatches, so a future reserved gutter cannot silently become an allowed exception.
Local checks use persistent Chrome with
the bridge and representative caption-width geometry, including long filenames in Settings
and portal overlays over the wrapped header at 640×480; they do not launch packaged Desktop.
Manual checks still cover drag, native minimize/maximize/close hit targets (including hover
and press at the bottom edge), double-click maximize, non-default Windows display scaling,
rendered light/dark symbols and taskbar/Alt+Tab presentation. CI screen pixels do not establish
real-user Windows acceptance or all display-scale behavior.

## Log folder and process diagnostics (#712)

Settings → About & updates offers **Open log folder** / **로그 폴더 열기** only with
the Desktop bridge. It uses the existing small secondary Settings button, disables
while opening, and shows a localized failure notice with retry available. HTTP Host
and Vite have no such control. The no-argument `desktop:open-log-folder` IPC uses the
existing trusted main-frame check. Main creates `app.getPath("userData")/logs` recursively
if absent, then opens it through `shell.openPath`; renderer arguments never select a path.
Filesystem failures and nonempty OS error results reject the action. No Core/CLI changes.

The existing rotating `logs/desktop.log` writer records main `uncaughtException` and
default-mode `unhandledRejection` origins through Node's `uncaughtExceptionMonitor`.
It installs neither an `uncaughtException` nor an `unhandledRejection` handler, preventing
logging from swallowing a failure or changing Electron/Node's existing disposition.
The monitor also runs before existing exception handlers. This relies on the runtime's
default `throw` rejection mode; explicitly overriding it to `warn`/`none` is outside
this diagnostic guarantee. Only the origin is recorded, never the error/rejection
message, stack or value, which may contain document content or full paths.
See [Node's monitor contract](https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor).

`child-process-gone` records only type, reason and exitCode. `render-process-gone`
records reason and exitCode after normal startup as well as during the existing startup
failure path; startup dialogs and recovery behavior are unchanged. These are minimal
process-event records, not complete crash diagnosis. CrashReporter/minidumps, native
fatal signals and forced process termination are outside this change.

Verification: existing main-wiring tests cover trusted sender checks, fixed-path creation,
OS/filesystem failures, private-field exclusion and renderer exits after startup. A real
Node child-process check runs the registered monitor for both exception origins, proving
that default failures still reach stderr and exit with code 1. The existing `desktop-updates`
persistent-Chrome scenario covers bridge absence, no-argument calls, pending state and
failure/retry. Same-state English/Korean 1440×900 and 640×900 captures are retained locally
under `tmp/712/before` and `tmp/712/after`; these mock-bridge screenshots do not establish
Windows Explorer opening or native Desktop crash behavior. Packaged Windows checks run in CI.

## Appearance (#595)

Settings uses the same System / Light / Dark preference as the browser Editor, stored only
in the app profile's localStorage. The trusted main-frame bridge sets Electron
[`nativeTheme.themeSource`](https://www.electronjs.org/docs/latest/api/native-theme) and
returns `shouldUseDarkColors`; this controls native title bars and dialogs as well as the
renderer media query. Returning from an explicit theme to System resolves the native
answer before applying the final renderer theme. Live OS changes update System immediately.
The renderer passes resolved `canvas`, `surface-subtle` and `text` CSS roles to
`setWindowBackground`; main applies the canvas and titleBarOverlay background/symbol colors,
validates all three colors as strict `#rrggbb` and stores no theme or color preference.
The renderer uses a one-pixel browser canvas to interpret each opaque CSS role and read its
sRGB bytes as six-digit hex. This handles production minification (`#ffffff` → `#fff`)
without a second CSS color parser or changing tokens/design. Both bridge calls
use the existing sender check, and carry no document data.

Normally the hidden window appears once `ready-to-show` and the first themed background are
ready. Main starts a **15-second absolute startup deadline when the hidden window is created**,
before loading the renderer. It covers a missing first paint/`ready-to-show`, whether or not
appearance IPC arrives. First paint also starts the existing five-second appearance wait:
a local CSS/IPC cosmetic handshake requires no network. The earlier deadline wins; first paint
never restarts or extends the absolute deadline. Fifteen seconds allows ten seconds for initial
loading/first paint plus the existing five-second cosmetic allowance. These are bounded failure
allowances, not startup performance targets (the existing restart handshake also allows five
seconds). Normal readiness still reveals immediately without waiting for either deadline.
Timeout or a trusted appearance-handler failure
reveals the window and logs the cause. Main-frame `did-fail-load`, rejected `loadURL` or renderer
exit during hidden startup also reveal it and show an error dialog, even before `ready-to-show`.
The startup gate is consumed once and both timers are cancelled on normal readiness, fallback,
second-instance reveal or close. Late first paint/appearance signals and subsequent appearance changes
do not reveal a window the user hid. A second launch shows a hidden existing window, restores
it if minimized and focuses it. Initialization exceptions after `whenReady` are logged, shown
in an error dialog and terminate with exit code 1 rather than leave a windowless process.

The small external `theme-init.js` sets the renderer's initial theme and native
color scheme before the application bundle, without weakening the self-only script CSP.
Styles then own `color-scheme`. No window-background color literal is duplicated in main.
The packaged argument/Save/restart regression also checks explicit/System native source,
effective renderer/native agreement, background and profile restoration. This packaged
verification runs in CI; local checks use Desktop unit/type checks and the browser bridge
regression. Native OS theme-change automation is not claimed.

Main writes `starting <version>` to `userData/logs/desktop.log` before initialization and
retains the detailed `started` entry before window creation. A secondary process that loses
the single-instance lock exits before these entries. Failures before main/ready handling can
also precede file logging. Directory creation, rotation or append failure can prevent a log
file; these errors now go to stderr with the intended message instead of being silently
discarded. The #643 problem PC's missing folder was not attributable to a specific one of
these paths from available evidence; an appearance rejection itself happens after startup
logging. No alternate userData location or speculative filesystem repair is introduced.

## Channels and versions

The current source and public distribution is `0.0.2-beta.9`; see the [#1388 release record](../releases/v0.0.2-beta.9.md). Lightweight tag `v0.0.2-beta.9` points to master `b64eb436e66f3d9ec2d957b67e86d9f3b9a6a91f`. The first [unsigned-beta release run](https://github.com/litzio/litzio/actions/runs/42615141076) succeeded, including preflight, build, all four Editor browser shards and publication. The public prerelease includes Korean notes with the unsigned warning; asset sizes/API digests were checked directly and the orchestrator's anonymous HTTP 200 and matching installer SHA-512/SHA-256 evidence is recorded separately from actual installation/update, which remains unverified.

The preceding public distribution is `0.0.2-beta.8`; its [#1216 preparation record](../releases/v0.0.2-beta.8.md) is preserved. Earlier evidence is preserved in the [beta.7 record](../releases/v0.0.2-beta.7.md), [beta.6 record](../releases/v0.0.2-beta.6.md) and [beta.5 record](../releases/v0.0.2-beta.5.md). The public beta.4 was shipped as IeumDoc. The IeumDoc → Litzio rename changes app ID, installation and data paths: IeumDoc beta.4 cannot automatically update to Litzio. A fresh installation is required; old data, settings and recovery records are not migrated, per the [branding guide](../guides/branding.md).

The opt-in real GitHub harness targets the same-brand Litzio `0.0.2-beta.8 → 0.0.2-beta.9` pair. Beta.9 is now public, but the harness has not been run. Actual GitHub installation/update remains **not run and unverified** because this PC’s installed state must remain unchanged. This is separate from CI local-feed evidence.

An earlier public distribution was `0.0.2-beta.4`; Stable publication is deferred. See the [#758 release record](../releases/v0.0.2-beta.4.md) for the successful first release-workflow attempt, public assets and Korean Release body. Actual GitHub `0.0.2-beta.3 → 0.0.2-beta.4` installation/update is **not run and unverified** because this PC’s installed state must remain unchanged. Local-feed CI is separate evidence.

The preceding public distribution was `0.0.2-beta.3`. See the [#690 release record](../releases/v0.0.2-beta.3.md) for the successful first release-workflow attempt, public assets and Korean Release body. Actual GitHub `0.0.2-beta.2 → 0.0.2-beta.3` installation/update is **not run and unverified** because this PC’s installed state must remain unchanged. Local-feed CI is separate evidence.

An earlier public distribution was `0.0.2-beta.2`. See the [#659 release record](../releases/v0.0.2-beta.2.md) for the successful first release-workflow attempt, public assets and CI results. Actual GitHub `0.0.2-beta.1 → 0.0.2-beta.2` installation/update was not run by owner decision and remains unverified.

For the preceding #632 correction, the owner confirmed there were no existing users and approved correcting only the version. After verifying the new public assets, the two `0.1.0` Beta Releases/assets/remote tags were withdrawn; source commits and historical verification records remain. Downgrade protection and migration policy remain unchanged: an installed `0.1.0-beta.*` cannot automatically update down to `0.0.2-beta.1` and requires manual replacement. See the [#632 release record](../releases/v0.0.2-beta.1.md) for publication, withdrawal and the unverified actual GitHub installation/update boundary.

On first launch, an installed `X.Y.Z-beta.N` defaults to Beta and a Stable version defaults to Stable. A valid saved Stable/Beta choice always wins, including after installing a different version. Missing/damaged preferences or an invalid/missing channel fall back to the installed version's default. Preferences are persisted by temporary sibling/rename. Settings → About & updates shows installed version, channel, update status/actions and a Release notes link.

The withdrawn [0.1.0-beta.2 release record](../releases/v0.1.0-beta.2.md) preserves its publication, public asset hashes, CI and unverified actual GitHub beta.1→beta.2 delivery. The withdrawn [0.1.0-beta.1 release record](../releases/v0.1.0-beta.1.md) preserves its earlier actual GitHub 0.0.1-beta.4→0.1.0-beta.1 update evidence. These historical results do not verify the current release; earlier verification below also remains historical.

| Channel | Feed and offer | Release assets |
| --- | --- | --- |
| Stable | GitHub's latest full release; only a greater stable semver is offered | `latest.yml` |
| Beta | Newest Beta or Stable; only a greater semver is offered | Beta publishes `beta.yml`; a Stable release's `latest.yml` is the provider fallback |

Tags are exactly `vX.Y.Z` or `vX.Y.Z-beta.N`; tag, app/package version and update metadata must agree. Beta Releases have `prerelease=true`; Stable Releases have `prerelease=false`. Other prerelease channels are rejected. Setting the updater channel is followed by explicit `allowPrerelease` and `allowDowngrade=false`, because the library's channel setter enables downgrades. A Beta → Stable switch keeps an installed newer Beta until a newer Stable exists.

Before the first public release, local development versions can be reset. A previously installed `0.1.0` development build cannot update down to `0.0.1-beta.1`; replace that development installation manually without weakening downgrade protection. Beta publication may use the restricted unsigned mode; Stable publication requires signing. Both require matching tag/version/channel, verified assets and passing CI.

`generateUpdatesFilesForAllChannels=false` and explicit publish channels prevent a Beta from generating Stable metadata. Artifact validation refuses the other channel file. Channel changes during download/install are refused; late check results from a previous channel are ignored. A downloaded update stays ready until installation or a channel change makes it ineligible.

## Window close

Ordinary close preserves the live window in the [tray](#close-to-tray-1448). Actual exit retains
Electron's native **Close without saving / Keep editing** dialog. All-tab protection,
the distinction from single-tab Close and recovery retention follow the
[session protection contract](editing-session-save-v1.md#switching-and-recovery).

Client recovery uses IndexedDB at the bundled `litzio://app` origin in Electron's persistent
default session, under the app profile. The packaged regression checks identical `userData` and
`sessionData` paths across new app PIDs, actual forced termination and explicit app quit, and
record/Restore/Save/Reload/conflict preservation. It keeps its test profile and resets recovery
only at the beginning of each test, never between that test's restarts. The close-dialog response
is stubbed through the existing harness; native window lifecycle, protocol, storage and files are
real. See [Host recovery boundaries](editing-session-save-v1.md#host-persistence-verification-296-pr3)
for the last-successful-record and platform limits.

## Update lifecycle and work protection

- Check 15 seconds after launch, then every 6 hours; retry a failed check after 30 minutes. Manual Check for updates is immediate. Only one check is in flight; errors never block editing.
- Finding an update downloads nothing (`autoDownload=false`). Download update starts the real updater download and progress events. A verified download does not restart or install on ordinary quit (`autoInstallOnAppQuit=false`). Update discovery uses the Settings dot described below; About remains available.
- New-version discovery (#665): remove the top View / Later notification and its postponed-version preference. An unseen offered version displays one 8px interaction-accent dot on the bottom Settings icon, both in the expanded Sidebar and collapsed rail. The localized native tooltip names the version (`New version <version> available` / `새 버전 <version> 사용 가능`), and the button's accessible name adds new-version availability so color is not the only cue.
- Clicking Settings with the dot opens About & updates directly and highlights the update actions. Opening About by any route records the offered version as `seenUpdate` in Desktop preferences, including a new offer arriving while About is open. That version stays acknowledged after reload/restart; a newer offered version shows the dot again. A successful update no longer offers the installed version. There is no migration of the former Later setting. Without a dot, Settings continues to open Appearance & language. Download, installation consent and restart guards remain unchanged.
- Restart to update disables window input and asks the live Editor whether all tabs are safe, using the [session work-protection contract](editing-session-save-v1.md#save-shortcut-and-work-loss-protection-56). No user-input dialog is added inside the timed handshake.
- Missing/malformed answers, renderer failure or a 5-second timeout refuse and re-enable the window. The existing `beforeunload` remains a second check. `quitAndInstall(true, true)` runs only after the agreed window close; a close veto returns to the downloaded state. Updates never discard or save user work implicitly.

The [client recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns recording/deletion. Windows Desktop crash/profile persistence checks and remaining limits are recorded in [Host persistence verification](editing-session-save-v1.md#host-persistence-verification-296-pr3).

## Verification and signing

The direct-start packaged check identifies its root through the live launched ChildProcess and executable, then follows parent PID edges with consistent creation times. If a first-observed process's recorded parent PID now names a younger owned process, processes older than the root are excluded; processes created at or after the root are owned only with an executable under the launched app's directory, otherwise measurement fails with an ambiguous-ownership diagnostic. Confirmed live child identities (PID plus creation time) persist across the initial and final samples and each sample's enumerations, even if their parent exits or its PID is reused. Collection is asynchronous so the original process handle's exit remains observable. Root and sampled listener identities are confirmed after TCP enumeration; missing/reused identities fail measurement. Both samples assert the expected loopback daemon listener, with ownership identity checked. The process/TCP/process sequence is not atomic, cannot reconstruct all unobserved ancestry, and does not assert updater/installer leftovers after exit. CI can encounter ambiguous ownership if an external/unknown image meets these conditions; it must fail rather than omit that process. See [Windows Desktop regression](../test/README.md#windows-desktop-regression) for the #491 ownership regression and diagnostic fields.

The updater uses its own SHA-512 download verification. A signed release build additionally uses the public `NsisUpdater.verifyUpdateCodeSignature` hook for strict Windows Authenticode verification: status must be Valid and the publisher must match `app-update.yml`; missing tools/errors refuse the update. It repeats that check before marking the download installable, including cache reuse (6.x skips the fresh-download signature hook for a cached file). Unsigned Betas do not enable this publisher-signature check. Code-signing secrets are supplied only by the release environment, never source/logs.

electron-updater 6.8.9 does not use a detached signature for `latest.yml`/`beta.yml`. The unsigned Beta relies on GitHub HTTPS/release access control and version/channel/hash validation; a checksum alone does not authenticate a publisher. Signed releases additionally validate the installer publisher signature. Local test feeds do not establish real GitHub delivery or SmartScreen reputation.

## Build and release procedure

Development and package/test commands, the CI jobs, signing setup and the publication boundary are documented in [Contributing](../../CONTRIBUTING.md) and [Verification](../test/README.md). Packaging removes its generated output first so test feeds, versions and old channel files cannot survive into a normal build. No build command publishes.

PR/merge-group/push CI builds and tests unsigned packages and cannot publish. It does not upload development installers. Package creation, release-asset verification, packaged regressions and policy-selected install/update/uninstall checks remain required. Failure artifacts retain only packaged `profiles/*/logs/desktop.log*`, `recovery-proof.json`, `reset-proof.json`, update test `v*/latest.yml` and `v*/beta.yml`, uninstall `*-dialogs.txt`/`*-cleanup.txt` and durable `%LOCALAPPDATA%\litzio\uninstall-logs\*.tmp` diagnostics for 7 days. The latter use a separate `desktop-uninstall-logs` artifact with a path selected from `brand.ts`, because Windows runner user logs and the checkout can be on different drives. Execution logs and direct-start measurements remain in Actions logs. Diagnostic uploads exclude executables, blockmaps and whole installation, browser-profile or cache trees. Small native caption evidence remains available on success or failure for 7 days.

The manual workflow runs only from master and defaults to `verify`. Its `desktop-release` artifact retains the installer, blockmap, channel manifests and `win-unpacked/` for 14 days because publication downloads and revalidates them. Release assets, global retention, queue concurrency and CI execution/success policy are unchanged by the ordinary-CI upload policy. `unsigned-beta` publishes only exact Beta tags; `signed` retains mandatory credentials, forceCodeSigning and strict publisher verification for Stable or Beta.

Every release mode reruns the full Editor browser regressions on the validated tag commit in eight Linux shards (`pnpm browser:test --shard=N/8`), without reusing PR/push CI results. The browser job matches CI's Playwright container, pinned Chromium installation, browser cache and Korean font check, with a 35-minute timeout per shard. `fail-fast: false` lets the remaining shards finish; failed shards retain Vite server logs and browser diagnostics in separate artifacts. The Windows job runs the workspace tests, actual Electron packaged regressions and both Stable/Beta NSIS install/update tests before producing a clean package. Publication uses `needs: [preflight, browser, build]` and the default success condition: all browser shards and the Windows build must succeed; a failure or cancellation prevents publication. This avoids the observed Windows Vite browser-runner `ERR_NO_BUFFER_SPACE` failure without omitting browser scenarios or accepting network errors.

Preflight executes the controller from the dispatch master SHA before installing dependencies or running tag code. It validates the mode and canonical tag, requires an existing local/remote tag and matching Desktop package version, proves the peeled tag commit is an ancestor of that trusted SHA, then builds that immutable commit. Publication reruns preflight from the trusted controller and checks the remote tag immediately before activation. Tag, package, installer/app PE FileVersion and metadata agree. The pinned builder recomputes the installer blockmap; metadata names one installer with its exact size/SHA-512. Other-channel metadata and test-host configurations are refused.

Only the publication job has `contents: write`; it uses `desktop-release`. On 2026-10-28 the owner requested removing the separate manual publish approval. The required reviewer was removed through the GitHub API; read-back confirmed no reviewer or wait timer and exactly one custom deployment branch policy allowing branch `master`. Owner authorization and manual dispatch from master remain required; successful preflight, browser and build jobs lead directly to publication. This setting change does not alter PR review, app download/install consent or signed-release requirements. Maintainers must recheck the actual environment rules before subsequent publication. Signed mode additionally needs signing secrets, which remain unconfigured.

Historically, the environment required reviewer `<owner>` with self-review and administrator bypass allowed from 2026-10-12. The 0.1.0-beta.2 publication used the owner's explicit request for agent approval before that reviewer rule was removed. The [release record](../releases/v0.1.0-beta.2.md) preserves that sequence.

The authenticated, paginated release list includes Drafts; any existing same-tag Release is refused. A new Draft is created with the correct prerelease/latest policy, and its returned ID is used for uploads and reads. Only installer, blockmap and the correct channel manifest are uploaded. The exact asset set, uploaded state, size and server SHA-256 must match before the final activation request. Beta always has `prerelease=true` and `latest=false`, with `beta.yml` only. Assets are never clobbered. Pre-activation failures leave a Draft for operator review. A lost response to the final activation request cannot establish whether GitHub applied it; the script reports the Release ID and requires confirmation, without automatic retry/delete.

The first beta.1 was published by the earlier CI-artifact procedure. Subsequent releases use this workflow. See [Contributing](../../CONTRIBUTING.md#windows-desktop-builds-and-releases) for the approval/tag/verification/publication sequence and [beta.2 notes](../releases/v0.0.1-beta.2.md) for publication and verification evidence.

## Stable not yet published

`IeumGitHubProvider` is a small adapter over pinned electron-updater 6.8.9's GitHubProvider. The provider wraps the structured HTTP error from latest-full lookup twice and loses its status; matching every 404 or parsing the wrapped error text is unsafe. The adapter observes the existing requests, without extra API polling. A valid empty Atom feed, or a valid Beta-only repository feed together with 404 at the exact latest-full endpoint, establishes absence. Public github.com returned 406 for this JSON endpoint when only beta.1 was public (confirmed during preparation on 2026-10-12); that status is accepted only at github.com with the same Beta-only evidence. Feed/asset 404s, a latest failure with Stable in the feed, malformed feeds, missing/corrupt metadata and other network failures remain errors.

GitHub's Atom feed also lists non-release tags: the feed inspected during preparation included `archive/*` spikes in addition to public beta.1. Like the library's Beta selector, the adapter ignores non-semver tags, but requires at least one canonical Beta version and no Stable version for the latest-endpoint absence classification. Malformed links, another repository or unrecognized version channels remain errors.

Stable absence yields `no-stable-release`, displayed as **No Stable release has been published yet.** It uses the normal 6-hour interval, keeps the Editor/Settings usable, and permits Beta selection/manual checks. The adapter resets evidence on each check so the first Stable publication resumes normal selection. The existing generation guard discards late results after channel changes. The library still owns selection, metadata parsing, checksum/download and signature handling; downgrade policy is unchanged.

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

## References

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder v26 updates](https://www.electron.build/v26/docs/features/auto-update/) (the current default site documents unreleased v27 APIs; this app uses 26.15.3 / updater 6.8.9)
- [v26 release channels](https://www.electron.build/v26/docs/tutorials/release-using-channels/)
- [Paseo updates UX](https://paseo.sh/docs/updates) (reference only; staged rollouts are excluded)


## Settings update cue verification (#665)

This changes only Desktop notification preferences and Editor interactions; Core document semantics
and CLI operations are unaffected. Unit coverage checks bilingual accessible cues in both Sidebar
states, preference persistence and trusted/current-offer IPC acknowledgement. The mock-bridge browser
scenario checks acknowledgement, reload, a newer version, direct About navigation, highlight and
existing download/restart work protection. Packaged/install/update/uninstall execution is CI-only.

Same-state 1440px and 640px English/dark captures compare the former banner with the Settings dot:

| Width | Before | After |
| --- | --- | --- |
| 1440px | [banner](assets/update-dot-665/before-en-dark-1440.png) | [dot](assets/update-dot-665/after-en-dark-1440.png) |
| 640px | [banner](assets/update-dot-665/before-en-dark-640.png) | [dot](assets/update-dot-665/after-en-dark-640.png) |

Additional states: [640px rail](assets/update-dot-665/after-en-dark-640-rail.png),
[640px About highlight](assets/update-dot-665/about-en-dark-640.png).

The complementary Korean/light states show [1440px](assets/update-dot-665/after-ko-light-1440.png),
[640px](assets/update-dot-665/after-ko-light-640.png) and the
[direct About highlight](assets/update-dot-665/about-ko-light-640.png).

Local verification (2026-10-28): Editor 331 and Desktop 68 unit tests passed, workspace typecheck,
Editor production build, docs check, desktop-updates, layout-rules and quiet-document passed.
The browser used this checkout's persistent Chrome profile. BadPasswordAttempts checks were
0 before the first launch, then 1, 3, 4 and 5 after the final run; no further browser run was
started at 5. The dedicated 5365 Vite server and owned browser context were closed. Packaged
Desktop, installer/update/uninstall, Edge and fresh-profile probes were not run locally.

## Brand-independent release checks (#859 review)

Alternate-brand builds and simultaneous installation are no longer checked in CI (#1000, owner decision 2026-11-03). Official Litzio packaging, Stable/Beta install/update and uninstall checks remain unchanged.

The release verifier emits its validated installer, blockmap, current configured channel manifest and unpacked application as the workflow artifact paths, after executable/signature/blockmap verification. The publish job downloads that same layout and revalidates it. Custom channel names are retained without collecting unverified YAML files.

## Third-party notices (#1076)

The main esbuild input graph supplies `build/app/THIRD_PARTY_LICENSES.txt`, packaged inside `resources/app.asar`. The existing shared CLI copy carries `resources/cli/THIRD_PARTY_LICENSES.txt` and `editor/licenses/` (including the notice index). Electron/Chromium and existing font/component notices remain separate. The existing packaged startup/sample smoke checks the main archive's electron-updater version and Loopline copyright and the CLI's Tiptap notice. These original assertions remain unchanged when moving them out of the removed Docling smoke; only the removed worker/schema checks are dropped. HTTP package tests separately check the Editor-served notices. Editor public notices remain transitive Desktop build inputs in the existing CI scope policy (alone they retain `update=false`; mixed with an update target they select full lifecycle coverage). No new installation or update behavior is introduced.

## Connection and sample messages (#1156, #1157)

Desktop connection notices reuse NotificationCenter, ghost/sm Reconnect and native
Details disclosure. The persistent text identifies the local daemon, its last verified
address when available, and manual reconnect / matching CLI stop-and-start guidance.
Protocol mismatch, unreachable/incompatible daemon and startup failure have localized
explanations; unknown failures keep a neutral connection explanation. Electron IPC
wrappers and original errors appear only inside collapsed Details. Product-version
warnings retain their existing nonblocking behavior.

Start-screen and opened-sample guidance in Desktop describes same-version restart
preservation and new folders only on app-version changes. Browser Host reset guidance
is unchanged. No sample preparation or document write behavior changes.

Manual visual review (browser Editor with native bridge stand-in, not packaged Electron):
[1440px English](assets/desktop-messages-1156/messages-en-1440.png),
[640px English](assets/desktop-messages-1156/messages-en-640.png),
[1440px Korean Dark](assets/desktop-messages-1156/messages-ko-dark-1440.png),
[640px Korean Dark](assets/desktop-messages-1156/messages-ko-dark-640.png).
The collapsed diagnostic, address, wrapping and Reconnect fit at both supported widths.
The [manual capture script](assets/desktop-messages-1156/capture.browser.js) reuses the
Desktop bridge scenario; to rerun, copy it to `apps/editor/test/messages-capture.browser.js`,
temporarily include that name in the runner's notification/screenshot allowlists, then run
`pnpm browser:test messages-capture --screenshots`. It is not a CI capture sweep.
Before: [#1150 disconnected 640px](assets/desktop-bundled-1150/disconnected-640.png).

## Desktop-local remote registry (#1174 PR3a)

`apps/editor/server/remote-host-registry.ts` owns the shared local operations used by CLI and
Desktop Settings → Hosts. The JSON array at `<LITZIO_DATA_DIR or ~/.litzio>/desktop/remote-hosts.json`
stores immutable UUID hostId, normalized HTTP(S) origin and editable label. Duplicate normalized
origins, credentials, paths, query/fragment and CSP source syntax are rejected. Validation checks
both input and normalized origin, including URL-decoded and Unicode-mapped host characters. Address changes
require new registration. An exclusive sibling lock prevents concurrent lost updates; an atomic
sibling rename commits the list. Invalid stored data fails explicitly; no migration is provided.

Desktop main takes an origin snapshot at startup for connect/img CSP. Scripts remain bundled;
saving a registration requires a protected restart before the renderer can use it. CLI health
probes have no renderer privileges and never change this snapshot or restart the app. The CLI
reports its own observation, never the current window connection state. Protocol differences
refuse connection; product differences warn. Redirects are refused and probes are bounded.

Removal uses the shared operation after the user closes Host work, resolves all Host recovery
records and confirms the native removal dialog. Settings disables other document operations
while it checks live recovery and removes the registration. The Host list offers a Close Host work
action using the existing Save / Don't save / Cancel protection, one tab at a time.

Desktop writes per-hostId open-work/recovery counts to one file per profile **and process run** under
`remote-hosts.json.work/<profile-hash>.<pid>.<encoded-process-start>.json`. The profile key is the
normalized absolute Electron userData path's SHA-256 hash (case-folded on Windows). Startup first
creates the new run's unknown summary exclusively (`wx`), without replacing a previous run's file.
It then removes only its own profile's dead-run entries, using PID/OS creation identity from their
names. Cleanup failure retains the old entry and logs the problem. Other profiles and live runs
are untouched. Summary updates use a temporary sibling and rename of only the current run's file;
a sharing violation cannot hide the already-published live owner. Summary writes never acquire
the registry lock. Interrupted temporary siblings are not committed summaries or locks.

If even the new run's entry cannot be created, Desktop still opens and warns in Hosts settings
and logs that CLI removal protection could not be recorded; CLI removal can then miss this run.
If the registry is unreadable, startup logs it and uses only the local Host in the fixed CSP snapshot;
settings/CLI can report the registry error without preventing Desktop startup.
Registration mutations serialize writes with an owner PID/creation-time lock. Stale locks are
never automatically reclaimed: a dead owner or reused PID refuses with the exact lock path and
instructions to inspect it, delete it after verification, then retry. This avoids concurrent reclamation.
CLI removal examines every owner: any matching live PID/creation identity, unknown summary,
unreadable/damaged entry or target Host work/recovery refuses. The existing daemon `processStart`
observation distinguishes a dead process or reused PID from a live owner; query failure refuses.
Dead entries retain target Host work/recovery protection until that profile next starts; CLI does
not delete them. A dead entry without target work/recovery may pass. There is no migration.
Settings performs the same cross-profile check, allowing only its own live process after its
existing work/recovery/confirmation guard. Other running profiles must quit; their remaining work
or recovery must be resolved in those profiles before removal can succeed.
This is a local safety summary, not a remote registry or audit ledger. Removal never sends stop
or mutates remote files. Local daemon lifetime and OS shell restrictions remain.

Settings lists registered origins, editable labels, connection state, failure details and product
version warnings. New registration is saved first and explicitly marked unavailable in the current
window until restart. Restart uses the existing synchronous all-tab unsaved/draft/busy check with
native input disabled during the handshake; a late unload refusal cancels restart. Only after the
window closes does main relaunch, taking a new CSP snapshot.

Applied registered Hosts connect independently at startup. Read-only health/capability checks
repeat five seconds after each observation, also retrying failed connections. Protocol mismatch
refuses every attempt; a product difference warns. Requests have bounded timeouts, redirects
are refused, and no document write is replayed. Removing a registration invalidates its client.
The remote monitor has no daemon start/stop control.

Verification (2026-11-05): isolated registry/CLI and main IPC tests, Host runtime tests, and
`pnpm browser:test host-settings --screenshots` with a native bridge stand-in. Captures:
`tmp/host-settings-1440.png`, `tmp/host-settings-640.png`; shared Settings/Input/Button/Notice
patterns are reused without a new surface. These do not prove packaged Windows → Linux
connectivity or the actual native app relaunch.

### Host removal failure guidance (#1196)

Settings → Hosts uses the existing error Notice to ask users to close Host work and resolve
recovery records before retrying a refused removal. IPC validation/transport exceptions
are not displayed verbatim. Removal still requires the main-process work/recovery proof
and native confirmation. Recovery records without a Host identity are ignored without
conversion or deletion, as defined in [Editing session and Save](editing-session-save-v1.md).
