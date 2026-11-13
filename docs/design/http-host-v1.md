# HTTP Host v1

> 2026-11-13 (#1592): OneDrive·Jira 실험 플러그인을 삭제했다. 현재 공식 공급은 없고 지정 커뮤니티 공급은 Docling만 남는다. 보관: `archive/plugins-declarative-2026-11-13` 브랜치, `archive/2026-11-13-plugins-declarative` 태그. 아래 두 플러그인의 구현·검증·화면 기록은 삭제 전의 역사이며 현재 제공 기능이 아니다. 설정·Windows secret·하위 프로세스·reload·공용 작업·화면 코드·npm·번들러는 유지한다. Docling과 선언형 문법의 제거는 별도 단계다.

#1285: [앱 초기화](app-reset-v1.md)의 local apply는 실행 중인 Host를 강제 종료하거나 원격 삭제 API로 노출하지 않는다. HTTP/Vite Host와 CLI가 계정 공용 process gate에 참여해 데이터 삭제와 새 writer 시작을 배타 제어한다. `GET /api/app-reset/paths`는 runtime이 고정한 절대 templates·assistant cwd·설정 파일 경로만 반환하며 Desktop은 자신의 해석과 대조한다. Host close는 listener/socket 종료뿐 아니라 이미 수락한 비동기 request handler의 완료도 기다린 뒤 writer lease를 해제하고, 반복 close는 같은 종료 promise를 반환한다. Vite는 문서·asset middleware의 SSR module loading부터 promise를 추적하며 종료 중 새 Host 서비스 생성을 거부한다. `server.close()`는 그 정리도 기다리고 내부 restart의 listener 종료 이벤트 역시 같은 drain 후에만 lease를 해제한다. socket 종료를 파일 변경 취소로 간주하지 않는다. 종료 실패는 marker로 남아 확인 없이 초기화하지 못하게 한다. 일반 클라이언트 단절이 Host/AI 수명을 끝내는 것으로 취급하지 않는다.

#1150 ③ (2026-11-04): AI는 daemon 공식 기능이며 Settings → AI agent에서 관리한다. 공통 Button·SettingsSelect·Dialog와 기존 설정 화면 배치를 재사용한다. 당시 구 플러그인 등록/관리/기여 탭·Docling을 제거했다. 현재 재개한 플러그인은 아래 Plugin stage 1 절을 따른다. 구 플러그인·Docling 관련 과거 캡처/검증 서술은 현재 기능이 아니며 [보관 소스](https://github.com/litzio/litzio/tree/archive/plugins-docling-2026-11) (`ce90560a`)의 기록이다. 현재 AI 계약은 [Main agent](main-agent-v1.md), 결정은 [ADR-0017](../adr/0017-bundled-client-and-official-ai.md)을 따른다. ④ Host 클라이언트와 ⑤ Desktop 번들 origin은 아래 경계를 구현한다.

- Status: Implemented
- Run-as verification: 2026-11-05 — #1199 Windows Host health/capability·CLI lifecycle and two-Host persistent Chrome fixture; 1440px/640px footer captures. Actual Windows Desktop to Linux connection remains unverified.
- Last verified: 2026-11-06 — #1247 ADR-0020·문서 색인·플러그인 subprocess/secret/제작 및 공통 뷰 코드를 정적 대조. 제품 실행 재검증 없음. 이전 2026-11-05 — master 303e9a1의 Host 등록·탭·비서·템플릿 진입 코드를 정적 대조. 문서 검사 수행; 실제 원격 연결·제품 실행은 재검증하지 않음.
- Remote registration PR3a verification: 2026-11-05 — temporary-path registry/CLI, exact CSP and health preflight tests; production HTTP persistent Chrome recovery/Save/Reload/conflict (2 passed). Settings/protected restart and live Windows Desktop → Linux remote connection remain unverified and outside PR3a.
- Daemon verification: 2026-11-04 (#1142 PR2: Windows CLI concurrent start/stop, Host/Origin boundaries and production browser Save/Reload/conflict; Linux remains required CI).
- CI artifact policy verification: 2026-10-30 (#808; tarball upload removed, screen evidence retained on failure; workflow policy regressions and docs check, no local HTTP/browser execution).
- Documentation verification: 2026-10-26 (pathless Host response versus Editor startup/restoration compared with document-api.ts, App.tsx and the session contract; no new HTTP/browser execution).
- Previous execution verification: 2026-10-16 (#296 PR3: Windows production Host with actual Chrome process crashes, same-profile/origin restart, local Restore, real Save/Reload and external 409 preservation; HTTP boundary tests. Linux execution remains required CI).
- Previous verification: 2026-10-15 (ADR-0006 route/validation cleanup by code/test comparison; no runtime regressions rerun). Previous verification: 2026-10-13 (real TCP boundaries, packaged Node-only execution and production browser Save/Reload; Windows/Linux package and browser checks are required in CI).
- Authority: [ADR-0005](../adr/0005-http-host.md), [Filesystem Host boundary](filesystem-host-boundary-v1.md), [Editing session and Save](editing-session-save-v1.md).
- Scope: local daemon and manual remote single-operator HTTP Editor with optional Root limits ([#186](https://github.com/litzio/litzio/issues/186)).

## Assistant provider approvals (#1536)

The existing assistant conversations answer operation (HTTP and CLI) also responds
to blocking Codex command/file approvals, MCP elicitation and Copilot ACP permission
requests. It returns the provider decision/option ID once, using the existing
conversation question records. Permission records expose approval:true for direct
allow/session-allow/reject buttons; the answer operation and duplicate prevention
are unchanged. General question forms keep their existing submit flow. Restricted Codex modes use on-request; Full access
uses never. Copilot restricted out-of-scope and shell requests wait for the same
cards instead of automatic rejection. The inbound RPC owns the wait; turn end,
request resolution, interruption and disconnect expire it without a new timeout.
The shared Host question tool also supports Copilot over its HTTP MCP connection;
there is no native ACP interactive-question extension in the current SDK.

Full access document/review Host tools can address paths outside opened folders
but still obey this Host's fixed --root policy. Restricted Host tools retain their
folder boundary and explain how the user can open the folder or select Full access.
File revision checks, plugin secret/private-write restrictions and explicit
Host selection are unchanged. See [Main agent](main-agent-v1.md#권한-모드).

## Copilot MCP transport (#1500)

The existing HTTP listener routes `/api/assistant/mcp/<random-session-token>` to the
official assistant's SDK Streamable HTTP transport (JSON responses, no persistent
MCP session store or second listener). ACP receives the Host socket's local address,
not a client-supplied origin. ACP receives an explicit Origin header for that endpoint; MCP POSTs pass the existing Host/Origin gate with no policy exception. A regression uses real startHttpHost, an active fake-ACP turn and the official SDK client with those supplied headers to discover tools and read a document; missing/foreign Origins remain refused. Each token selects only one Host-owned conversation and its current turn
state; tool inputs cannot grant folders or permissions. Tool discovery is available
during session setup, while execution requires the matching active turn. Completion, failure and cancellation clear turn authority; the endpoint remains idle until another admitted turn supplies its own scope. Tokens are revoked on session creation/load failure, deletion, disconnect and shutdown. A session loads once per CLI process and gets a new endpoint after restart (#1521). Existing HTTP Host/Origin checks remain;
this capability is not daemon authentication. See [Main agent](main-agent-v1.md#문서-도구와-이미지)
for tool transport; shared question cards are supported, native ACP question extensions are not.

## Host별 클라이언트 경계 (#1174 PR2)

로컬 재연결로 origin이 바뀌면 기존 세션·receipt의 후속 요청(저장·rollback·비서·템플릿)은 전송 전에 명시적으로 거부한다. 새 작업만 새 client를 얻으며 같은 origin으로 다시 연결한 경우에는 기존 세션을 유지한다. 이미 전송한 요청은 재전송하지 않는다.

클라이언트는 hostId별 독립 HTTP 인스턴스·연결 관측·capability를 가진다. 알 수 없는 hostId는 거부하며 로컬 Host로 대체하지 않는다. 문서 세션의 open/save/source/bibliography/Figure 검증, 이미지 생성·선택·rollback과 상대 media URL은 시작한 Host의 client를 유지한다. 늦은 capability 응답은 새 관측을 덮지 않으며 다른 Host의 연결을 기다리지 않는다. 쓰기는 실패·응답 유실 시 자동 재전송하지 않는다.

운영 목록은 로컬 Host와 Desktop에 등록한 원격 Host를 포함한다. 주입 가능한 registry와 두 독립 HTTP fixture로 같은 경로의 요청 격리·중단·늦은 응답을 검증한다. 원격 등록·자동 재연결·CSP는 PR3, 여러 Host의 화면 통합은 PR4에서 구현했다. Core·공식 저장 경로·상대 URI는 변경하지 않는다.


## 원격 Host (#1174 PR0~4 완료)

[ADR-0018](../adr/0018-desktop-remote-hosts.md)의 PR0~4(#1175~#1180)는 완료했다. Desktop 원격 등록·자동 연결/재연결·Host별 탐색기·탭·필터·비서 선택을 제공한다. 실제 Windows Desktop → Linux 연결은 미검증이며, 템플릿 갤러리 진입은 [템플릿 계약](document-templates-v1.md)의 로컬 전용 경계를 따른다.

## Editor Host client (#1150 ④)

Editor의 API 요청(문서·폴더·복구·템플릿·공식 AI와 폴링)과 Figure·일반 Markdown 이미지·파일 미리보기의 Host URL은 `src/host-client.ts`를 거친다. 브라우저 대상은 `/`로 같은 serving origin이며 Desktop은 main이 확인한 로컬 daemon URL을 대상 주소로 설정한다. UI bundle의 `BASE_URL`을 Host 주소로 사용하지 않는다. `createHostClient(base)`가 요청과 렌더링 URL에 같은 Host 기준 주소를 적용한다. 문서 상대 URI는 렌더링 때만 해석하며 Core·디스크·직렬화에는 Host 절대 주소를 저장하지 않는다. 외부 HTTP(S) 이미지 URI는 그대로 유지한다.

Desktop bridge의 daemon 수명·연결 정보·OS shell 호출은 HTTP로 옮기지 않는다. Desktop 번들 UI와 daemon origin 전환은 아래 ⑤ 계약을 따른다.

## Desktop remote registration (#1174 PR3a)

PR3b verification (2026-11-05): Host runtime protocol/product policy and automatic reconnect,
isolated CLI removal and main IPC protection tests, Settings and update-restart browser scenarios
passed. The browser used a native bridge stand-in and the checkout-owned server at port 5187;
packaged Windows to Linux connectivity remains unverified.

Desktop main reads the Desktop-local registry once at startup. Its CSP allows the local daemon
and registered exact HTTP(S) origins for connect/img; script remains app-only. Registration never
changes a running window policy. No main HTTP proxy is provided. Settings, automatic remote
connections and protected restart are provided by PR3b as described in [Desktop distribution](desktop-distribution-v1.md#desktop-local-remote-registry-1174-pr3a).

For the exact Desktop origin, OPTIONS `/daemon/health` (without query) allows only GET and
`X-Litzio-Protocol`. Stop, unknown daemon routes, other methods/headers and foreign origins are
refused. The existing protocol check, write Origin checks and SVG/HTML sandbox remain.

## Desktop bundled origin (#1150 ⑤)

Desktop은 `litzio://app/index.html`에서 앱에 들어 있는 정적 UI만 제공한다. custom
scheme은 Core/문서/API handler가 아니다. 최초 Host 요청은 main의 daemon identity·protocol
확인이 성공할 때까지 기다리며 화면·theme·연결 알림은 기다리지 않는다. 연결 실패 시
NotificationCenter에 원인과 CLI 안내, 수동 Reconnect가 남는다. 재연결은 같은 편집
세션을 유지한다. CORS 미지원·구 비서 API daemon을 연결 완료로 오인하지 않도록 현재 프로토콜은 4다(#1168). 제품 버전 차이는 경고하며 호환 계층·capability 협상은 없다.

TCP Host authority 목록은 그대로다. UI Origin은 **정확히 `litzio://app` 하나**만 추가한다.
API/media의 cross-site 거부 예외와 `Access-Control-Allow-Origin`은 그 Origin에만 적용한다.
OPTIONS는 API/media의 GET/HEAD/POST/PUT/PATCH/DELETE와 Content-Type/X-Litzio-Protocol만
허용한다. daemon health의 한정 GET/protocol preflight는 위 PR3a 절을 따른다. credentials·wildcard·사용자 지정 Origin은 없다. 쓰기 Origin·JSON 검사는 유지한다.
Figure·일반 Markdown·파일/읽기 미리보기의 Host 이미지는 UI와 Host origin이 다른 경우에만 anonymous CORS를 사용한다. 같은-origin 브라우저 이미지는 기존 로딩 방식을 유지한다.
허용 Origin의 CORS 응답만 CORP cross-origin이며 나머지는 same-origin이다. Origin 없는
cross-site API/media, lookalike/foreign/null origin과 잘못된 TCP Host는 계속 거부한다.

번들 CSP는 script/style/font를 앱에 한정하고 connect/img만 정확한 로컬 daemon 및 시작 시 등록된 원격 origin에
추가 허용한다. daemon이 내보낸 JavaScript/HTML을 앱 코드로 로드하지 않는다. 문서
SVG/HTML과 파일 미리보기의 sandbox·script-src none, frame 금지는 그대로다.
브라우저 UI·같은 origin 요청·기존 Core write path는 유지한다. 인증은 #1145에 보류한다.

검증은 HTTP 경계 단위 검사, production HTTP browser Save/Reload/충돌·재연결,
Desktop main-frame IPC 검사와 실제 dev Electron의 새 origin 복구를 구별한다.
패키지의 origin·복구·daemon 미가동 시작 검사는 기존 Desktop CI가 실행한다.

## Shared local daemon (#1142 PR2)

[ADR-0016](../adr/0016-shared-local-daemon-host.md) governs the daemon; the owner-approved 2026-11-04 authentication decision below supersedes earlier token requirements.
`daemon start` starts a background local-mode daemon for this PC; Desktop discovers it.
`daemon run` runs in this terminal in the foreground. `--root`, `--host`, `--port` and
`--public-origin` allow server/deployment settings; without those options it is local mode. `daemon status` verifies its identity and prints a table; `--json` returns structured status including its URL.
`daemon stop --confirm` stops that exact instance; confirmation acknowledges that other
clients/jobs can be interrupted. Restart is explicit: stop, then start. Product changes never
replace a running daemon. Desktop uses this daemon through the PR3 connection/owner-pipe path;
plugin/AI lifetime revision and the one temporary packaged smoke restoration remain PR4.

### Host and daemon terminology (#1139)

Host is the role providing document capabilities; HTTP Host provides that role over HTTP.
A daemon is the shared Host process running separately from UI. CLI `daemon` alone and help
exit without a listener; unknown subcommands fail. There is no `serve` alias.
No shared editing state or conversion of existing file CLI commands to live daemon RPC is implied.

### Discovery, identity and versions

Local mode has no `--host`, `--root`, `--port` or `--public-origin`. Only this loopback,
unrestricted instance is registered for Desktop discovery. Manual modes
are never published as Desktop candidates. `start/stop` manage only the local instance. `status` also inspects endpoint-specific manual locks and prints their verified URLs. JSON keeps the local status at the top level and includes `manualInstances` (each running or unreachable). Desktop discovery remains local-only.
`--channel stable|beta|development` selects the user/channel namespace: default is development
for source, beta for prerelease builds, otherwise stable. The fixed origin is derived from the OS
user identity (Windows SID via `whoami /user /fo csv /nh`, POSIX numeric UID) and channel:
SHA-256 of `brand.appId`, NUL and `sid:<SID>`/`uid:<UID>`, first unsigned big-endian 32 bits modulo
8192 gives a user slot; port is `20000 + slot * 3 + channelOffset` (stable 0, beta 1, development 2).
This stays in 20000–44575, below the dynamic-port range and away from usual development defaults.
The same OS identity/channel retains its origin across restarts and builds; different users are
no longer assigned the same three machine-wide ports. Finite hash slots can collide: a busy port
(including such a collision) fails explicitly, with no alternate port or automatic replacement.
`daemon status` reports the verified URL; do not assume one machine-wide port.

State is `<home>/<brand.folders.shared>/daemon/<channel>/` (official `.litzio`).
`LITZIO_DAEMON_DIR` overrides the parent directory; all automated tests use isolated temporary
state, except the NSIS update fixture: shell relaunch uses a clean disposable Windows account's
default shared directory, refusing existing data and cleaning only its own directory (see
[installation verification](desktop-distribution-v1.md#update-and-removal-daemon-gate-1164)). The directory is user-only (POSIX 0700, Windows inheritance removed and current user
full access). `daemon.lock` is exclusively created before startup and contains PID, start
time and instance UUID. Ready `instance.json` is published by sibling rename and contains those
identity fields plus the fixed URL and the diagnostic fields below. Shutdown removes only its matching record/lock.
Manual foreground listeners use an endpoint-specific lock in the same directory, containing the identity, URL and diagnostic fields for read-only status inspection. Status preserves unreachable manual records and distinguishes exited/reused owners from live unresponsive owners.

`GET /daemon/health` returns PID, start time, instance ID, **productVersion**
and **protocolVersion** separately. Clients must verify all identity fields against discovery.
Daemon health/stop requests require `X-Litzio-Protocol: 4`; mismatch returns 409 before operations. Other requests may omit this header, but an explicit mismatching value is refused. A product
version difference warns and retains the connection. On a protocol mismatch, use the CLI version
matching the running daemon to stop it (with that channel), or Ctrl+C in its foreground terminal,
then start the desired version. The incompatible CLI does not bypass protocol checks to stop it;
never kill a PID alone. `POST /daemon/stop` requires
allowed-origin JSON, all three identity fields and `confirm:true`. No OS kill based on a PID.

CLI/Desktop daemon control RPCs use a fresh connection per request, with a 10-second
deadline and no automatic retry. They do not reuse idle pooled connections, including
after synchronous installation checks delay socket-close processing. A lost stop response
remains a failure; the client never replays the stop request. Identity/version checks are unchanged.

`start` and Desktop's explicit reconnect reclaim records/locks only after OS creation identity proves the owner exited or its PID was reused. They recheck lock/discovery ownership before cleanup. Malformed records and live but unresponsive owners fail closed with recorded PID/URL and log guidance. `status` distinguishes running, not running and recorded-but-unreachable; it never deletes state. No background restart or PID-based process killing is introduced. Repeated `start` reports the existing PID, URL and launcher.

Discovery and health also carry launcher (`desktop`, `cli-start`, `cli-run`), OS creation identity, unrestricted/Root scope and non-loopback flag, daemon home, executable path and log path when present. Status offers a table and `--json`; Desktop shows the same information in its existing settings surface. `LITZIO_DATA_DIR` isolates the shared Host data base for tests; public `.litzio` is not used by these tests.

Desktop invokes the same local `run`/lock path with a private IPC pipe (`LITZIO_DESKTOP_DAEMON=1`, requiring an IPC parent). Its daemon exits when that pipe disconnects, including parent crash. CLI `start`/`run` have no Desktop parent lifetime. Normal Desktop close stops only its spawned generation and waits for its process exit as well as discovery removal. Update/removal gates and CLI-daemon refusal follow the [Desktop installation contract](desktop-distribution-v1.md#update-and-removal-daemon-gate-1164). Explicit Desktop Stop uses the existing confirmed identity-checked stop RPC regardless of launcher. No client/job tracking. See [Desktop contract](desktop-distribution-v1.md#shared-daemon-desktop-1142-pr3).

### Authentication deferred (#1145)

**Owner-approved final decision, 2026-11-04:** this phase has **no authentication**.
The method and adoption timing are deferred to [#1145](https://github.com/litzio/litzio/issues/1145).
The previous token-file, login/bootstrap, session-cookie, Bearer-check and secret browser-link
implementation is removed, not disabled. There is no cleanup/migration of old credentials.
Browsers open the ordinary daemon URL directly. Instance identity and protocol checks are
compatibility/ownership guards, not proof of an authorized caller.

Anyone on the same PC, including other Windows users, can reach a local daemon. Desktop's
daemon remains loopback-only. A manual non-loopback bind admits anyone on the same network who
can reach its port; without `--root`, this exposes the entire disk and assistant (AI) execution
under the Host OS user's permissions. Host/Origin checks remain and reject cross-origin browser
requests, but a direct client can construct accepted headers. They do not authenticate people.

Bibliography reads reuse the shared stateless Host and existing Root checks through the dedicated
`/api/bibliography` endpoint. Only declarations of an admitted, revision-matched document are read;
resource errors do not block Markdown Save. The local per-document folder context, HTTP fixed Root
union, limits and snapshot policy are specified in [Citations v1](citations-v1.md#bibliography-snapshots-and-limited-formatting-unit-b).

Docling configuration and PDF conversion run on this Host under its fixed Root
policy. HTTP clients share the Host user's server address; they do not call a
Docling service on the browser device. See the
[app conversion contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-conversion-v1.md#app-pdf-conversion-797) and
[Korean administrator guide](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/guides/docling-server.md). Worker admission,
shared installation/request receipts and uncertain/no-replay
recovery follow [Host worker plugins](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md), under ADR-0012.
The same Host also serves enabled, revision/hash-checked installed UI ESM/CSS
through [Plugin UI contributions](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md) (#857), retaining its CSP and
document Root policy. Registration checks every supplied source asset against Roots.
The process-local current snapshot is not a persistent queue or document backend.

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Build and run

Build from the selected checkout using the repository's Node.js and pnpm versions:

```bash
pnpm install --frozen-lockfile
pnpm --filter @litzio/cli package
```

`packages/cli/dist/litzio-cli-0.0.0.tgz` contains the CLI ESM bundles, production Editor, manifest and dependency license notices. It has no runtime npm dependencies. `THIRD_PARTY_LICENSES.txt` accompanies the CLI; the Editor serves its own dependency-closure notices at `/licenses/THIRD_PARTY_LICENSES.txt` and an index at `/licenses/index.html`, inside the existing static root. The inventory can include build/type dependencies reached by production/peer declarations; listing them does not mean their code runs in the browser. Copy the archive to the target machine; install it in an otherwise empty folder with `npm install --offline --ignore-scripts <archive-path>`. Then run the installed binary:

```powershell
# Windows; these folders must already exist on the server.
.\node_modules\.bin\litzio.cmd daemon run --port 5180 --root "C:\project" --root "C:\document"
```

```bash
# Linux
./node_modules/.bin/litzio daemon run --root /srv/project --root /srv/document
```

An extracted package can instead run with `node cli.mjs daemon run --root <folder>`. For local development after `pnpm --filter @litzio/cli build`, use `node packages/cli/dist/cli.mjs daemon run --root <folder>`. Runtime requires Node.js `>=24.22.1 <25`; no pnpm, tsx, source checkout, Vite server or Electron is needed. Initial platforms are Windows x64 and Linux x64. macOS and individual NAS/filesystem combinations are not verified. The archive is generated by CI/local builds but is not retained as a CI artifact, published to npm or used as an automatic updater.

Source development can use `pnpm cli daemon run --root <folder>`. Source execution
uses checkout-local `.litzio-dev/` for plugins, settings and agent cwd. In contrast,
`node packages/cli/dist/cli.mjs daemon run` is a distributed build and uses the same
user defaults as installed Desktop. To intentionally share a source HTTP Host with
Desktop, explicitly set `LITZIO_PLUGINS_DIR`, the required individual
`LITZIO_<ID>_SETTINGS_FILE` variables and `LITZIO_ASSISTANT_CWD` to the desired
locations. These overrides take precedence in both execution forms; see
[runtime paths](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md#installation-and-api). No existing store is
migrated or cleaned automatically.

`litzio --version` alone prints `litzio <CLI package version> (<build commit>)` and exits 0. The build injects the version and 12-character Git commit; a Git-free build reports `unknown`. Combining `--version` with any other argument is an argument error. This reads no manifest at runtime. Desktop-specific identity is documented in the [Desktop contract](desktop-distribution-v1.md#optional-command-line-tools-604).

| Option | Contract |
| --- | --- |
| `--root <directory>` | Optional, repeatable; omit for full server-disk access; relative paths use launch cwd. All must exist and be directories. The same real directory (filesystem identity) given twice is deduplicated. Nested roots are allowed. |
| `--port <number>` | Default channel port above; integer 1–65535. Port conflicts fail without starting a replacement listener. |
| `--host <IP>` | Default `127.0.0.1`; IP literal only. A non-loopback bind requires `--public-origin`. Root limits remain optional; no authentication is provided. |
| `--public-origin <origin>` | Explicit `http(s)://host[:port]`, without path, credentials, query or fragment. Adds that exact origin and Host authority; required for non-loopback binding. |

Unknown options, positional arguments and repeated single-value options fail. Invalid configuration is rejected before listening. SIGINT/SIGTERM closes the listener, allows active connections up to five seconds, then closes remaining owned connections. New CLI builds replace the complete package, including Editor assets; do not mix versions.

## Allowed roots and Open Folder

When configured, Roots are the server's access boundary, fixed until restart. Without roots, the daemon uses the same full server-file policy as Desktop; per-document media and mutation guards still apply. They are neither initial folder selections nor a merged Workspace. Paths refer to the server filesystem, even when a browser runs on another PC.

HTTP supplies no default document or development sample. The Editor can still open an explicit path or restore tabs under the [session startup contract](editing-session-save-v1.md#tab-navigation-memory-383). Open Folder offers each allowed root and its descendants. The picker reuses `allowedRoots` from the Host startup response: typing a root without a trailing separator lists that root rather than its parent (#1159). Breadcrumbs start at the most specific containing root; Up cannot leave it. The path field still accepts another allowed root. Recent folders are browser preferences: locations outside current roots are hidden without deleting stored preferences, and every actual request is revalidated by the Host. A root name is compact in breadcrumbs; starting places and the path field retain the full locator.

Choose a folder, then a Markdown file in the sidebar. Several opened folders may be kept, each within an allowed root ([ADR-0009](../adr/0009-multiple-opened-folders.md)); remembered ones the roots no longer allow are left out on start. Open, New file/folder, Save, relative images, image paste/drop, image choice and receipt-based rollback use existing shared handlers. Image choice lists only server images within the allowed roots. Open/New keeps existing sessions; operation guards and work-loss confirmation follow the [session protection contract](editing-session-save-v1.md#switching-and-recovery). Stale disk revisions still return 409; unsupported canonical writes fail closed. Markdown semantics and relative image source strings do not change.

## Filesystem boundary

Explorer file deletion uses the daemon OS trash adapter: Windows Shell IFileOperation recycle-bin API, Linux freedesktop home trash (`$XDG_DATA_HOME/Trash`, or `~/.local/share/Trash` when XDG_DATA_HOME is absent or relative), without external commands. Linux writes paired `files/` and `info/*.trashinfo` entries with a percent-encoded absolute Path and local DeletionDate, reserving collision-free names. It only renames on the same filesystem: cross-device (EXDEV) moves are refused; per-device `.Trash-$uid` is outside this contract. Unsupported/unavailable trash fails without unlink fallback. The validated `deleteFile` handler still checks folder/file identity and expected revision. Tests use scratch-only adapters/data homes and never touch the user trash. Failures expose the trash failure reason/error code; restricted Root filesystem errors expose their code without leaking resolved paths outside the roots. Asset receipt rollback and other internal cleanup retain their existing narrow deletion contracts.


Every document read/create/save/preview, folder list/browse/create, media read, image choice source and asset upload/rollback passes the same root policy. Figure validation performs no filesystem access. Static Editor assets are a separate fixed build directory, never a requested document directory.

- Both the normalized locator and resolved target must lie in the allowed union. Component-aware comparisons reject sibling prefixes and other drives. Windows case/separator behavior follows filesystem path handling: the matching prefix of both the locator and the resolved target must be the pinned root directory itself, so names that JavaScript case folding equates but the filesystem keeps distinct (for example KELVIN SIGN and `k` on NTFS) are rejected.
- Windows Root pinning, target and existing-parent checks use native canonical paths so an approved 8.3 Root locator and its actual long path identify the same boundary, including creation and pre-publication checks. `RootAccess` still returns the approved locator and exposes each Root using its configured spelling. Canonical spelling does not admit an outside root, an escaping junction or a replacement directory; path and filesystem identity checks still apply. POSIX resolution is unchanged.
- Existing targets must resolve to regular files/directories. New leaves require an existing allowed real parent; dangling links cannot be replaced. Exclusive file/folder creation and overwrite refusal remain in force.
- Symlink/junction targets outside all roots are rejected. A missing name behind such a link is rejected the same way, so responses do not reveal what exists outside. A link into another allowed root does not relax narrower per-document media, folder or asset rules.
- Startup pins each root's real path and filesystem identity. A missing, moved or replaced root fails closed until the operator checks configuration and restarts.
- NUL, device paths, drive-relative locators and Windows alternate streams are rejected. Responses suppress raw filesystem errors that could reveal out-of-bound resolved paths.
- Asset receipts are bound to the process signing key and uploaded file identity/content. Restart invalidates receipts; there is no asset/session registry or automatic orphan cleanup.

The operator's OS account and filesystem administrators are trusted. `realpath` checks cannot promise an atomic OS sandbox against a local process replacing directories between a check and I/O; the existing [File commit limitation](filesystem-host-boundary-v1.md#file-commit-v1) remains. Common traversal, link escape and root replacement cases are covered by real filesystem tests.

## HTTP and remote access

Default local access uses the fixed user/channel origin above. There is no authentication;
Host/Origin checks protect browser request boundaries.

**Owner-approved final decision, 2026-11-04 ([ADR-0016 ③](../adr/0016-shared-local-daemon-host.md#③-로컬-접근-범위)):**
Root-unrestricted non-loopback mode is allowed with explicit `--host` and `--public-origin`,
without authentication in this phase. Manual remote daemons are not published for Desktop
discovery. Local user/channel fixed ports and discovery rules remain unchanged.

Every non-loopback startup warns in the terminal that anyone on the same network who can reach
the port can access the daemon, and omitting `--root` exposes the entire disk and assistant (AI)
execution. This warning does not block startup. Authentication, including HTTPS and accounts,
will be selected later in #1145. For example, using the operator's actual LAN address:

```bash
litzio daemon run --host 0.0.0.0 --port 5180 --public-origin http://192.168.1.10:5180
```

Root-specified mode and Host/Origin checks retain their existing behavior. Operators may still
provide their own proxy/network controls; these are not daemon authentication or a requirement
implemented by this phase.

For an existing access-controlled reverse proxy on the same server, keep the upstream on loopback and configure its browser origin explicitly:

```bash
litzio daemon run --port 5180 --root /srv/project --root /srv/document --public-origin https://docs.example.internal
```

If choosing an authenticated proxy, configure it to authenticate **every path** on that dedicated origin, forward `/` unchanged to `http://127.0.0.1:5180`, preserve the browser's Origin, and set Host to `docs.example.internal` or the loopback upstream authority. Do not mount under a URL subpath. Use HTTPS at the proxy and restrict direct upstream access. A proxy on another machine additionally requires an explicit bind such as `--host 0.0.0.0` and firewall/private-network controls; specifying a public origin alone provides no access control. Never expose this service as an unauthenticated public Internet editor. Proxy identity, credentials and TLS provisioning remain the operator's responsibility.

The listener accepts only configured Host authorities and exact origins. Writes require Origin; cross-site API/media requests are rejected except for the exact bundled Desktop origin above. It emits no wildcard CORS headers and does not infer trust from `Forwarded`/`X-Forwarded-*`. JSON routes require `application/json`. Malformed/duplicated query parameters and malformed encoded paths are rejected. GET/HEAD with bodies are rejected; unknown routes fail without SPA fallback.

| Limit | Value |
| --- | --- |
| Document/source/folder/Figure validation JSON bodies | 32 MiB |
| Image upload | 10 MiB, existing supported MIME types |
| Asset rollback JSON | 8 KiB |
| Headers | 16 KiB; 15-second header timeout |
| Request / keep-alive timeout | 60 seconds / 5 seconds |

Body limits count bytes for Content-Length and chunked input. Oversized/interrupted requests do not reach a file operation. Failed bodies are discarded without accumulating further buffers. Production assets use the shared CSP and MIME checks; HTTP adds no-store, same-origin resource policy, no-referrer and frame denial. Document media uses a sandbox CSP with scripts disabled, including direct navigation to user-supplied SVG.

## Verification

```bash
pnpm --filter @litzio/editor exec tsx --test test/http-host.test.ts
pnpm --filter @litzio/cli package
pnpm --filter @litzio/cli test:packaged
pnpm browser:test http-host
```

The package test installs the archive offline outside the checkout and runs existing CLI commands plus daemon run using Node alone. HTTP tests exercise both roots, outside sentinels, links/root replacement, request boundaries, body limits and an access-controlled test reverse proxy covering HTML, API and media. The production browser scenario verifies two-root navigation, actual Save → Reload, New file/folder, image persistence, draft/dirty protection, 409 preservation and SVG script blocking. It is separate from Vite scenarios because startup differs. `--screenshots` adds wide/narrow captures for manual layout review, not a substitute for assertions.

Windows/Linux CI runs package and production browser checks; Windows splits host (`http-host http-plugins`) and plugins (`plugin-jobs plugin-views`) onto independent runners with separate checkout, daemon, port and fixtures, each retaining archive and crash recovery checks; Linux keeps the full group; the two Windows Desktop unit partitions (foundation and editor, together the full `pnpm test`) run the filesystem/HTTP suite, and Linux's quality job runs it with all Editor tests. The path policy always selects Desktop when HTTP is selected; the HTTP job retains archive and production browser checks without repeating unit/integration tests. CI does not upload the generated `.tgz`. Optional `tmp/http-host-capture/` screen evidence belongs to manual `--screenshots` runs. CI retains failed jobs' `tmp/browser-results/` diagnostics for 7 days in artifacts named by OS and group. Existing Vite browser and Windows packaged Desktop regressions remain required. This does not establish arbitrary NAS compatibility, measured startup speed improvements, public Internet hardening or OS-native clipboard/IME correctness.

`pnpm browser:test http-host` also runs `http-recovery.spec.ts` against its own production CLI daemon.
It kills only its launched browser PID (and its children on Windows), checks exit and a new PID,
and reopens the same persistent profile and exact origin. Browser crash recovery keeps the daemon alive;
PR4 additionally stops/restarts that owned daemon via a native bridge stand-in and asserts
unsaved edits, Undo/Redo and Save without renderer reload. Committed
records survive; the actual list/prompt/Restore, dirty state, explicit Save/Reload and external
file conflict are asserted. This was executed on Windows Chrome; the same HTTP CI command runs
it on Linux Chromium. The latter is not a local Windows verification result.
Recovery is client-local: a server restart alone proves nothing about browser persistence, and
a changed scheme/host/port/profile has a different IndexedDB store. See the
[recovery contract](editing-session-save-v1.md#recovery-durability-boundary) for durability limits.

The 2026-10-13 dependency audit still reports 16 existing transitive advisories (5 high, 10 moderate, 1 low). This change reuses the already locked esbuild build tool and changes no resolved dependency versions; it does not remediate those advisories. Core parser configuration and the local markdown-it patch remain unchanged, and build-only tooling is not a Host runtime. MyST remediation remains tracked in [#11](https://github.com/litzio/litzio/issues/11); the historical [dependency review](../reviews/myst-security-alignment-v1.md) is context, not current security assurance.

### Host 실행 계정 (#1199)

`GET /api/host-capabilities`와 `GET /daemon/health`는 `identity: { runAs: string }`을 추가로 반환한다. 값은 대상 Host 프로세스의 OS 실행 계정이며 Windows는 `DOMAIN\user`, Linux는 사용자 이름이다. Desktop 로그인 이름이나 접속자 인증 정보가 아니다. 파일 작업과 비서 실행은 이 계정 권한으로 수행된다. `identity.viewer`는 인증 결정 #1145 이후의 확장 자리이며 현재 제공하지 않는다.

이 변경은 기존 필드를 바꾸지 않는 추가 정보다. 새 클라이언트도 이 필드의 존재를 연결 조건으로 요구하지 않으므로 프로토콜 4를 유지한다. 값을 제공하지 않거나 연결되지 않은 Host의 계정은 추측하지 않는다. 구버전 호환 계층이나 데이터 migration은 추가하지 않는다.

Host capability의 OS 계산은 프로세스 수명을 따른다(#1487). Windows 휴지통 지원 검사(프로세스 세션의 interactive 여부·OS 버전)는 동시 요청에서 같은 진행 중 계산을 공유하고, 성공한 `true`/`false` 결과를 재사용한다. PowerShell 실행 실패·잘못된 응답은 해당 요청에서 unavailable로 처리하지만 캐시하지 않아 다음 요청에서 다시 계산한다. `identity.runAs`도 기존처럼 성공한 실행 계정만 프로세스 수명 동안 재사용하며 실패 시 다음 요청에서 재시도한다. 따라서 정상 capability 관측마다 PowerShell을 실행하지 않는다. handler에 주입한 삭제 adapter의 선택은 요청에 적용된 adapter를 따르며, 이 값싼 선택에는 OS 조회가 없다. 실제 휴지통 이동은 매 작업의 경로·revision·OS 결과를 계속 확인하며 capability 캐시가 작업 성공을 보증하지 않는다.

CLI `litzio daemon status` 표는 실행 중인 각 daemon의 `Run as (실행 계정)`을 표시하며 `--json`은 같은 `identity.runAs`를 보존한다. 이 읽기 작업의 범위는 기존 로컬/수동 daemon 상태 조회이고 쓰기 receipt는 없다. 응답을 확인하지 못한 daemon은 기존 unreachable 상태를 유지하고 계정은 표시하지 않는다.

## Read-only document comparison (#1201)

`POST /api/document-compare` accepts `{ before: string, after: string }` native source
snapshots and invokes the shared `executeCompareOperation` executor. It does not read
file paths, call Save, write recovery records or share client editing state. Results
include Core block changes, document metadata change status, two editable projections
and source revision receipts. Invalid/oversize/unsupported input returns the existing
JSON error response; methods other than POST return 405. See the
[Core and CLI comparison contract](document-support-v1.md#block-semantic-comparison-1201)
for bounds, pairing and receipt semantics. CLI `compare <before> <after> --json` calls
the same executor in its own process, rather than contacting the running daemon.
## Plugin stage 1 (ADR-0020)

Owner-initiated stage 1 provides [the shared plugin management contract](plugin-stage1-v1.md): local artifact registration, trust/enable, target-daemon subprocess execution and reload, Windows DPAPI secret storage, and the assistant authoring kit. Management uses the shared operations/CLI and a separate Codex tool; per-call confirmation is replaced by visible activity records. Secret values are entered directly by the user in settings UI and are not exposed to the assistant. Display tools remain restricted to their existing fields. [Generated views](generated-views-v1.md) provide the common Core/Host runtime and bundled app renderer, including active plugin read operations with row schemas. Plugin-specific generatedUi/views contributions remain unsupported; this does not mean the common view runtime is unavailable.

## Node runtime security baseline (2026-11-11)

Node.js `>=24.22.1 <25` is required: 24.22.1 is the first 24.x release fixing
[CVE-2026-111497](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
CI uses 24.22.2; Desktop pins [Electron 45.3.0](https://releases.electronjs.org/release/v45.3.0)
with Node 24.22.2. Updating Desktop does not update a separately installed system Node
or an already running shared daemon. Operators must update system Node and restart those daemons.

Node `fetch()` decodes Brotli HTTP responses through `node:zlib` (see
[Undici fetch](https://github.com/nodejs/undici/blob/v7.30.1/lib/web/fetch/index.js)).
No direct application Brotli decode was found. Exposure requires a consumed Brotli response
from a malicious/compromised selected server, or an attacker able to modify a plain HTTP
connection. HTTPS normally requires control of the server or trusted TLS interception.
A successful attack can crash, disclose memory or execute code with the receiving process's
OS user permissions; plugin subprocesses are not an OS security sandbox.

| Execution path and source evidence | Runtime / response control / affected process |
| --- | --- |
| Desktop daemon launch: `apps/desktop/src/main.ts:620`, `daemon-client.ts:26`, `apps/editor/server/daemon-state.ts:27` | Newly launched daemon uses the Desktop executable with RunAsNode. An existing shared daemon retains its original runtime. Remote health preflight (`remote-host-registry.ts:196`) consumes the configured Host's response in that daemon. |
| Desktop main daemon probes: `apps/desktop/src/daemon-client.ts:35`, `apps/editor/server/daemon-state.ts:149` | Electron's Node fetch in the main process; response control requires replacing/compromising the selected local loopback service (not an ordinary remote network peer). |
| CLI daemon / commands: `packages/cli/src/daemon.ts:91`, `cli.ts:1963`, `plugins.ts:83`, `views.ts:33`; Desktop shim: `apps/desktop/src/cli-integration.ts:19` | Standalone CLI/development use system Node; Desktop shim and assistant CLI use Electron RunAsNode when launched from Desktop. Selected local/remote Host responses affect the CLI process; daemon responses are handled by its own runtime. |
| Plugin process: `apps/editor/server/plugins/plugin-process.ts:78`; Docling `community-plugins/docling/conversion.js:22`, `host.js:24` | Child inherits daemon executable with RunAsNode. Selected Docling server responses affect the plugin child; plain HTTP (including LAN Docling) additionally permits network modification. |
| Updater: `apps/desktop/src/main.ts:637`; renderer: `main.ts:481` | electron-updater 6.8.9 uses ElectronHttpExecutor → electron.net.request (upstream `out/AppUpdater.js:206`, `out/electronHttpExecutor.js:54`). Electron net and sandboxed renderer fetch use Chromium networking, not this Node zlib decode path. |
| Incoming daemon request body: `apps/editor/server/request-body.ts:8`, `document-api.ts:233`, `asset-api.ts:297` | Raw bounded bytes are collected and decoded/parsed; no Content-Encoding decompression. Sending a compressed request alone does not reach a Brotli decoder. |

External provider executables such as Codex app-server and Copilot CLI own their runtimes
and are outside this update. Arbitrary trusted third-party plugin code may add further network
paths; the shared runtime update protects its Node decoder too.

The direct `undici` dependency stays at 7.30.1, matching the
[Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1).
A package-only update cannot replace Node's native Brotli decoder. Electron release notes
44.8.0–44.11.1 and the [45.0 breaking changes](https://www.electronjs.org/docs/latest/breaking-changes#breaking-api-changes-450) were reviewed. The owner selected stable 45.3.0; application migration was not required for the paths below.

The existing packaged CLI verification (`apps/desktop/test/packaged/cli-check.ts`) reads
`process.versions.node` from the actual packaged executable using `ELECTRON_RUN_AS_NODE`
and checks the security floor independently of generated CLI engines. It is already called by
Desktop packaged/update checks; Windows packaging and update regressions run in merge queue
and release CI, while PR CI runs the selected Linux checks. Historical runtime evidence is unchanged.

### Electron 45 compatibility evidence (2026-11-11)

| 공식 변경 | Litzio 대조·검증 |
| --- | --- |
| sandbox preload Node shim/Buffer 제거 | `preload.ts:3`은 electron만 import. 제거된 전역/모듈 사용 없음. 실제 packaged renderer의 info/daemon/update IPC 통과. |
| native EventEmitter | `preload.ts:8,55`의 on/send/invoke/removeListener만 사용. 실제 update-state 구독·checking→available→downloading→downloaded·구독 해제 통과. static events helper 사용 없음. |
| display-capture 권한명 | `main.ts:615`의 모든 권한 거부 정책 유지. 캡처 허용 기능 없음. 실제 OS 화면 캡처 권한 수락은 검증 대상 아님. |
| ASAR descriptor | `package.ts:44`의 ASAR 유지. raw fd를 native addon/stdio/socket으로 전달하는 경로 없음. packaged ASAR의 main/preload/renderer 로딩·NSIS 자산 검증 통과. CLI/플러그인은 resources/cli의 외부 파일로 실행. |
| 비 sandbox 부모 window.open | `main.ts:481`은 sandbox=true, `main.ts:572`는 child 생성을 deny하고 외부 열기로 전달. 해당 비 sandbox 부모 경로 없음. |
| worker/subframe Node·DevTools extension preload·legacy desktop capture | Node integration과 캡처/extension 기능을 사용하지 않음. 앞의 세 변경은 44.3에도 backport되어 이번 44.7→45 차이 아님. |
| contentTracing heap/format·requestStorageAccessFor·safeStorage deprecation | 현재 Desktop에서 해당 API 사용 없음. |

Electron 45.3.0 / Node 24.22.2 / Chromium 156.0.8078.96을 실제 packaged main에서 확인했다.
같은 probe에서 daemon 실행 파일과 plugin child의 실행 파일·부모 PID를 대조했고 plugin child의
`ELECTRON_RUN_AS_NODE=1`, Electron 45.3.0, Node 24.22.2를 확인했다.
업데이트 probe는 임시 로컬 GitHub 형태 feed와 실제 빌드 installer를 사용해 production preload→IPC→
electron-updater 6.8.9→Electron net의 확인·다운로드·체크섬 및 이벤트 전달을 검증했다.
로컬 사본의 feed 설정은 finally에서 복원했고 설치·재시작·공개 서비스·서명 수락은 수행하지 않았다.
실제 install/update lifecycle은 격리된 Windows merge-queue/release CI에 남는다.
기존 electron-builder 26.15.3으로 Windows x64 NSIS 패키징과 자산 검증이 통과해 builder 갱신은 하지 않았다.

로컬 45.3.0 packaged 전체 실행은 13건 중 11건 통과했다. 두 실패 중 하나는 Chromium 156에서
CSS custom-property `#fff`와 Electron 배경색 `#ffffff`를 문자열로 비교하던 검사였다.
CSS 파서로 기대 색상을 정규화하도록 검사만 수정했으며 같은 색상 일치·timeout을 유지했다.
수정된 파일 열기/저장·테마·재시작 검사의 대상 실행 1건은 통과했다. 나머지 caption 검사는
44.11.1에서도 실패했던 foreground guard이며, 추가 진단상 Win32 `GetForegroundWindow()`가 0을
반환해 화면 샘플링 전에 거부됐다. 픽셀 단언은 바꾸지 않았다. 이는 로컬 foreground 환경 부재의
근거지만 44.7.0 기준 실행을 하지 않았으므로 이 PR 전체와 무관함을 완전히 증명한 것은 아니다.
실제 native caption 픽셀 검증은 Windows CI에 남는다. 새 진단은 실패 시 HWND·owner만 추가한다.
업데이트 probe의 differential download는 이전 설치본 cache 부재로 full download에 fallback해
성공했다. 실제 차등 적용·설치·재시작 성공으로 확대 해석하지 않는다.
