# Litzio documentation

현재 동작을 확인하려면 Accepted ADR과 Implemented contract를 읽는다. Historical 문서는 당시의 근거이며 현재 요구사항이나 제품 채택 결정이 아니다. 상태의 뜻과 충돌 처리 순서는 [Documentation governance](contributing/documentation-governance.md)에 있다.

이 색인은 자신을 제외한 모든 유지되는 `docs/**/*.md`를 직접 연결한다. `pnpm docs:check`가 누락과 local link/heading anchor를 검사한다. 제품 개요와 사용자 경로는 [README](../README.md), 일반 사용자 설치는 [Windows Desktop](../README.md#windows-desktop), 현재 master 실행은 [Getting started](../README.md#getting-started), CLI 예제는 [Core and CLI](../README.md#core-and-cli)에서 시작한다. 기여와 검증 절차는 [CONTRIBUTING](../CONTRIBUTING.md)이다.

## Architecture decisions

| Document | Status | Authority / description |
| --- | --- | --- |
| [ADR-0001: Single-document editor](adr/0001-single-document-editor-architecture.md) | Accepted | 현재 architecture 규범. 하나의 Tiptap/ProseMirror state가 문서 편집 세션을 소유한다. |
| [ADR-0002: Persistence and semantic ownership](adr/0002-document-persistence-semantic-ownership.md) | Accepted | 현재 architecture 규범. plain-text SSOT와 Core semantic/write ownership. |
| [ADR-0003: Addressing and identity](adr/0003-document-addressing-identity-boundary.md) | Accepted | 현재 architecture 규범. snapshot locator와 persistent identity의 경계. |
| [ADR-0004: Desktop Host and distribution](adr/0004-desktop-host-distribution.md) | Accepted | Windows Electron/NSIS Host, 기존 handler 재사용과 사용자 승인 기반 업데이트/배포. |
| [ADR-0005: Standalone HTTP Host](adr/0005-http-host.md) | Accepted | 복수 허용 Root와 Node 배포물, 기존 handler를 재사용하는 단일 운영자용 HTTP Host. |
| [ADR-0006: Native document boundary](adr/0006-native-document-boundary.md) | Accepted | 승인된 제품·문서 지원 경계. 표식과 Core 검증을 통한 네이티브 문서 수용, 범용 부분 편집·소스 교체 폐지. 구현 계약은 아래 Native document support를 따른다. |
| [ADR-0007: Editing session lifetime](adr/0007-editing-session-lifetime.md) | Accepted | 승인된 방향. 명시적 저장(자동 저장은 보류, #297), 원본과 분리된 미저장 작업 복구, 탭별 독립 세션, 경로·순서·활성 탭만 기억하는 탐색 복원(#380), 공용 저장/저장하지 않음/취소 확인. 현재 시작 우선순위·닫기·클라이언트 복구와 실제 Host 검증의 경계는 Editing session and Save를 따른다. |
| [ADR-0008: Citations and bibliography](adr/0008-citations-and-bibliography.md) | Accepted | #327의 승인된 방향. 단위 A·B·C는 Citations 계약으로 구현. MIT BibTeX 입력·Core 제한 IEEE·Root 경계 포함. 단위 D 확장은 각각 별도 결정. #328과의 경계·실행 근거 포함. **2026-10-30 동결:** 기존 동작은 유지하고 새 작업 범위에서는 제외. |
| [ADR-0009: Multiple opened folders](adr/0009-multiple-opened-folders.md) | Accepted | #235 / #425 / #582 / #702. 포함 관계 없는 루트와 상위 흡수·하위 reveal, origin별 폴더 섹션 접힘 기억과 폴더 줄의 작업 진입점, 순서 있는 여러 폴더, 경로만 브라우저 환경설정으로 복원, 문서 폴더 맥락은 가장 바깥쪽 열린 폴더. #582가 #385의 헤더 진입점 배치를 대체. Workspace 파일·Host 상태 없음. |
| [ADR-0010: Supported viewport and input](adr/0010-supported-viewport-and-input.md) | Accepted | 2026-10-27 소유자 결정. 지원 최소 폭 640px의 데스크톱급 창과 키보드·포인터 입력. 휴대폰·터치 전용 지원은 실제 사용자 확인 후 별도 결정. 정리 작업은 #602. |
| [ADR-0011: Code module boundary](adr/0011-code-module-boundary.md) | Accepted | 첫 모듈의 패키지 위치, 모듈 → Core 공개 API 의존, 문서 밖 데이터와 얇은 CLI. 정적 연결·등록/동적 로딩 금지와 process-local 전용 작업 상태는 ADR-0012로 일부 Superseded. |
| [ADR-0012: Plugin runtime and UI contributions](adr/0012-plugin-runtime-and-ui-contributions.md) | Accepted | 2026-10-31 소유자 승인. 실행 중 Host 연결 없는 공용 설치 폴더, 별도 worker, 같은 origin의 검증된 ESM/CSS와 좁은 UI API, 동적 기여·drain·비활성 탭, UUID·uncertain·완료 결과 공개. ADR-0017로 해당 플러그인·Docling 기능과 공개 API를 제거하고 archive/plugins-docling-2026-11에 보관했다. 기존 승인 기록이며 현재 플러그인 제공 계약이 아니다. |
| [ADR-0013: AI agent task service](adr/0013-ai-agent-task-service.md) | Accepted | 2026-11-02 소유자 승인. #880 AI 작업 서비스, Host 중개 작업 메시지. 기본 포함 AI 플러그인 결정은 ADR-0017의 공식 기능으로 개정. 기능·추론 역할 분리와 자료 스냅샷. 전용 Codex 홈 격리의 유예와 도입 조건 포함. |
| [ADR-0014: Main agent app-server](adr/0014-main-agent-app-server.md) | Accepted | #931 Host 소유 stdio 연결, 사용자 Codex 환경 재사용, 앱 데이터 cwd, provider 이름만 전제한 구조와 ADR-0013 조건 2 변경. 연결·설정·대화의 소유권과 후속 문서 작성 기능의 경계. |
| [ADR-0015: Shared Host operations](adr/0015-shared-host-operations.md) | Accepted | 2026-11-04 #1132 소유자 승인. 새 사용자 기능의 입력·결과·범위·receipt 공용 정의와 CLI 필수, 필요 시 비서 도구. #1128 첫 사례와 동시 편집 대비 경계. 로컬 daemon 자동 탐색·연결·수명은 ADR-0016으로 개정하고 편집 상태 공유는 보류. |
| [ADR-0016: 공유 로컬 daemon Host](adr/0016-shared-local-daemon-host.md) | Accepted | 2026-11-04 #1142 소유자 결정 ①~⑥. 인증 보류(#1145)·단일 인스턴스·버전·수명·Root·휴지통·샘플·origin, PR1~PR4. PR4에서 플러그인·AI daemon 수명과 테스트 복구로 기간 한정 예외 종료; 필수 CI 전체 통과로 1단계 완료·해당 릴리스 중단 해제. 구현 계약은 HTTP Host/Desktop distribution과 공식 AI Main agent. Plugin runtime은 ADR-0017로 제거·보관했다. 공유 편집은 보류. |
| [ADR-0017: Desktop 번들 UI와 daemon 공식 AI](adr/0017-bundled-client-and-official-ai.md) | Accepted | #1150 소유자 결정. 공식 AI·프로바이더 가용성·설정 CLI, 플러그인·Docling 기능 제거·직전 master 원격 보관, Host 클라이언트·번들 UI 전환. 소유자 개시 시 컨셉 재개발. 1단계·코어 전환 전 릴리스 금지, 이후 플러그인 없는 제품 릴리스는 소유자 결정. ③a·③b 구현: 공식 AI·설정 CLI와 플러그인/Docling 삭제. ④ Host 클라이언트·⑤ 앱 번들 UI와 정확한 Desktop origin 허용 구현. |
| [ADR-0018: Desktop의 원격 Host 등록과 여러 Host 보기](adr/0018-desktop-remote-hosts.md) | Accepted | #1174 소유자 결정 ①~⑨. Desktop 로컬 등록·hostId·원격 자동 연결/재연결, Host별 탐색기·탭·필터·비서, 공용 작업·CLI·CSP 재시작 보호. ADR-0016·0017의 원격 보류 개정. PR1은 로컬 Host 식별·탭/폴더 기억·복구 격리 구현. PR2는 Host별 요청·상태·capability와 비서/템플릿 대상 고정, 두 Host fixture 검증. PR4는 Host별 탐색기·필터·탭과 비서 선택/고정, 로컬 OS 기능 경계를 구현하며 브라우저 fixture로 확인한다. PR3 등록·Settings·보호된 재시작 통합과 PR4를 포함한 PR0~4(#1175~#1180)가 완료했다. #1180의 필수 CI 성공 확인(2026-11-05); 실제 Windows→Linux 연결은 미검증. 템플릿 갤러리 진입은 로컬 전용이다. |
| [ADR-0019: 공식 플러그인과 커뮤니티 플러그인](adr/0019-plugin-tiers.md) | Accepted | 2026-11-05 소유자 개념 결정. 공식 공급·유지 책임, 공통 manifest·SDK·권한, 커뮤니티 실행 차단·명시 신뢰, Host 실행·자격 증명, 번들 UI·공용 작업·CLI. ADR-0012 개정·0017 보완이며 구현 재개·보류 해제 아님. 비서는 제품 기능, Docling은 재개 시 커뮤니티 계층. |
| [ADR-0020: 플러그인 구조와 공통 생성 UI·저장 뷰](adr/0020-plugin-architecture.md) | Accepted | 2026-11-05 소유자 구조 결정. ADR-0019 구체화: 공통 SDK·manifest, 공식 monorepo/커뮤니티 독립 저장소·공식 공급 목록, 대상 daemon 하위 프로세스 신뢰 코드+reload·Windows OS secret, 최소 기여·공용 작업/CLI·건별 승인 대신 활동 기록을 남기는 비서 관리. 생성 UI와 저장 뷰는 같은 명세·앱 렌더러, `.view.json` 수동 재조회·별도 `.snapshot.json`. 구조 승인과 구현 착수는 별개. 생성 UI 스파이크 보완: 명세만 열기·수동 조회, 작업별 필드 제한, 설정 이전 보류·항상 있는 기본 UI와 동적 UI 참여 후보·즐겨찾기 추가/목록 불러오기·Core 한정 가공 (나) 확정, 비서 양 공급자 연결·새 파일 안전 생성의 후속 범위, 사용자 모델 선택·CopilotKit 개념만 차용. OneDrive 개시·구현은 별도 1단계 계약 참조. 비서 제작 로드맵 개정: 병렬 기반·목업 Jira 제작·카탈로그 v2(K2~K4)·Docling, K1·제작 키트·페이지 이미지 좌우 대조와 단계별 수락 기준. 카탈로그 v2 새 API·동작 개정 절은 Proposed이며 기존 Accepted 결정과 구분. |

## Current implemented contracts

Implementation record: [UI language #256 plan and verification](design/ui-language-256-plan.md) (Historical; current behavior is defined by Editor UX Shell).

| Document | Status | Authority / description |
| --- | --- | --- |
| [Native document support](design/document-support-v1.md) | Implemented | 현재 계약. 표식·지원 의미·Core 진입/생성/쓰기 경계와 LF/fail-closed 보존. #817 별도 텍스트 종류·저장 경계. |
| [Document templates](design/document-templates-v1.md) | Implemented | #936 1–3단계. Core template 메타데이터·생성, 공용 CLI/Host, ko/en 기본 2종, Editor 카드 갤러리·사용자 저장. #1128 공용 작업·Codex 템플릿 도구·생성 receipt/Undo와 child CLI PATH. |
| [Assistant connection, settings and conversations](design/main-agent-v1.md) | Implemented | #931 연결·설정·대화: Codex app-server / Copilot ACP, 모델·진단·공통 환경, 무발화 작업의 AI 기본 언어, @·Explorer 파일 참조, / Codex 활성 스킬 선택과 기록 칩 복원, 셸 비서 패널·thread 기록·스티어링·중단·컨텍스트 사용량. |
| [Parser security boundary](design/parser-security-v1.md) | Implemented | 공개 parse/참조 진단 도달성, URL·inline HTML backport와 patch 제거 조건. |
| [Continuous document editing](design/document-editing-v1.md) | Implemented | 현재 계약. 연속 편집, clipboard, table/section 구조 변경의 보존 경계. |
| [Editing session and Save](design/editing-session-save-v1.md) | Implemented | 현재 계약. opening snapshot, Save acknowledgement, 저장 전·복구 Visual/소스 비교와 draft/work-loss 보호 및 Host별 위치 식별·로컬 복구(#1174 PR1). |
| [Filesystem Host boundary](design/filesystem-host-boundary-v1.md) | Implemented | 파일·asset·folder 계약. Vite, Desktop, HTTP Host가 같은 handler를 재사용. |
| [플러그인 1단계](design/plugin-stage1-v1.md) | Implemented | ADR-0020 명시 개시: 최소 SDK·로컬 등록·신뢰·활성·공용 작업·CLI·하위 프로세스/reload·비서 활동 기록·OneDrive. Windows DPAPI secret 저장·설정 UI·상태/삭제 CLI·실행 전달. 비서 제작 키트 scaffold/validate·번들 스킬 포함. 뷰 runtime 없음. |
| [Generated views v1](design/generated-views-v1.md) | Implemented | V1 Core/SDK v2 계약·입력·12열·중립 refs·entry 전 기여 검증(Host/renderer 전환은 후속). #1210 Core 명세·계산·신규 생성, #1218 내장/플러그인 읽기 작업별 행 schema·가공·비서 문맥, 내장 통계 Host/CLI·기본 표·즐겨찾기·새 탭과 비서 양 공급자 제안/검증/최대 2회 수정. |
| [HTTP Host](design/http-host-v1.md) | Implemented | 무인증 단계(#1145) daemon start/stop/status·실행 주체/상세 상태·stale 회수·Desktop pipe 수명·고정 origin·선택 Root·버전·OS 휴지통, CLI 배포와 HTTP·프록시 경계. |
| [Desktop distribution and updates](design/desktop-distribution-v1.md) | Implemented | Windows Host, NSIS, Stable/Beta, signing 및 수동 workflow 실행 후 검증 성공 시 추가 승인 없는 게시 계약. 현재 공개 Litzio 0.0.2-beta.7·직전 Litzio 0.0.2-beta.6·이전 Litzio 0.0.2-beta.5·이전 IeumDoc 0.0.2-beta.4·이전 0.0.2-beta.3·이전 0.0.2-beta.2·0.0.2-beta.1과 기존 두 0.1.0 Beta 철회 근거·실제 GitHub 업데이트 미검증 범위 보존. |
| [Desktop app icon](design/app-icon-v1.md) | Implemented | #905 승인된 E안 SVG 원본·Chromium 틈 검사·크기별 ICO, 브랜드 연결·출처·재생성과 Windows CI 검증 경계. |
| [Folder picker](design/folder-picker-v1.md) | Implemented | 현재 계약. folder 선택, browser preference와 표시 folder에 New file·New folder. |
| [Endnotes (MyST footnotes)](design/footnotes-v1.md) | Implemented | 현재 계약. 모든 쓰기에서 미주 정의를 본문 뒤 첫 참조 순서로 배치, 단일 미주 구역, Section과 분리, 실제 참조로 복귀와 기존 삽입·편집·유실 방지. |
| [Citations](design/citations-v1.md) | Implemented | ADR-0008 단위 A·B·C. role·선언 보존, Core 번호·제한 IEEE·readiness, CLI/Host 자료 읽기와 파생 References. 슬래시 검색·인용 폼 저작 UI. |
| [Heading numbering](design/heading-numbering-v1.md) | Implemented | 현재 계약. Core heading/reference-template settings, H1–H6 본문 표시와 CLI, frontmatter 제목 분리. #720 그림·표·수식 고정 번호, 비차단 경고와 최종 쓰기 경계. |
| [Section references](design/section-references-v1.md) | Implemented | 현재 계약. 문서 안의 MyST heading label과 reference. |
| [Table caption and label](design/table-caption-v1.md) | Implemented | 현재 계약. table caption/label과 reference target. |
| [Table interaction](design/table-interaction-v1.md) | Implemented | 현재 계약. cell·행·열 handle, menu와 engine history. |
| [Figure authoring](design/figure-authoring-v1.md) | Implemented | 현재 계약. pending/image/Mermaid Figure의 Core·CLI 계약, Editor 원문·미리보기·속성 팝오버와 초안, canonical Save와 CLI readiness 경고. |
| [Editor UX Shell](design/editor-ux-shell-v1.md) | Implemented | 현재 계약. 공용 제목 줄, 최대 두 에디터 그룹, 탭별 읽기·편집·소스와 초안 유지, Sidebar, 작성 interaction과 상태 표시. |
| [Editor Layout Rules](design/editor-layout-rules-v1.md) | Implemented | 현재 geometry 규범. 정렬·간격·control 치수와 검증. |
| [Editor Visual Language — Quiet Document](design/editor-visual-language-v1.md) | Implemented | 현재 토큰·팔레트, 서체, 표면·테마, 상태와 조절 값 규칙. 배치·치수와 반복 동작은 Layout Rules·UI 패턴에 연결한다. |

## 운영 안내

운영자가 외부 서비스를 준비하고 문제를 진단하는 실행 안내다. 제품 의미·지원 범위는
위 Accepted ADR과 Implemented contract를 따르며, 직접 확인하지 않은 환경은 각 안내에 구분한다.

| Document | Status | Scope |
| --- | --- | --- |
| [패키저용 브랜드 설정](guides/branding.md) | Implemented | 단일 브랜드 설정, 공식 Litzio 기본값, 별도 설치와 고정 Host API·CI 검증 범위. |

## Contribution and documentation governance

| Document | Status | Authority / description |
| --- | --- | --- |
| [제품 용어집](contributing/terminology.md) | Implemented | 화면·문서 표준 용어와 PR B에서 반영한 기술 이름. |
| [이슈 작성](contributing/issues.md) | Implemented | 제목·유형·최소 정보 규칙, 공통 정의에서 생성하는 웹 폼, CLI 사전 검사와 GitHub 등록 후 검사. |
| [테스트 설계와 PR 확인](contributing/test-design.md) | Implemented | 테스트 작성·확대의 7개 원칙, 예외 기준과 PR 기록·확인 절차. |
| [Documentation governance](contributing/documentation-governance.md) | Implemented | 현재 작업 규칙. 문서 authority, status, metadata와 갱신 절차. |
| [Dependency patch register](contributing/dependency-patches.md) | Implemented | 현재 로컬 패치의 사유·제거 조건·보호 테스트와 등록 대응 검사. |
| [Windows browser automation](contributing/windows-browser-automation.md) | Implemented | 현재 실행 규칙. persistent profile, storage 격리와 process cleanup. |

[AGENTS.md](../AGENTS.md)는 저장소 전체 제약, [CONTRIBUTING.md](../CONTRIBUTING.md)는 setup·검증 matrix·PR 절차의 진입점이다.

## Design proposals

| Document | Status | Authority / description |
| --- | --- | --- |
| [카탈로그 v2](design/catalog-v2.md) | Draft | ADR-0020 개정안. 2단계 Jira 수락 부족 대응: 입력·12열 표·안전한 오류·공용 K2/K3/K4·제작 스킬과 병렬 구현 PR 분할. 소유자 결정 필요 항목 없음. 4단계는 비서 제작 수락 시험이며 현재 구현 계약 아님. |

## UI pattern targets awaiting implementation

| Document | Status | Authority / description |
| --- | --- | --- |
| [UI decision table and gallery](design/ui-decision-table-v1.md) | Implemented | 에이전트의 표면·공통 구현 선택, 개발 전용 실행 예제와 제거·보관된 Plugin API의 역사적 경계. 규범은 기존 세 UI 문서가 소유한다. |
| [UI patterns](design/ui-patterns-v1.md) | Draft | UI 작업 전 확인. #777 소유자가 확정한 P01–P12 목표와 현재 기준 구현·사용처, 알려진 불일치·후속 이슈 및 다른 화면 확인 규칙. 미구현 목표를 Implemented로 주장하지 않기 위한 상태이며 채택 결정은 확정됨. |

## Historical reviews and spikes

[#204 document tabs implementation and review](reviews/document-tabs-204-2026-10-16.md) records the final tab step's scope, visual evidence, measurements and verification.

- [Block source editing](design/block-source-editing-v1.md) — Superseded by Native document support; former contract retained as history.

| Document | Status | Authority / description |
| --- | --- | --- |
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

## Verification

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
