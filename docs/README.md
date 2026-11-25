# Litzio documentation

현재 동작을 확인하려면 Accepted ADR과 Implemented contract를 읽는다. Historical 문서는 당시의 근거이며 현재 요구사항이나 제품 채택 결정이 아니다. 상태의 뜻과 충돌 처리 순서는 [Documentation governance](contributing/documentation-governance.md)에 있다.

이 색인은 자신을 제외한 모든 유지되는 `docs/**/*.md`를 직접 연결한다. `pnpm docs:check`가 누락과 local link/heading anchor를 검사한다. 제품 개요와 사용자 경로는 [README](../README.md), 일반 사용자 설치는 [Windows Desktop](../README.md#windows-desktop), 현재 master 실행은 [Getting started](../README.md#getting-started), CLI 예제는 [Core and CLI](../README.md#core-and-cli)에서 시작한다. 기여와 검증 절차는 [CONTRIBUTING](../CONTRIBUTING.md)이다.

과거 검증 자료의 로컬 계정·PC 이름·개인 경로는 placeholder로 치환하거나 캡처에서 단색으로 가렸다. 측정 수치와 당시 결론은 유지하며, 가려진 캡처는 재촬영한 결과가 아니다.

## Product purpose

| Document | Status | Authority / description |
| --- | --- | --- |
| [리치오의 목적](purpose.md) | Accepted | 문서 중심 업무의 대상과 방향, 문서·비서·플러그인의 관계, 반드시 지킬 것과 지금 하지 않을 것을 정한다. |

## Architecture decisions

| Document | Status | Authority / description |
| --- | --- | --- |
| [ADR-0001: Single-document editor](adr/0001-single-document-editor-architecture.md) | Accepted | 하나의 Tiptap/ProseMirror state가 문서 편집 세션을 소유하며 typed block과 연속 편집을 연결하는 경계를 정한다. |
| [ADR-0002: Persistence and semantic ownership](adr/0002-document-persistence-semantic-ownership.md) | Accepted | plain-text SSOT와 Core의 문서 의미·검증·공식 쓰기 소유권, 교체 가능한 인터페이스의 책임을 정한다. |
| [ADR-0003: Addressing and identity](adr/0003-document-addressing-identity-boundary.md) | Accepted | snapshot locator인 NodePath/sourcePath와 영속 identity의 경계를 정한다. |
| [ADR-0004: Desktop Host and distribution](adr/0004-desktop-host-distribution.md) | Accepted | Windows Electron/NSIS shell, 공용 Host handler 재사용과 사용자 승인 기반 업데이트·배포를 정한다. |
| [ADR-0005: Standalone HTTP Host](adr/0005-http-host.md) | Accepted | 공용 handler를 재사용하는 단일 운영자용 HTTP Host와 Node 배포·접근 범위를 정한다. |
| [ADR-0006: Native document boundary](adr/0006-native-document-boundary.md) | Accepted | 표식과 Core의 전체 의미 검증으로 네이티브 문서를 수용하고 공식 생성·쓰기의 유효성을 보장하는 경계를 정한다. |
| [ADR-0007: Editing session lifetime](adr/0007-editing-session-lifetime.md) | Accepted | 명시적 저장, 원본과 분리된 미저장 작업 복구, 탭별 독립 세션과 공용 저장·버리기·취소 확인을 정한다. 탐색 기억은 경로·순서·활성 탭만 보존한다. |
| [ADR-0008: Citations and bibliography](adr/0008-citations-and-bibliography.md) | Accepted | #327의 승인된 방향. 단위 A·B·C는 Citations 계약으로 구현. MIT BibTeX 입력·Core 제한 IEEE·Root 경계 포함. 단위 D 확장은 각각 별도 결정. #328과의 경계·실행 근거 포함. **2026-10-30 동결:** 기존 동작은 유지하고 새 작업 범위에서는 제외. |
| [ADR-0009: Multiple opened folders](adr/0009-multiple-opened-folders.md) | Accepted | 포함 관계 없는 여러 열린 폴더의 탐색·상위 흡수·하위 reveal, origin별 경로·접힘 기억과 문서의 폴더 맥락을 정한다. |
| [ADR-0010: Supported viewport and input](adr/0010-supported-viewport-and-input.md) | Accepted | 최소 폭 640px의 데스크톱급 창과 키보드·포인터 입력을 지원한다. 모바일·터치 전용 지원은 실제 사용자 확인 뒤 별도로 결정한다. |
| [ADR-0011: Code module boundary](adr/0011-code-module-boundary.md) | Accepted | 모듈의 Core 공개 API 의존 방향, 문서 밖 자료와 얇은 CLI의 책임을 정한다. 실행·화면 연결은 ADR-0020·0022를 따른다. |
| [ADR-0012: Plugin runtime and UI contributions](adr/0012-plugin-runtime-and-ui-contributions.md) | Accepted | 플러그인의 Core 공개 API 사용과 문서 의미·검증·공식 쓰기 소유권을 정한다. 실행·화면 기여는 ADR-0020·0022를 따른다. |
| [ADR-0013: AI 실행 환경](adr/0013-ai-agent-task-service.md) | Accepted | AI 실행과 Core 문서 의미의 소유권을 분리한다. 비서 실행 환경·공식 AI·운영 원칙은 ADR-0014·0017·0021을 따른다. |
| [ADR-0014: Host 소유 비서 연결](adr/0014-main-agent-app-server.md) | Accepted | Host 소유 공급자 프로세스, 기존 Codex 환경 재사용, 앱 데이터 작업 폴더와 공급자 최소 버전·모드 선택을 정한다. |
| [ADR-0015: Shared Host operations](adr/0015-shared-host-operations.md) | Accepted | 새 사용자 기능을 입력·결과·범위·receipt의 Host 공용 작업과 CLI로 함께 제공하며 Core 의미와 화면 상태의 소유권을 분리한다. |
| [ADR-0016: 공유 로컬 daemon Host](adr/0016-shared-local-daemon-host.md) | Accepted | 같은 PC의 공유 daemon 탐색·연결·버전·접근 범위와 주체별 수명, 트레이 유지·명시적 종료·수동 다시 연결을 정한다. 인증은 별도 결정까지 보류한다. |
| [ADR-0017: Desktop 번들 UI와 daemon 공식 AI](adr/0017-bundled-client-and-official-ai.md) | Accepted | daemon 공식 AI의 가용성과 수명, 대상 Host를 아는 클라이언트와 Desktop 번들 UI·origin 경계를 정한다. |
| [ADR-0018: Desktop의 원격 Host 등록과 여러 Host 보기](adr/0018-desktop-remote-hosts.md) | Superseded | 리치오의 목적과 #1595의 단일 로컬 연결 결정으로 대체됐다. |
| [ADR-0019: 공식 플러그인과 커뮤니티 플러그인](adr/0019-plugin-tiers.md) | Accepted | 플러그인의 공식 공급·유지 책임과 공통 SDK·신뢰·Host 실행·자격 증명 소유권을 정한다. 비서는 플러그인과 독립된 제품 기능이다. |
| [ADR-0020: 플러그인 구조와 공통 UI](adr/0020-plugin-architecture.md) | Accepted | 공통 공개 SDK·패키지, Host 하위 프로세스·등록 단위 신뢰·reload·Windows secret과 비서 제작·관리의 공용 작업·CLI 경계를 정한다. |
| [ADR-0021: 범용 에이전트 비서](adr/0021-general-agent-assistant.md) | Accepted | 범용 비서의 원본 직접 수정, CLI·스킬 기본, 공급자 권한과 앱 데이터 작업 폴더를 정한다. 활성 문서의 저장 경로는 메시지에 직접 전달한다. |
| [ADR-0022: 플러그인 화면 코드](adr/0022-plugin-screen-code.md) | Accepted | 플러그인이 React 화면 코드를 제공하고 공통 부품·Core 의미·공식 저장 경로를 사용하는 경계를 정한다. 적용 범위는 같은 PC/개발 Host다. |
| [ADR-0023: 표 칸 줄바꿈과 표 주석](adr/0023-table-inline-breaks-and-notes.md) | Accepted | 직사각형 MyST 표의 인라인 줄바꿈과 표가 소유하는 주석 문단의 저장 형식을 정한다. |

UI 작업은 루트 [DESIGN.md](../DESIGN.md)에서 시작하고, 아래 세부 계약과 결정표에서 표면·공통 구현을 확인한다.

## Current implemented contracts

Implementation record: [UI language #256 plan and verification](design/ui-language-256-plan.md) (Historical; current behavior is defined by Editor UX Shell).

| Document | Status | Authority / description |
| --- | --- | --- |
| [Native document support](design/document-support-v1.md) | Implemented | 네이티브 문서의 표식·지원 의미·Core 진입·생성·쓰기와 정규 직렬화·실패 시 보존을 정의한다. 별도 텍스트 종류의 열기·저장 경계를 포함한다. |
| [Document templates](design/document-templates-v1.md) | Implemented | Core 템플릿 메타데이터, 공용 CLI·Host, 기본 템플릿·갤러리·사용자 저장과 생성 receipt·되돌리기를 정의한다. |
| [비서: 현재 동작 계약](design/main-agent-v1.md) | Implemented | 비서의 공급자·권한·문서 직접 수정·대화·질문·변경 확인·되돌리기와 실행 수명, 현재 한계와 수락 기준을 정의한다. |
| [Parser security boundary](design/parser-security-v1.md) | Implemented | 공개 parse·참조 진단의 보안 경계, URL·inline HTML 패치의 보호 범위와 제거 조건을 정의한다. |
| [Continuous document editing](design/document-editing-v1.md) | Implemented | 연속 편집·selection·history·clipboard와 Core 기반 표·section 구조 변경의 보존 경계를 정의한다. |
| [Editing session and Save](design/editing-session-save-v1.md) | Implemented | opening snapshot과 Save acknowledgement, 미저장 편집·초안·복구 보호, Visual/소스 비교 및 path 기반 탭·기억·복구 식별을 정의한다. |
| [Filesystem Host boundary](design/filesystem-host-boundary-v1.md) | Implemented | Vite·Desktop·HTTP Host가 공유하는 파일·asset·folder 작업과 revision·공식 쓰기 경계를 정의한다. |
| [플러그인 실행·제작 계약](design/plugin-stage1-v1.md) | Implemented | 플러그인 manifest·공개 작업·오류, Node 실행·신뢰·설치·reload·설정·secret·스킬과 CLI·비서 제작 절차를 정의한다. |
| [플러그인 화면 코드](design/plugin-screens-v1.md) | Implemented | React 화면 코드·공통 부품·invoke·receipt, 공식 새 문서 저장·DocumentView(구조를 잠근 내용 편집 포함)·연결 띠·파일/폴더 선택·문서 탭 열기를 정의한다. 화면은 단일 연결의 고정 client와 열린 폴더 범위를 사용한다. |
| [HTTP Host](design/http-host-v1.md) | Implemented | daemon CLI·탐색·수명·상태·버전·Root와 HTTP/Origin·프록시 경계, Desktop의 로컬 연결을 정의한다. |
| [Desktop distribution and updates](design/desktop-distribution-v1.md) | Implemented | Windows Electron/NSIS 패키징·Stable/Beta 업데이트·서명·게시와 로컬 daemon 연결·종료 보호를 정의한다. |
| [Desktop app icon](design/app-icon-v1.md) | Implemented | 승인된 SVG 원본·크기별 ICO, 브랜드 통합·재생성과 픽셀 검사 및 Windows 검증 경계를 정의한다. |
| [Folder picker](design/folder-picker-v1.md) | Implemented | Host 폴더·파일·이미지의 공통 목록 선택·정렬·경로 탐색, 열린 폴더 기억 및 새 문서·폴더 생성의 화면 동작을 정의한다. |
| [Complete app reset](design/app-reset-v1.md) | Implemented | 로컬 앱·Host 소유 데이터의 초기화 범위, writer gate·종료 후 helper·receipt와 CLI를 정의한다. 외부 브라우저·문서·공급자 계정은 제외한다. |
| [Endnotes (MyST footnotes)](design/footnotes-v1.md) | Implemented | 미주 정의의 본문 뒤 첫 참조 순서 배치, 번호·참조 수명·직접 편집·clipboard와 유실 없는 공식 쓰기를 정의한다. |
| [Citations](design/citations-v1.md) | Implemented | ADR-0008 단위 A·B·C. role·선언 보존, Core 번호·제한 IEEE·readiness, CLI/Host 자료 읽기와 파생 References. 슬래시 검색·인용 폼 저작 UI. |
| [Heading numbering](design/heading-numbering-v1.md) | Implemented | Core의 본문 H1–H6 번호, 그림·표·수식의 자동·고정 번호·참조 템플릿과 CLI·Editor 표시 및 쓰기 경계를 정의한다. |
| [Section references](design/section-references-v1.md) | Implemented | 문서 안의 MyST heading label·참조와 Core·CLI·Editor의 대상 변경·표시·미해결 진단을 정의한다. |
| [Table caption and label](design/table-caption-v1.md) | Implemented | 표 칸 줄바꿈, 표 주석·캡션·라벨·참조와 번호, 정규 table directive 저장 및 편집을 정의한다. |
| [Table interaction](design/table-interaction-v1.md) | Implemented | 표 cell·행·열 handle·추가 도구·메뉴, 키보드·history·스크롤과 보존 경계를 정의한다. |
| [Figure authoring](design/figure-authoring-v1.md) | Implemented | pending·image·Mermaid Figure의 Core·CLI 의미와 Editor 원문·미리보기·속성 초안, 정규 저장·readiness 경계를 정의한다. |
| [Editor UX Shell](design/editor-ux-shell-v1.md) | Implemented | 공용 제목 줄·에디터 그룹·탭별 읽기/편집/소스·Sidebar와 초안 유지, 작성 interaction·상태 표시를 정의한다. |
| [Editor Layout Rules](design/editor-layout-rules-v1.md) | Implemented | Editor의 정렬·간격·control 치수와 geometry 검증 기준을 정의한다. |
| [Editor Visual Language — Quiet Document](design/editor-visual-language-v1.md) | Implemented | Editor 토큰·팔레트·서체·표면·테마·상태 표현과 조절 값 규칙을 정의한다. |

## 운영 안내

운영자가 외부 서비스를 준비하고 문제를 진단하는 실행 안내다. 제품 의미·지원 범위는
위 Accepted ADR과 Implemented contract를 따르며, 직접 확인하지 않은 환경은 각 안내에 구분한다.

| Document | Status | Scope |
| --- | --- | --- |
| [패키저용 브랜드 설정](guides/branding.md) | Implemented | 단일 브랜드 설정, 공식 Litzio 기본값, 별도 설치와 고정 Host API·CI 검증 범위. |

## Contribution and documentation governance

| Document | Status | Authority / description |
| --- | --- | --- |
| [제품 용어집](contributing/terminology.md) | Implemented | 화면·문서의 표준 제품 용어와 기술 이름을 정한다. |
| [이슈 작성](contributing/issues.md) | Implemented | 제목·유형·최소 정보 규칙, 공통 정의에서 생성하는 웹 폼, CLI 사전 검사와 GitHub 등록 후 검사. |
| [테스트 설계와 PR 확인](contributing/test-design.md) | Implemented | 테스트 작성·확대의 8개 원칙, 예외 기준과 PR 기록·확인 절차. |
| [Documentation governance](contributing/documentation-governance.md) | Implemented | 현재 작업 규칙. 문서 authority, status, metadata와 갱신 절차. |
| [Dependency patch register](contributing/dependency-patches.md) | Implemented | 현재 로컬 패치의 사유·제거 조건·보호 테스트와 등록 대응 검사. |
| [Windows browser automation](contributing/windows-browser-automation.md) | Implemented | 현재 실행 규칙. persistent profile, storage 격리와 process cleanup. |

[AGENTS.md](../AGENTS.md)는 저장소 전체 제약, [CONTRIBUTING.md](../CONTRIBUTING.md)는 setup·검증 matrix·PR 절차의 진입점이다.

## UI 선택과 반복 패턴

| Document | Status | Authority / description |
| --- | --- | --- |
| [UI decision table and gallery](design/ui-decision-table-v1.md) | Implemented | 에이전트의 표면·공통 구현 선택 기준과 개발 전용 갤러리 사용법을 정한다. 배치·표현·반복 동작의 규범은 Layout Rules·Visual Language·UI Patterns가 소유한다. |
| [UI patterns](design/ui-patterns-v1.md) | Implemented | 반복 UI의 현재 기준 구현·사용처와 알려진 불일치·후속 이슈 및 다른 화면 확인 규칙을 정의한다. |

## Historical reviews and spikes

[#204 document tabs implementation and review](reviews/document-tabs-204-2026-10-16.md) records the final tab step's scope, visual evidence, measurements and verification.

- [Block source editing](design/block-source-editing-v1.md) — Superseded by Native document support.

| Document | Status | Authority / description |
| --- | --- | --- |
| [비서 완수 측정과 PowerShell 조사](reviews/2026-11-14-assistant-completion.md) | Historical | #1565 실제 Codex 13과제·Copilot 1회와 제한 실행 비교. |
| [저장소 종합 정리 기록 2026-11-13~14](reviews/2026-11-14-repository-cleanup.md) | Historical | 삭제·보강·측정과 남은 확인 과제의 기록. 현재 계약이 아님. |
| [#1462 원문 증거 대응 spike ①](reviews/1462-spike-evidence-match.md) | Historical | PDF 텍스트↔문서 양방향 후보 탐지. 주입 오류 탐지와 holdout 오경보 기준 미달을 보존한 오프라인 실험. |
| [#1462 블록 정체성 spike ②](reviews/1462-spike-block-identity.md) | Historical | 경로 갱신 A와 MyST target B 비교. 시험한 연산의 대응·저장 근거와 Core 단독 B의 실패 경계. |
| [UI pattern inventory and target proposals #777](reviews/ui-pattern-inventory-777.md) | Historical | 1단계의 25개 사용처·12개 패턴·실제 캡처·대안·소유자 질문을 보존. 확정 목표와 불일치 추적은 [UI patterns](design/ui-patterns-v1.md)를 따른다. |
| [Editor UX review and improvements](reviews/editor-ux-review-2026-10-17.md) | Historical | 2026-10-17 실제 Editor UX 평가 결과와 v4.7 변경(위치 표시, 표·메타데이터 배치, 좁은 화면 사이드바, 비네이티브 파일 표시 등), 테스트 변경과 검증. |
| [Design consolidation proposal](reviews/design-consolidation-2026-10-26.md) | Historical | #507 실제 1440/390px·한영 computed-style 조사, 공용 컨트롤·선택·메뉴·색 규칙과 최소 guard 제안, 네 가지 소유자 결정용 시안. 제품 코드·현재 계약 변경 없음. |
| [Folder dialog owner-decision mockups](reviews/folder-dialog-2026-10-26.md) | Historical | #522 한국어 현재/A/B의 1440×900·390×844 비교 6장, 문구·동작 계약 경계·위험과 A안 권고. 제품 코드·현재 계약 변경 없음. |
| [Editor guard performance](reviews/editor-guard-performance-2026-10-23.md) | Historical | Snapshot lookup CPU comparison, actual UI latency and large-document Save/Reload evidence; provisional responsiveness targets remain unmet. |
| [Mixed document input performance](reviews/editor-input-performance-2026-10-25.md) | Historical | #362 bounded Windows profiling, input measurements and canonical preservation evidence. |
| [Editor shell #176 plan and verification](reviews/editor-shell-176-2026-10-13.md) | Historical | #176 Files/Display sidebar and File actions: approved scope, state preservation, actual Before/After and verification limits. |
| [Desktop app icon selection](design/app-icon-v1-plan.md) | Historical | #170 GitHub 브랜드 확인과 B안(날개와 문서) 선택 기록. 현재 계약은 Desktop app icon. |
| [Litzio reduction verification](reviews/reduction-2026-10-10.md) | Historical | C01–C15 감량 판단, 변경 단위와 실제 검증·측정 근거. |
| [Native document boundary implementation](reviews/native-boundary-2026-10-14.md) | Historical | #232 제거 범위, 유지한 검증 책임, 구현 중 회귀와 테스트 계측. |
| [Worker model comparison on #216](reviews/worker-model-comparison-2026-10-15.md) | Historical | #216을 Codex 작업자 8개 설정으로 재구현한 1회 비교와 발견한 결함(#308). 모델 배정 규칙이 아님. |
| [Open File removal verification](reviews/open-file-removal-2026-10-12.md) | Historical | #190 시작 화면·폴더 메뉴 Before/After와 파일 탐색·작업 보호 검증 경계. |
| [Footnote region verification](reviews/footnote-regions-2026-10-12.md) | Historical | #185 원문 위치의 각주 구역 Before/After, 좁은 화면과 원문·편집·복사·저장 보존 검증. |
| [Endnotes verification](reviews/endnotes-2026-10-12.md) | Historical | #194 단일 미주 구역 Before/After, 원문 보존·명시적 변환·참조 복귀·초안 보호 검증. |
| [Single Editor Foundation review](reviews/single-editor-foundation.md) | Historical | 당시 architecture 검토 근거. 현재 authority는 ADR-0001과 design contracts. |
| [AI agent host and extension patterns](reviews/ai-agent-host-patterns-2026-11.md) | Historical | #877 공개 문서·소스 조사. AI 작업/도구·업체 어댑터·검증·승인·수명·다중 에이전트 8개 축과 B 최소 골격 시사점. 설계·채택 결정 아님. |
| [MyST security alignment review](reviews/myst-security-alignment-v1.md) | Historical | 당시 security 분석. 현재 후속 작업은 issue #11; 현재 안전성의 영구 보증이 아님. |
| [Desktop shell spike](reviews/desktop-shell-spike-v1.md) | Historical | 실행 가능성과 비용의 실험 근거. 제품 Host·배포 결정이 아님. |
| [VS Code host spike](reviews/vscode-host-spike-v1.md) | Historical | provider와 저장 모델의 실험 근거. 제품 Host 결정이 아님. |
| [Quiet Document v1 visual review](design/editor-visual-refinement-v1-review.md) | Historical | 당시 실제 capture·측정 근거. 현재 규범은 Visual Language와 Layout Rules. |
| [Editor Visual Language history through 2026-10-30](reviews/editor-visual-language-history-2026-10-30.md) | Historical | #785에서 분리한 이슈별 검증·캡처와 원문 snapshot. 현재 규칙의 authority가 아니다. |
| [Static UI v3 visual verification](reviews/static-ui-v3-2026-10-08.md) | Historical | 2026-10-08 실제 제품 Before/After, 상태·대비·폰트·회귀 검증 근거. 현재 규범은 [Visual Language](design/editor-visual-language-v1.md). |
| [Pretendard self-hosting verification](reviews/pretendard-2026-10-09.md) | Historical | 자체 호스팅 폰트의 실제 사용, production 자산과 본문·UI 줄바꿈 비교. 현재 규범은 Visual Language. |
| [Inline math size verification](reviews/inline-math-size-2026-10-09.md) | Historical | 인라인 수식 크기 후보 비교, 실제 Before/After와 테스트 클릭 지점. 현재 규범은 Visual Language. |
| [ProseMirror focus restore and caret keys](reviews/prosemirror-focus-caret-2026-10-09.md) | Historical | 포커스 직후 caret 키가 되돌려지던 원인, `prosemirror-view@1.42.4` 패치의 적용 버전·전후 검증·제거 조건. 현재 계약은 Continuous editing. |
| [Persistent Figure Draft spike](reviews/persistent-figure-draft-spike-v1.md) | Historical | 콘텐츠 없는 Figure의 MyST 표현·공식 번호/참조·Core/Editor PoC 근거와 CONDITIONAL GO 권고. 현재 Figure 계약은 Document support와 Editing session. |

| [editor-ux-shell-v1 검증 이력](reviews/editor-ux-shell-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [editing-session-save-v1 검증 이력](reviews/editing-session-save-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [document-editing-v1 검증 이력](reviews/document-editing-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [desktop-distribution-v1 검증 이력](reviews/desktop-distribution-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [filesystem-host-boundary-v1 검증 이력](reviews/filesystem-host-boundary-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [citations-v1 검증 이력](reviews/citations-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [figure-authoring-v1 검증 이력](reviews/figure-authoring-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |
| [README 검증 이력](reviews/verification-history-2026-11.md) | Historical | #1595에서 현재 계약과 분리한 과거 검증·측정·캡처 기록. |

## Spike log

스파이크의 목적·결과·결론과 코드 위치(원격 브랜치와 태그)를 남기는 기록이다. 정책과 색인은 [스파이크 기록](spikes/README.md)을 따른다. 스파이크 코드는 master에 없고 현재 계약이 아니다.

| Document | Status | Authority / description |
| --- | --- | --- |
| [스파이크 기록](spikes/README.md) | Historical | 정책, 이름 규칙, 전체 색인. |
| [2026-10-28 Codex app-server 기반 AI 질의응답과 변경 제안](spikes/2026-10-28-codex-ai.md) | Historical | 스파이크 기록. 결론: 채택(일부). 코드는 태그·브랜치에만 있다. |
| [2026-10-28 Draw.io 편집 연동 (.drawio.svg 그림)](spikes/2026-10-28-drawio-embed.md) | Historical | 스파이크 기록. 결론: 보류. 코드는 태그·브랜치에만 있다. |
| [2026-10-30 CLI 기반 AI 보고서 작성과 채팅 탭](spikes/2026-10-30-ai-report.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-10-30 Docling 변환 대조 보기](spikes/2026-10-30-docling-compare.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-10-31 Docling 플러그인 런타임 (신뢰된 worker)](spikes/2026-10-31-docling-plugin-runtime.md) | Historical | 스파이크 기록. 결론: 보류. 코드는 태그·브랜치에만 있다. |
| [2026-10-31 Docling 플러그인 UI 기여](spikes/2026-10-31-docling-plugin-ui.md) | Historical | 스파이크 기록. 결론: 보류. 코드는 태그·브랜치에만 있다. |
| [2026-11-01 AI 에이전트 블록 제안 워크플로 (플러그인)](spikes/2026-11-01-ai-agent-proposal.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-03 편집 중인 블록 표시 세 시안 (#1022)](spikes/2026-11-03-1022-editing-block-indicator.md) | Historical | 스파이크 기록. 결론: 채택(gutter 계열). 코드는 태그·브랜치에만 있다. |
| [2026-11-03 문서 보고서와 문서형 앱 표 비교 (#1041)](spikes/2026-11-03-1041-document-style.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-04 S1: Desktop을 인증된 공유 daemon에 연결 (#834)](spikes/2026-11-04-834-s1-desktop-daemon.md) | Historical | 스파이크 기록. 결론: 채택(방향). 코드는 태그·브랜치에만 있다. |
| [2026-11-04 템플릿 갤러리 화면 대안 (#936)](spikes/2026-11-04-936-template-gallery.md) | Historical | 스파이크 기록. 결론: 채택. 코드는 태그·브랜치에만 있다. |
| [2026-11-05 동적 UI: 생성 UI와 저장 뷰를 같은 렌더러로](spikes/2026-11-05-dynamic-ui.md) | Historical | 스파이크 기록. 결론: 폐기. 코드는 태그·브랜치에만 있다. |
| [2026-11-06 동적 UI 인터뷰 → 흐름도 → 보고서](spikes/2026-11-06-dynamic-interview-flow.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-10 비서와 플러그인 만들기](spikes/2026-11-10-assistant-plugin-builder.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-11 #1462 검증 실험 ②: 교정 후 원본 대응과 텍스트 블록 ID](spikes/2026-11-11-1462-block-identity.md) | Historical | 스파이크 기록. 결론: 채택(방식 A). 코드는 태그·브랜치에만 있다. |
| [2026-11-11 #1462 검증 실험 ①: 독립 PDF 텍스트 증거와 문서 대응](spikes/2026-11-11-1462-evidence-match.md) | Historical | 스파이크 기록. 결론: 채택(보조 후보 탐지만). 코드는 태그·브랜치에만 있다. |
| [2026-11-11 문서 작성 안내 투어](spikes/2026-11-11-guided-tour.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-11 요구사항 추적과 ReqIF 내보내기](spikes/2026-11-11-requirements-traceability.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-12 검토 패널 배치 세 시안 (#1462)](spikes/2026-11-12-1462-review-panel.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-13 공정 분석기 (생산 라인 검사 데이터 그래프·공정 능력)](spikes/2026-11-13-process-analyzer.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-19 Activity Bar 최종 형태 세 시안 (#1812)](spikes/2026-11-19-activity-bar.md) | Historical | 스파이크 기록. 결론: 채택(시안 1 방향, 후속 1-L로 구체화). 코드는 태그·브랜치에만 있다. |
| [2026-11-19 Activity Bar 시안 1 후속: 이름 표시와 고유 아이콘 (#1812)](spikes/2026-11-19-activity-bar-labels.md) | Historical | 스파이크 기록. 결론: 채택(1-L). 코드는 태그·브랜치에만 있다. |
| [2026-11-23 비서의 두 연결 뒤 모델을 Ollama 로컬 모델로 바꾸기](spikes/2026-11-23-ollama-local-model.md) | Historical | 스파이크 기록. 결론: 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-23 공용 빈 화면 안내의 점선·바탕 비교](spikes/2026-11-23-empty-state-plain.md) | Historical | 스파이크 기록. 결론은 채택(안 A). |
| [2026-11-24 Ollama 공급자의 실행 엔진을 pi(ACP 어댑터)로 바꾸기](spikes/2026-11-24-ollama-pi-audio.md) | Historical | 스파이크 기록. 결론: 폐기. 코드는 태그·브랜치에만 있다. |
| [2026-11-24 Ollama 공급자의 Codex 엔진 연결과 음성 전달](spikes/2026-11-24-ollama-codex-audio.md) | Historical | 스파이크 기록. 결론 폐기. 코드는 태그·브랜치에만 있다. |
| [2026-11-25 Ollama 비서의 PDF 수식 교체](spikes/2026-11-25-ollama-formula-mission.md) | Historical | 스파이크 기록. 결론 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-25 Ollama 비서의 소형 모델 과제 범위](spikes/2026-11-25-ollama-small-model-range.md) | Historical | 스파이크 기록. 결론 미정. 코드는 태그·브랜치에만 있다. |
| [2026-11-25 플러그인 제작에서 화면 시안 먼저 보여 주기](spikes/2026-11-25-plugin-authoring-prototype-first.md) | Historical | 질문·계획 먼저와 화면 시안 먼저를 합성 과제로 비교한 기록. 결론 미정. |
| [2026-11-25 비서의 변환 문서 검수와 반영](spikes/2026-11-25-assistant-review-converted-document.md) | Historical | 합성 PDF 대조·수정의 요소별 결과와 정상 요소 손상 측정. 결론 미정. |
| [2026-11-25 비서의 변환 문서 검수와 낮은 추론 강도](spikes/2026-11-25-assistant-review-low-effort.md) | Historical | 기존과 동일한 합성 문서에서 추론 강도 low의 발견·반영·기존 정답 손상과 시간을 비교했다. 결론 미정. |
| [2026-11-25 정답을 제공한 비서의 변환 문서 수정](spikes/2026-11-25-assistant-review-with-answer.md) | Historical | 고칠 곳 목록과 원본 정답 JSON을 전달한 두 조건의 저장본 점수·기존 정답 손상을 기록한다. 결론 미정. |
| [2026-11-25 큰 문서의 국소 정규 쓰기](spikes/2026-11-25-local-canonical-write.md) | Historical | 변경 블록과 이웃을 다시 읽는 후보의 동등성, 적격률 및 비용을 비교했다. 결론 미정. |

## Verification

- [v0.0.3-beta.1 배포·검증 기록](releases/v0.0.3-beta.1.md) — Historical. Beta 공개·세 workflow와 게시 전 tag 재지정·자산 해시·한국어 본문. 실제 GitHub 설치·업데이트 미검증.

- [v0.0.2 배포·검증 기록](releases/v0.0.2.md) — Historical. 서명 없는 Stable 공개·tag 이동·workflow 실패와 재실행·자산 해시·한국어 본문. 실제 GitHub 설치·업데이트와 SmartScreen 미검증.

- [v0.0.2-beta.10 배포·검증 기록](releases/v0.0.2-beta.10.md) — Historical. Beta 공개 결과·첫 unsigned-beta 실행 성공·공개 자산 해시·한국어 Release 본문. 오케스트레이터 확인 근거와 실제 GitHub 설치·업데이트 미검증 범위.
- [v0.0.2-beta.9 배포·검증 기록](releases/v0.0.2-beta.9.md) — Historical. #1388 공개 결과·SDK 0.3.0 동시 공개. 첫 unsigned-beta 실행 성공·공개 자산 해시·한국어 Release 본문과 실제 GitHub 설치·업데이트 미검증 범위.
- [v0.0.2-beta.8 배포·검증 기록](releases/v0.0.2-beta.8.md) — Draft. #1216 준비 후보·사용자 변경과 알려진 제한. 공개·배포 검증은 대기.
- [v0.0.2-beta.7 배포·검증 기록](releases/v0.0.2-beta.7.md) — Historical. #1171 verify·unsigned-beta 성공과 공개 자산·manifest 대조. 실제 GitHub 설치·업데이트는 미실행·미검증.
- [v0.0.2-beta.6 배포·검증 기록](releases/v0.0.2-beta.6.md) — Historical. #1088 첫 배포 실행 성공·공개 자산 해시·실제 한국어 Release 본문. LIVE harness 실행 가능하나 실제 GitHub 설치·업데이트는 미실행·미검증. 제3자 고지 R1은 beta.6 보완과 beta.5 Release 안내로 정리(2026-11-04).

- [v0.0.2-beta.5 배포·검증 기록](releases/v0.0.2-beta.5.md) — Historical. #926 공개 결과, 미공개 두 시도와 세 번째 게시 성공·자산 해시·한국어 Release 본문. 브랜드 변경에 따른 새 설치·데이터 미이전, 실제 GitHub 설치·업데이트 미검증.

- [v0.0.2-beta.4 release and verification record](releases/v0.0.2-beta.4.md) — Historical; #758 unsigned Beta 공개, 첫 배포 시도 성공·공개 자산 해시·한국어 Release 본문과 준비 단계 기록. #757 그림 속성 팝오버·#760 본문 클릭 입력 복구 포함. 실제 GitHub beta.3→beta.4 업데이트는 설치 상태 보존 제약으로 미실행·미검증.

- [v0.0.2-beta.3 release and verification record](releases/v0.0.2-beta.3.md) — Historical; #690 unsigned Beta 공개, 첫 배포 시도 성공·공개 자산 해시·한국어 Release 본문과 준비 단계 기록. 실제 GitHub beta.2→beta.3 업데이트는 설치 상태 보존 제약으로 미실행·미검증.

- [v0.0.2-beta.2 release and verification record](releases/v0.0.2-beta.2.md) — Historical; #659 unsigned Beta 공개, 첫 배포 시도 성공·공개 자산 해시·한국어 Release 본문과 merge_group 성공/master push 실패 기록. 실제 GitHub beta.1→beta.2 업데이트는 소유자 결정으로 미검증.
- [v0.0.2-beta.1 release and withdrawal record](releases/v0.0.2-beta.1.md) — Historical; #632 버전 정정 배포, 공개 자산 해시, 최초 간헐 실패와 1회 재실행, 기존 두 Release·자산·원격 tag 철회. 실제 GitHub 설치/업데이트는 미검증.
- [v0.1.0-beta.2 release and verification record](releases/v0.1.0-beta.2.md) — Historical; #632에서 Release·자산·원격 tag 철회. 당시 unsigned Windows Beta 공개·한국어 릴리스 노트·하위 호환성 비보장·CI·자산 해시와 미게시 tag 이동 경위 보존. 실제 GitHub beta.1→beta.2 업데이트는 소유자 결정으로 이번 릴리스에서 미검증.
- [v0.1.0-beta.1 release and verification record](releases/v0.1.0-beta.1.md) — Historical; #632에서 Release·자산·원격 tag 철회. 당시 unsigned Windows Beta 자산·CI·실제 GitHub 0.0.1-beta.4→0.1.0-beta.1 업데이트·하네스 검증과 제한 보존.
- [v0.0.1-beta.4 release and verification record](releases/v0.0.1-beta.4.md) — Historical; 네이티브 문서 전환 호환성 안내, 공개 자산, CI, 실제 GitHub beta.3→beta.4 업데이트와 알려진 제한.
- [v0.0.1-beta.3 release and verification record](releases/v0.0.1-beta.3.md) — Historical; 공개 자산, CI, 실제 GitHub beta.2→beta.3 업데이트와 알려진 제한.
- [v0.0.1-beta.2 release and verification record](releases/v0.0.1-beta.2.md) — Historical; 공개 자산, CI와 실제 GitHub 업데이트 검증 근거.

| Document | Status | Authority / description |
| --- | --- | --- |
| [Verification entrypoint](test/README.md) | Implemented | 현재 검증 안내. 자동·browser·manual 실행과 fixture 보호. |
| [Test Guide](test/TEST_GUIDE.md) | Implemented | 현재 실행/수동 검토 절차. 테스트 이름·개수의 원본은 runner. |

| [비서 플러그인 제작 예행연습](reviews/plugin-authoring-rehearsal-2026-11.md) | Historical | Windows 실제 Codex Luna low·Sol 기본 low 비교, 최초 시험 구성 실패와 재시험·스킬 보강 근거. |

- [플러그인 화면 코드 단계별 측정](reviews/plugin-screen-code-1592.md) — Historical. 1단계 실제 AI 6턴과 2단계 제작·설치 시험, 도구 크기·속도와 화면 확인 경계.
- [v0.0.3-beta.2 배포·검증 기록](releases/v0.0.3-beta.2.md) — Historical. 공개 Beta·공식 workflow·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미검증.

- [표 커서 도구 배치 스파이크](spikes/2026-11-14-1481-table-cursor-tools.md) — Historical, 채택(배치 방향), #1481.
- [Windows packed CLI 검사 예산 측정](reviews/windows-packed-cli-budget-2026-11.md) — Historical. #1645의 성공·실패 queue 단계 시간과 cold npm 준비 비용, 검사 구간 분리 근거.

- [v0.0.3-beta.3 배포·검증 기록](releases/v0.0.3-beta.3.md) — Historical. 공개 Beta·workflow·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미실행·미검증.

- [v0.0.3-beta.4 배포·검증 기록](releases/v0.0.3-beta.4.md) — Historical. 공개 Beta·workflow·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미실행·미검증.

- [v0.0.3-beta.5 배포·검증 기록](releases/v0.0.3-beta.5.md) — Historical. 공개 Beta·workflow·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미실행·미검증.

- [v0.0.3-beta.6 배포·검증 기록](releases/v0.0.3-beta.6.md) — Historical. 공개 Beta·workflow·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미실행·미검증.

- [v0.0.4-beta.1 배포·검증 기록](releases/v0.0.4-beta.1.md) — Historical. 공개 Beta·워크플로·자산 해시와 한국어 본문. 실제 GitHub 설치·업데이트는 미실행·미검증.

- [v0.0.3 배포·검증 기록](releases/v0.0.3.md) — Historical. 2026-11-23 공개한 서명 없는 Stable, 0.0.2 이후 사용자 영향별 변경, 자산 해시, 수동 확인 안내와 게시한 한국어 Release 본문. Beta 없이 낸 beta.6 이후 변경과 실제 IME·GitHub 설치·업데이트는 미확인.
