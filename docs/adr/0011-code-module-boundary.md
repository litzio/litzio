# ADR-0011: Code module boundary

- Status: Accepted
- Decision date: 2026-10-30
- Last verified: 2026-11-14 — #1595 뒤의 상태·대체 관계와 현행 계약을 정적으로 대조했다. 제품·브라우저·Desktop 실행 재검증 없음.
- Previous verification: 2026-11-01 (#869 independently built plugin folder and complete Docling Host/UI contribution boundary; #853/#857 worker/crash and command/tab/sidebar contracts remain).
- Previous verification: 2026-10-30 (Docling module/CLI, comparison tab/reading surface and shared Host; package boundary and browser tests).
- Authority: owner decisions in [Discussion #766](https://github.com/litzio/litzio/discussions/766) and [Discussion #767](https://github.com/litzio/litzio/discussions/767), under [AGENTS.md](../../AGENTS.md).
- Superseded in part: [ADR-0012](0012-plugin-runtime-and-ui-contributions.md) replaces the static/no-registration/no-dynamic-loading boundary and extends process-local-only conversion state with shared request records. The remaining boundaries stay Accepted.

The static connections and transient-task text below preserve the original
decision. #853 replaces Host execution with the
[worker contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-runtime-v1.md); #857 replaces command/tab/sidebar
connections with the [UI contribution contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/plugin-ui-v1.md).
#869 moves Settings, the conversion dialog and the Host facade into `plugins/docling`
through those contracts; the static descriptions below remain the original decision record. For the approved runtime
plugin direction, the superseding parts of ADR-0012 take precedence; adoption
requires its conditions and corresponding contract updates.

## 현재 적용 범위 (2026-11-14 정적 확인)

현재 적용되는 결정에는 외부 형식 해석·모듈 소유 자료와 Core 문서 의미를 분리하고 공개 Core API·얇은 CLI를 쓰는 경계가 포함된다. 삭제된 Docling 패키지·sidecar·비교 API·정적 연결은 아래 당시 구현 이력이다. 현재 플러그인은 [실행·제작 계약](../design/plugin-stage1-v1.md)과 [화면 코드 계약](../design/plugin-screens-v1.md)을 따른다. 옛 모듈이나 대응 저장소의 복원을 요구하지 않는다.

아래에서 명시적으로 삭제·대체됐다고 적은 부분만 이력이며, 그 밖의 결정은 원문 그대로 유효하다. 위 요약은 현재 상태의 안내이며 원래 결정의 효력을 제한하지 않는다. 당시 날짜·측정·검증 범위는 그대로 보존하며, 삭제된 기능의 재도입을 요구하지 않는다.

## Decision

The first code module lives in `packages/docling` (`@litzio/docling`), alongside
the existing workspace packages. It depends on the public `@litzio/core` API;
Core neither imports the module nor knows its source format or data. Document
meaning, validation and canonical writing remain in Core, under
[ADR-0002](0002-document-persistence-semantic-ownership.md).

Docling interpretation, conversion policy and correspondence data belong to the
module. Correspondence is a versioned JSON sidecar outside the native document.
Removing the module and its sidecar leaves a complete native MyST document and
its ordinary image assets. Snapshot paths have the lifetime defined by
[ADR-0003](0003-document-addressing-identity-boundary.md); the document hash binds
each new sidecar to exactly one generated document.

The CLI offers thin `litzio docling convert` and `convert-pdf` commands that
delegate conversion, external REST service access and file output to the module.
It does not implement Docling interpretation,
MyST syntax or document semantics. The implemented policy and sidecar contract
are in [Docling conversion](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-conversion-v1.md).

## Scope and consequences

This records the package, dependency direction, external module data and CLI
boundary demonstrated by the first module. No registration framework, dynamic
loading, marketplace, database or compatibility infrastructure is introduced.
[#769](https://github.com/litzio/litzio/issues/769) establishes two explicit
Editor connections: a sidebar action choosing a conversion folder and a read-only
comparison tab in the existing tab groups. The shell owns tab lifetime, folder
selection, translation and shared notification controls. Comparison tabs have no
editing/recovery session and are not restored at startup.

The module's `./ui` entry receives shared controls and product tokens, plus an
Editor-owned reading surface through `ReadingSurfaceProps`: a public Core read
model, document path, block/list-item position and snapshot selection callbacks.
The shell supplies the ordinary Editor's fixed Read mode (#815); source matching
and inspection state stay in the module. Editor engine types,
DOM and CSS remain private to Editor. The module measures only its own pane and
source-page DOM. Its `./compare` entry contains browser-safe types/geometry;
Node parsing and hash checks stay behind `./compare-host`.

`GET /api/docling-compare?path=…` uses the existing stateless file handler in
Vite, Desktop and HTTP Host. Ordinary Root and document-relative real-path
boundaries apply before reading Markdown/sidecar or serving lazy page images
through the existing media route. The sidecar contains the necessary information
from document.json; the UI does not fetch/repeatedly parse that large source JSON.
The comparison endpoint is read-only. See the
[comparison contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-compare-v1.md).

Unsupported source meaning must be reported explicitly by the
converter rather than silently claimed as preserved native meaning.

## App conversion connections (#797)

The module also connects at the app Settings Docling section, Explorer PDF file
menu and Command Center command. These are explicit contributions, not a general
registration/loading framework. The module supplies server-settings UI using
Editor-injected controls and external-link opener; it never imports Editor code.
The shell supplies the PDF picker, progress dialog, notification integration and
opens the existing comparison tab on completion.

The `./server-types` entry is browser-safe. `./server` owns Host-local settings
and one transient conversion controller; `./server-ui` supplies settings and
Host polling. The shared Host handler routes `GET/PUT /api/docling-settings`,
`POST /api/docling-check`, and `GET/POST/DELETE /api/docling-conversion` in all
three transports. The Host supplies the settings-file location and Root access
checks. PDF REST, failure interpretation and bundle creation stay in the module,
with the same preflight as CLI. The setting is a device preference outside
native documents; the task snapshot is process-local and has no persistent queue,
resume, document session or background-service contract. Cancellation stops
local waiting, not a server job. See the
[conversion contract](https://github.com/litzio/litzio/blob/archive/plugins-docling-2026-11/docs/design/docling-conversion-v1.md#app-pdf-conversion-797).
