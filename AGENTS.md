# AGENTS.md

> Document first. Semantics in Core. Interfaces replaceable.

## Working principles

- 지금은 컨셉 검증 단계이므로 당장 검증할 것만 구현하고, 보안·배포·운영의 세부는 실제로 필요해질 때로 미룬다([Discussion #767](https://github.com/litzio/litzio/discussions/767)). 공식 write path의 유효성, 데이터 보존, 테스트 기준 등 이미 적용되는 저장소 제약은 그대로 지킨다.
- 현재 요청을 해결하는 가장 작고 단순한 변경을 우선한다.
- 기존 코드와 검증된 라이브러리를 재사용하고, 새 abstraction이나 infrastructure의 필요성은 지금 막힌 실제 사례로 설명한다.
- 정상 동작하는 주변 코드를 현재 작업과 무관하게 재설계하거나 리팩터링하지 않는다.
- 기존 기술로 해결 가능한 parser, AST, document format, editor engine 등을 불필요하게 재구현하지 않는다.
- 기술적 제약이나 실패를 숨기기 위해 테스트 기준을 약화하거나 동작을 우회하지 않는다. [ADR-0016 ⑥](docs/adr/0016-shared-local-daemon-host.md#⑥-플러그인-기능-제거와-보관)의 PR3 테스트 제외는 PR4에서 복구해 종료했으며 예외를 연장하지 않는다. [ADR-0017](docs/adr/0017-bundled-client-and-official-ai.md)의 AI 공식 기능 이전·구 플러그인/Docling 제거와 보관·번들 UI 전환은 완료했다. 보관 기록은 `archive/plugins-docling-2026-11`에 유지하며, 현재 플러그인 계약은 ADR-0019·0020과 아래 구현 계약을 따른다.
- 새 상태는 소유자(앱·Host·문서·대화·플러그인·요청)를 먼저 정한다. 병렬 PR은 상대 PR이 바꾼 timeout·취소·출력·수명 가정까지 합쳐 검토한다.
- 개발 단계이므로 소유자가 Migration을 명시적으로 지시하지 않는 한, 이미 저장된 Litzio 문서·복구 기록·설정 등 과거 데이터의 하위 호환성을 설계 판단이나 구현 범위에 포함하지 않는다. 사람·AI·CLI가 앞으로 작성하는 입력의 처리는 이 규칙과 별개다.

## Architectural constraints

- 사람이 읽을 수 있는 plain-text document를 SSOT로 유지한다.
- 문서의 핵심 처리 로직은 특정 UI에 종속되지 않아야 한다.
- 특정 플러그인만을 위한 Core·Host 기능은 만들지 않는다. 단, 여러 플러그인이 함께 쓸 수 있고 가치 있는 기능은 Core·Host에 넣을 수 있다. 판단은 PR 리뷰에서 사람과 오케스트레이터가 하며 자동 검사로 강제하지 않는다.
- Editor, CLI, AI 등 서로 다른 인터페이스가 문서 의미를 각각 별도로 구현하지 않도록 한다.
- 영속적인 문서 의미 변경은 Editor에만 구현하지 않으며, 먼저 또는 동시에 Core의 editor-neutral semantic operation으로 표현한다.
- [ADR-0015](docs/adr/0015-shared-host-operations.md)에 따라 새 사용자 기능은 Host 공용 작업(입력·결과·범위·receipt)으로 정의하고 CLI 명령을 반드시 함께 제공하며, 비서에 필요하면 같은 정의로 비서 도구를 만든다.
- CLI는 공용 작업과 Core operation을 호출하는 얇은 인터페이스로 유지하며, 문서 의미나 Markdown/AST를 별도로 구현하지 않는다.
- cursor, focus, selection, toolbar, hover 등 Editor 전용 interaction은 CLI parity 대상이 아니다.
- 공식 write path가 생성하는 문서는 valid하고 안정적으로 다시 처리할 수 있어야 한다.
- Visual Editor는 ADR-0001에 따라 Tiptap/ProseMirror 기반의 single-document editor state를 사용한다. Litzio가 selection, history, cursor, clipboard 등을 포함한 자체 rich-text editor engine을 재구현하지 않는다.
- Editor-engine-specific types and document models stay inside `apps/editor`. Core exposes editor-neutral document semantics.
- Editor는 ADR-0010에 따라 최소 640px의 데스크톱급 창과 키보드·포인터 입력을 지원 대상으로 한다. 휴대폰 폭·터치 전용 레이아웃이나 검증은 실제 사용자가 확인되어 별도 결정이 나기 전까지 계획하지 않는다.
- [ADR-0016](docs/adr/0016-shared-local-daemon-host.md)에 따라 Desktop은 같은 PC의 공유 daemon(HTTP Host; 현재 단계는 인증 없음, #1145에서 방식·시점 선택)에 연결한다. `apps/editor/server`의 공용 파일 Host handler와 Core 의미·공식 write path를 재사용한다. 화면과 독립된 daemon 수명을 허용하되, 이를 범용 persistence/backend나 공유 편집 세션의 근거로 확장하지 않는다. Desktop의 로컬 연결은 PR3부터 공유 daemon을 사용하며 띄운 주체별 종료·명시적 종료·수동 다시 연결을 ADR-0016에 따른다. AI는 daemon 수명을 따른다. PR4가 수명 계약과 한정 테스트 복구를 완료했으며, 이후 ADR-0017에서 플러그인 기능을 제거·보관했다.

[ADR-0017](docs/adr/0017-bundled-client-and-official-ai.md)의 전환과 [ADR-0018](docs/adr/0018-desktop-remote-hosts.md)의 원격 Host·여러 Host 동시 보기는 구현을 완료했다. 2026-11-05 소유자 개시로 재개한 플러그인은 [ADR-0019](docs/adr/0019-plugin-tiers.md)·[ADR-0020](docs/adr/0020-plugin-architecture.md)를 따른다. 현재 SDK·로컬 artifact 관리·OneDrive·하위 프로세스/reload·Windows secret·비서 제작 키트는 [플러그인 1단계 계약](docs/design/plugin-stage1-v1.md), 플러그인 기본 화면·조회·표는 [플러그인 화면 계약](docs/design/plugin-screens-v1.md)을 따른다. 비서 생성·저장 뷰는 #1341에서 제거하고 보관했다. Docling은 공식 플러그인이 아니며 재개 시 커뮤니티 계층이다. Jira·Docling 수락 시험과 카탈로그 v2 등 후속 계획을 현재 구현 완료로 간주하지 않는다.

이 원칙을 이유로 미래 구조나 기능을 선제적으로 구현하지 않는다.

용어는 [제품 용어집](docs/contributing/terminology.md)을 따른다.

## Internal naming

- 내부 코드 이름은 `litzio`다(Discussion #856, #858). 패키지는 `@litzio/*`를 사용한다. 플러그인 공개 SDK는 ADR-0019·0020에 따른 `@litzio/plugin-sdk`를 사용한다. 제품 표시 이름, CLI·Desktop 프로토콜·설치·데이터 경로는 `brand.ts`와 패키저용 안내를 따른다(공식 기본값 Litzio). 저장소 참조는 별도 계약을 따른다.

## Repository map

- `docs/README.md` — central documentation index, including each document's status and authority.
- `docs/adr/` — accepted architectural decisions and their rationale.
- `docs/design/` — Implemented behavior contracts alongside Historical and Superseded documents; check each document's Status and current authority in the docs index.
- `docs/reviews/` — historical reviews and spike evidence, not current requirements.
- `docs/contributing/` — contributor guidance and documentation governance.
- `.github/` — CI and contribution templates.
- `patches/` — pinned local dependency patches with documented removal conditions. [Dependency patch register](docs/contributing/dependency-patches.md).
- `packages/core/` — Litzio의 headless document engine. 문서의 parse, semantic operations, structural validation, canonical serialization을 소유한다.
- `packages/core/src/myst/` — MyST integration boundary. MyST-specific parsing/serialization logic은 이 경계 안에 둔다.
- `packages/core/test/` — Core의 document semantics와 canonical round-trip 계약을 검증한다.
- `packages/cli/` — `@litzio/core`의 얇은 명령줄 인터페이스. 문서 의미나 AST 처리 로직을 구현하지 않는다.
- `packages/plugin-sdk/` — 플러그인의 공통 manifest·schema·Host SDK와 제작 계약.
- `plugins/onedrive/` — 공개 SDK를 사용하는 공식 OneDrive 플러그인.
- `packages/core/src/views.ts`·`packages/core/src/views-v2.ts`·`apps/editor/src/views/` — 플러그인 기본 화면·조회의 Core 의미와 앱 번들 렌더러. [플러그인 화면 계약](docs/design/plugin-screens-v1.md)과 [카탈로그 v2 설계](docs/design/catalog-v2.md)(Draft)를 함께 확인한다.
- `packages/file-commit/` — CLI와 Editor Host가 공유하는 Node 전용 파일 교체(revision 확인, temporary sibling, rename). 문서 의미를 알지 않는다.
- `apps/editor/server` — 공용 HTTP Host handler. ADR-0017에서 AI는 플러그인에서 daemon 공식 기능으로 옮기며 AI 수명은 daemon을 따른다. `assistant-host.ts`가 공식 AI를 직접 구성하고 `shared/assistant.ts`가 중립 계약을 소유한다. `plugins/`는 대상 Host의 플러그인 실행·reload·secret·제작 작업을 소유한다. Docling은 공식 플러그인이 아니다.
- `apps/editor/` — Core-backed Visual Editor. MyST AST를 직접 다루지 않고 Core read model과 Core operations만 사용한다.
- `apps/desktop/` — Electron Windows shell, NSIS 패키징과 Stable/Beta 업데이트. ADR-0016의 공유 로컬 daemon 수명을 따르고 ADR-0017에서 앱 번들 UI + 대상 Host를 아는 HTTP 클라이언트로 전환한다. 문서 의미를 구현하지 않는다.
- [UI 결정표와 갤러리](docs/design/ui-decision-table-v1.md) — UI 작업의 진입점. 기존 토큰·variant·아이콘 관례 안의 선택은 묻지 않고 정한다. 새 표면 구조·기존 계약 변경·새 공통 상호작용 변경만 소유자에게 올린다. 결과에는 선택한 공통 구현과 예외 이유를 적는다.
- `docs/design/ui-patterns-v1.md` — UI 작업 전에 읽는 반복 패턴 기준. 소유자가 확정한 목표, 현재 기준 구현·사용처와 미구현 불일치·후속 이슈를 구분하며, 같은 패턴의 다른 화면도 확인한다.
- `docs/design/editor-layout-rules-v1.md` — Editor UI 변경 시 정렬, 간격 및 control 치수 기준으로 참고한다.
- `docs/design/editor-visual-language-v1.md` — Editor 토큰·팔레트, typography, 표면·테마와 상태 표현 기준. 배치·control 치수는 Layout Rules, 반복 동작 목표는 UI 패턴 문서를 따른다.
- `docs/test/` — 자동 검증 실행 방법과 자동화가 판정하지 않는 수동 확인 항목.
- `.githooks/` — optional shared Git hooks, including commit-msg AI provenance checks.
- `.agents/skills/` — project-only agent skills shared by Codex and Claude Code (`.claude/skills/` holds thin entry points). `litzio-orchestrator` runs multi-issue orchestration only on explicit invocation.
- `README.md` — 제품 목적과 장기적인 아키텍처 방향.

## Documentation authority and lifecycle

- 적용 순서는 이 문서의 repository-wide 제약 → Accepted ADR → Implemented design contract → 코드·테스트의 실행 근거 → historical review/spike → README 개요다. 충돌 시 실제 동작과 Accepted decision을 대조해 버그인지 문서 drift인지 판정한다. 코드를 무조건 정답으로 삼지 않는다.
- 변경 전에 [docs index](docs/README.md)에서 관련 Accepted ADR과 Implemented design contract를 확인하고, current behavior를 변경하면 관련 design document도 같은 PR에서 갱신한다.
- review/spike를 current contract처럼 사용하지 않는다. 당시 근거는 보존하고 현재 authority로 연결한다.
- stale link와 conflicting contract를 발견하면 숨기지 않고 수정한다.
- 모든 유지되는 `docs/**/*.md` 문서는 [docs index](docs/README.md)에 직접 연결되어야 한다.
- 상태·metadata·충돌 처리의 상세 규칙은 [Documentation governance](docs/contributing/documentation-governance.md)를 따른다.

## Issue 작성

- 이슈 생성·수정 시 [이슈 작성 규칙](docs/contributing/issues.md)을 먼저 따른다. 웹·CLI·Agent 모두 같은 제목·유형·최소 정보 규칙을 적용한다. 일반 작성 스킬이 저장소 분류나 검토 상태를 임의로 바꾸지 않도록 한다.

## Verification

- Docling 측정·실험은 [고정 변환 결과 재사용 지침](community-plugins/docling/README.md#측정실험용-고정-변환-결과)에 따라 고정본을 재사용하며, 버전·옵션 변경이나 새 문서 추가 외에는 재변환하지 않는다.

- 테스트 작성·확대와 PR 확인은 [테스트 설계 지침](docs/contributing/test-design.md)을 따른다.

- 로컬에서는 변경 영역의 대상 검사를 우선하고, PR의 필수 CI 검사는 모두 통과해야 한다. 문서 전용 변경, 전체 suite와 패키징·플랫폼별 검증의 로컬 실행 기준은 [CONTRIBUTING matrix](CONTRIBUTING.md#verification-matrix)를 따른다. 무관한 테스트 확장·리팩터링은 하지 않는다.
- 테스트 추가 전 기존 보호 범위와 새로 잡을 결함을 확인한다. 기존 테스트 보완을 우선하며, 고유한 보호 가치가 없으면 추가하지 않는다.
- 사용자 동작·공개 계약을 검증하고, 변수명·우연한 마크업 형태·임의의 개수를 고정하지 않는다. 명시적인 의존성 경계는 검증한다.
- 의미 규칙은 Core에서, CLI·브라우저는 각 인터페이스의 고유한 위험과 통합 동작을 검증한다. 같은 결함을 잡는 사례를 계층마다 반복하지 않는다.
- fixture 통과와 실제 제품 성공을 구분한다. 짧은 작업·작은 폴더·localhost·합성 secret의 통과만으로 제품 성공을 선언하지 않고 검증 범위와 미확인 조건을 기록한다.
- 동일 실행 결과로 필요한 검사를 함께 수행한다. 자동 판정에 쓰이지 않는 촬영·촬영 전용 순회는 수동 검토로 분리한다.
- 메인 에이전트·Docling 검수 등 실제 AI 호출로 응답을 확인할 때는 가장 저렴한 모델(현재 Codex `gpt-6-luna`, 추론 강도 `low`)을 쓴다. 특정 모델·추론 강도의 동작 자체를 확인해야 할 때만 예외로 하고 이유를 기록한다. 비서 플러그인 제작 검증은 소유자가 정한 기준 모델인 Codex `gpt-6.1-terra`, 추론 강도 `high`를 쓴다(#1421).

## Browser automation

- 브라우저 검증은 `pnpm browser:test`를 사용한다.
- Windows에서는 재사용 persistent browser profile을 사용하고 디버깅은 기존 session을 재사용한다.
- 설치형 Chrome을 임시 profile, 임시 `--user-data-dir`, 반복 `launch()`로 짧은 간격에 새로 실행하지 않는다.
- 원인, 실행 간 storage 정리와 상세 규칙은 [Windows browser automation](docs/contributing/windows-browser-automation.md)을 따른다.

## Process cleanup

- 작업 완료를 보고하기 전에 이번 작업에서 직접 시작한 임시 프로세스와 세션을 종료하고, background process가 남아 있지 않은지 확인한다. dev server, browser automation session, watcher, 임시 local/test server 등 모든 검증용 프로세스가 대상이다.
- 가능하면 PID, session name 등으로 자신이 시작한 것인지 확인한다. 사용자가 원래 실행 중이던 프로세스는 종료하지 않으며, 이름이나 포트가 같다는 이유로 다른 프로세스를 광범위하게 종료하지 않는다.
- 정리에 실패하면 완료된 것처럼 보고하지 않고, 남아 있는 process/session/port와 이유를 명시한다. 브라우저 runner의 소유권·종료 절차는 [Process and session cleanup](docs/contributing/windows-browser-automation.md#process-and-session-cleanup)을 따른다.

## AI Commit Provenance

Every commit created primarily by an AI coding agent MUST include
machine-readable provenance trailers.

Exception: merge commits created by GitHub's merge queue are platform-generated
and carry no AI trailers. Provenance stays in the PR's own commits, which the
validator checks on `pull_request`. Manually authored merges by an AI agent
(for example, merging master into a PR branch) still require the trailers below.

Required:

```
AI-Agent: <agent>
AI-Model: <provider>/<model>
```

Example:

```
AI-Agent: Grok
AI-Model: xai/grok-4.6
```

Rules:

- Record the AI agent that performed the implementation.
- Record the actual model used for the implementation.
- Use a stable canonical model identifier.
- Keep AI attribution out of the commit subject.
- Do not use `Co-authored-by` as a substitute for AI provenance.
- Never invent the model name.
- Never copy model metadata from previous commits. Verify the actual
  model used for the current implementation.
- Do not add duplicate provenance trailers.
- Put both required trailers exactly once in the final contiguous trailer
  block, separated from the body by one blank line. Never put a blank line
  between trailers. Text that looks like metadata but is outside Git's parsed
  trailer block does not satisfy this policy.
- Write multi-line commit messages through a UTF-8 message file (`git commit
  --file <file>`); do not pass each trailer as a separate `-m` paragraph.
- Immediately after every commit and before push, inspect
  `git log -1 --format='%H%n%(trailers:only)'` and verify Git reads exactly
  one `AI-Agent` and one `AI-Model` with the actual implementation values.
  A visual inspection of the raw message or a successful optional hook is
  insufficient.
- Before approval, reviewers must inspect the final PR commit range with
  Git's parsed-trailer check in CONTRIBUTING, including authored merge commits,
  and confirm the provenance CI check passed for the reviewed head SHA.

`AI-Agent` / `AI-Model` name the agent and model that performed the
implementation. A model that only reviewed the work is not the
implementation model. Review provenance uses a separate, optional
`AI-Reviewed-By` trailer; it is not required by this policy.

Canonical model identifiers, review trailer examples and commit-msg hook
setup are in [CONTRIBUTING](CONTRIBUTING.md#ai-commit-provenance).
