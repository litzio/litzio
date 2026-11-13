# 스파이크 기록

- Status: Historical (색인)
- Scope: 지금까지 진행한 스파이크의 목적·결과·결론과 코드 위치를 찾기 위한 기록이다. 제품 계약이나 채택 결정이 아니다.

## 정책

- 스파이크는 개념을 확인하기 위한 참고 자료다. 스파이크 코드는 master에 넣지 않고 PR로 올리지 않는다. 원격 `spike/*` 브랜치와 주석 태그(annotated tag)로만 보존한다.
- 채택된 스파이크도 코드를 병합하지 않는다. 이슈를 새로 등록하고 master 기준으로 다시 구현하며, 스파이크는 그 이슈의 참고 자료가 된다.
- 기록은 이 폴더에 스파이크마다 한 장씩 둔다. 문서만 담은 PR로 master에 병합한다.
- 새 작업을 계획할 때는 아래 색인에서 관련 스파이크가 있는지 먼저 확인한다.

## 이름 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 브랜치 | `spike/<slug>`. 관련 이슈가 있으면 `spike/<이슈번호>-<slug>` | `spike/guided-tour`, `spike/936-template-gallery` |
| 태그 | `spike/<YYYY-MM-DD>-<slug>`. 끝난 스파이크의 마지막 커밋에 붙인다 | `spike/2026-11-11-guided-tour` |
| 기록 | `docs/spikes/<YYYY-MM-DD>-<slug>.md`. 태그와 같은 이름 | `docs/spikes/2026-11-11-guided-tour.md` |

- slug는 영어 소문자, 숫자, 하이픈만 쓴다. 날짜는 마지막 커밋일(KST)이다.
- 새 브랜치 이름에는 날짜를 넣지 않는다. 날짜는 태그가 갖는다. 예전 브랜치 가운데 끝에 `-MMDD`가 붙은 것은 그대로 두고, 태그와 기록의 slug에서는 그 부분을 뗀다.
- 태그가 커밋을 잡고 있으므로 브랜치를 나중에 지워도 코드는 남는다.

## 기록 양식

각 기록은 아래 절을 이 순서로 둔다.

1. **목적:** 무엇을 확인하려 했는가.
2. **무엇을 만들었나.**
3. **결과·관찰:** 실제로 확인한 것만 적는다. 추정으로 채우지 않는다.
4. **현재 결정과 어긋나는 점:** master의 ADR·계약·이전 결정과 다르게 간 부분과 관련 문서·PR. 없으면 "없음"이라고 적는다. 2026-11-13 이후의 기록부터 둔다.
5. **결론/후속:** 채택·보류·폐기·미정 중 하나와 그 이유. 채택 뒤의 괄호는 채택된 범위다.
6. **코드 위치:** 태그, 브랜치, 마지막 커밋.
7. **스크린샷:** master에 이미 있는 파일만 연결한다. 이미지를 새로 추가하지 않는다.

결론이 "미정"이면 무엇이 정해져야 결론이 나는지를 한 줄로 함께 적는다. 근거 없이 채택이나 폐기로 적지 않는다.

## 스파이크를 진행하는 에이전트의 규칙

스파이크는 이 PC 밖의 환경에서 외부 에이전트(Grok Bot 등)가 진행할 수 있다. 진행하는 에이전트는 다음을 반드시 지킨다.

**시작하기 전에**

1. 최신 `origin/master`에서 새 브랜치를 만든다. 이름은 위 규칙을 따른다.
2. [AGENTS.md](../../AGENTS.md), [docs index](../README.md), 관련 ADR·계약, 그리고 이 색인의 이전 스파이크를 읽는다. 같은 주제의 스파이크가 이미 있으면 그 결론을 확인한다.
3. 확인하려는 질문을 한두 문장으로 정한다. 질문이 없는 스파이크는 시작하지 않는다.

**진행하는 동안**

4. `spike/*` 브랜치에만 push한다. master와 다른 브랜치에는 push하지 않고, 스파이크 코드로 PR을 만들지 않으며, 병합하지 않는다.
5. 다른 스파이크의 브랜치와 태그를 고치거나 지우거나 덮어쓰지 않는다. 끝난 스파이크는 그대로 두고, 이어서 할 일은 새 스파이크로 한다.
6. 비공개 정보를 저장소에 넣지 않는다. 회사·부서·고객·실제 제품과 프로젝트의 이름, 실제 업무 자료와 측정 데이터, 사람 이름, 로컬 경로와 사용자명, 비밀 값과 토큰이 여기에 해당한다. 파일 이름, 폴더 이름, 예시 데이터, 커밋 메시지, 문서, 캡처 모두에 적용한다. 예시 데이터는 합성해서 만들고 업무 영역이 드러나지 않는 일반적인 이름을 쓴다(예: "생산 라인 검사 데이터").
7. 저장소의 자료나 사용자 자료를 외부 서비스로 보내지 않는다.
8. 릴리스, 버전, 배포 설정, CI workflow, 저장소 설정은 건드리지 않는다. 릴리스나 Release를 만들지 않는다. 그것이 스파이크의 질문 자체일 때만 예외이며, 그 경우에도 실제 게시는 하지 않는다.
9. 스파이크를 정당화하려고 ADR이나 Implemented 계약 문서를 고치지 않는다. master의 결정과 다르게 가야 하면 그대로 진행하되 기록의 "현재 결정과 어긋나는 점"에 적는다.
10. 모든 커밋에 [AI 커밋 provenance](../../AGENTS.md#ai-commit-provenance) trailer를 실제 에이전트와 모델로 넣는다.

**끝낼 때**

11. 스파이크의 주 폴더에 `SPIKE.md`를 둔다. 확인하려던 질문, 만든 것, 실행 방법, 결과, 검증하지 않은 것과 한계, 현재 결정과 어긋나는 점, 추천 결론을 적는다.
12. 확인하지 않은 것을 확인했다고 쓰지 않는다. 합성 자료나 작은 예시로만 본 것은 그렇게 적는다.
13. 마지막 커밋에 주석 태그 `spike/<YYYY-MM-DD>-<slug>`를 붙여 push한다.
14. 기록 한 장과 색인 한 줄을 문서 전용 PR로 올린다. 이 PR은 `docs/spikes/`와 `docs/README.md`의 색인만 바꾼다. 스파이크 코드, 이미지, 다른 문서는 넣지 않는다. 병합은 오케스트레이터가 확인한 뒤 한다.
15. 결론은 소유자가 정한다. 에이전트는 추천만 적고, 소유자의 결정이 없으면 "미정"으로 둔다.

더 이른 시기(2026-09~10)의 Desktop shell·VS Code host·editor 실험은 [Desktop shell spike](../reviews/desktop-shell-spike-v1.md)와 [VS Code host spike](../reviews/vscode-host-spike-v1.md) 등 `docs/reviews`에 기록돼 있고 `archive/*` 태그로 보존돼 있다. 이 색인은 원격 `spike/*` 브랜치를 가진 스파이크를 다룬다.

## 색인

| 날짜 | 제목 | 목적 | 결론 | 태그 | 브랜치 | 관련 이슈·PR·문서 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-28 | [Draw.io 편집 연동 (.drawio.svg 그림)](2026-10-28-drawio-embed.md) | Draw.io 다이어그램을 Litzio 그림(Figure)으로 첨부하고 문서 안에서 편집할 수 있는지 확인한다(#646) | 보류 | [`spike/2026-10-28-drawio-embed`](https://github.com/litzio/litzio/tree/spike/2026-10-28-drawio-embed) | [`spike/drawio-embed-1028`](https://github.com/litzio/litzio/tree/spike/drawio-embed-1028) | [#646](https://github.com/litzio/litzio/issues/646) |
| 2026-10-28 | [Codex app-server 기반 AI 질의응답과 변경 제안](2026-10-28-codex-ai.md) | Codex CLI(`codex app-server`)만으로 Litzio에 AI를 붙여, 열린 폴더 문서를 근거로 한 질의응답과 검토 후 반영하는 문서 수정 제… | 채택(일부) | [`spike/2026-10-28-codex-ai`](https://github.com/litzio/litzio/tree/spike/2026-10-28-codex-ai) | [`spike/codex-ai-1028`](https://github.com/litzio/litzio/tree/spike/codex-ai-1028) | [#657](https://github.com/litzio/litzio/issues/657) |
| 2026-10-30 | [Docling 변환 대조 보기](2026-10-30-docling-compare.md) | Docling이 변환한 결과가 원본 PDF의 어느 영역에서 왔는지 한 화면에서 대조할 수 있는지 확인한다 | 미정 | [`spike/2026-10-30-docling-compare`](https://github.com/litzio/litzio/tree/spike/2026-10-30-docling-compare) | [`spike/docling-compare-1030`](https://github.com/litzio/litzio/tree/spike/docling-compare-1030) | - |
| 2026-10-30 | [CLI 기반 AI 보고서 작성과 채팅 탭](2026-10-30-ai-report.md) | AI가 열린 폴더의 저장 문서를 읽고 문서 CLI를 거쳐 검증된 새 보고서를 만들 수 있는지, AI 진입점을 채팅 탭으로 둘 수 있는지 확인한다(#657) | 미정 | [`spike/2026-10-30-ai-report`](https://github.com/litzio/litzio/tree/spike/2026-10-30-ai-report) | [`spike/ai-report-1028`](https://github.com/litzio/litzio/tree/spike/ai-report-1028) | [#657](https://github.com/litzio/litzio/issues/657) |
| 2026-10-31 | [Docling 플러그인 런타임 (신뢰된 worker)](2026-10-31-docling-plugin-runtime.md) | 데몬 없이 기존 Desktop Host와 독립 HTTP Host가 첫 신뢰 모듈(Docling worker)을 등록·실행·장애 격리·비활성화할 수 있는지 확인한다 | 보류 | [`spike/2026-10-31-docling-plugin-runtime`](https://github.com/litzio/litzio/tree/spike/2026-10-31-docling-plugin-runtime) | [`spike/docling-plugin-runtime`](https://github.com/litzio/litzio/tree/spike/docling-plugin-runtime) | [Discussion](https://github.com/litzio/litzio/discussions/767), [Discussion](https://github.com/litzio/litzio/discussions/834) |
| 2026-10-31 | [Docling 플러그인 UI 기여](2026-10-31-docling-plugin-ui.md) | 설치된 플러그인이 Editor 실행 중에 명령 하나와 탭 종류 하나를 추가·제거할 수 있는지 확인한다 | 보류 | [`spike/2026-10-31-docling-plugin-ui`](https://github.com/litzio/litzio/tree/spike/2026-10-31-docling-plugin-ui) | [`spike/docling-plugin-ui`](https://github.com/litzio/litzio/tree/spike/docling-plugin-ui) | [Discussion](https://github.com/litzio/litzio/discussions/767) |
| 2026-11-01 | [AI 에이전트 블록 제안 워크플로 (플러그인)](2026-11-01-ai-agent-proposal.md) | 신뢰된 플러그인 하나와 Codex CLI로, 선택한 문단·제목의 수정 제안을 비교·적용·되돌리는 흐름이 성립하는지 확인한다 | 미정 | [`spike/2026-11-01-ai-agent-proposal`](https://github.com/litzio/litzio/tree/spike/2026-11-01-ai-agent-proposal) | [`spike/ai-agent-proposal`](https://github.com/litzio/litzio/tree/spike/ai-agent-proposal) | [Discussion](https://github.com/litzio/litzio/discussions/767) |
| 2026-11-03 | [문서 보고서와 문서형 앱 표 비교 (#1041)](2026-11-03-1041-document-style.md) | 앱 화면을 Litzio 문서 표현과 같은 계열로 보이게 하는 범위를 검토하기 위해, 문서 보고서 형태와 문서형 앱 표 스타일을 나란히 본다(#1041) | 미정 | [`spike/2026-11-03-1041-document-style`](https://github.com/litzio/litzio/tree/spike/2026-11-03-1041-document-style) | [`spike/1041-document-style`](https://github.com/litzio/litzio/tree/spike/1041-document-style) | [#1041](https://github.com/litzio/litzio/issues/1041) |
| 2026-11-03 | [편집 중인 블록 표시 세 시안 (#1022)](2026-11-03-1022-editing-block-indicator.md) | 텍스트를 편집하는 블록의 종류와 범위를 구분하기 어려운 문제(#1022)에 대해 세 가지 표시 방식을 실제 Editor에서 비교한다 | 채택(gutter 계열) | [`spike/2026-11-03-1022-editing-block-indicator`](https://github.com/litzio/litzio/tree/spike/2026-11-03-1022-editing-block-indicator) | [`spike/1022-editing-block-indicator`](https://github.com/litzio/litzio/tree/spike/1022-editing-block-indicator) | [#1022](https://github.com/litzio/litzio/issues/1022) |
| 2026-11-04 | [템플릿 갤러리 화면 대안 (#936)](2026-11-04-936-template-gallery.md) | 문서 템플릿 갤러리 화면의 구조를 비교한다(#936) | 채택 | [`spike/2026-11-04-936-template-gallery`](https://github.com/litzio/litzio/tree/spike/2026-11-04-936-template-gallery) | [`spike/936-template-gallery`](https://github.com/litzio/litzio/tree/spike/936-template-gallery) | [#936](https://github.com/litzio/litzio/issues/936) |
| 2026-11-04 | [S1: Desktop을 인증된 공유 daemon에 연결 (#834)](2026-11-04-834-s1-desktop-daemon.md) | 같은 PC에서 Desktop과 브라우저가 하나의 인증된 공유 HTTP Host(daemon)를 쓸 수 있는지 확인한다 | 채택(방향) | [`spike/2026-11-04-834-s1-desktop-daemon`](https://github.com/litzio/litzio/tree/spike/2026-11-04-834-s1-desktop-daemon) | [`spike/834-s1-desktop-daemon`](https://github.com/litzio/litzio/tree/spike/834-s1-desktop-daemon) | [Discussion](https://github.com/litzio/litzio/discussions/834) |
| 2026-11-05 | [동적 UI: 생성 UI와 저장 뷰를 같은 렌더러로](2026-11-05-dynamic-ui.md) | 비서가 만든 UI와 저장된 뷰가 같은 Core 명세와 같은 React 렌더러를 쓰는 경로가 성립하는지 확인한다 | 폐기 | [`spike/2026-11-05-dynamic-ui`](https://github.com/litzio/litzio/tree/spike/2026-11-05-dynamic-ui) | [`spike/dynamic-ui`](https://github.com/litzio/litzio/tree/spike/dynamic-ui) | [#1341](https://github.com/litzio/litzio/issues/1341), [PR](https://github.com/litzio/litzio/pull/1357) |
| 2026-11-06 | [동적 UI 인터뷰 → 흐름도 → 보고서](2026-11-06-dynamic-interview-flow.md) | 비서가 인터뷰 질문과 흐름도를 만들고, 사용자 의견과 승인을 거쳐 공식 문서 생성까지 이어지는 흐름이 성립하는지 확인한다 | 미정 | [`spike/2026-11-06-dynamic-interview-flow`](https://github.com/litzio/litzio/tree/spike/2026-11-06-dynamic-interview-flow) | [`spike/dynamic-interview-flow`](https://github.com/litzio/litzio/tree/spike/dynamic-interview-flow) | [#1341](https://github.com/litzio/litzio/issues/1341) |
| 2026-11-10 | [비서와 플러그인 만들기](2026-11-10-assistant-plugin-builder.md) | #1341로 비서 동적 UI를 제거한 뒤에도, 사용자가 플러그인 사양 인터뷰에서 결정을 바꾸면 다음 질문과 사양이 바뀌고 앞선 결정이 유지되는 협의형 흐름이 … | 미정 | [`spike/2026-11-10-assistant-plugin-builder`](https://github.com/litzio/litzio/tree/spike/2026-11-10-assistant-plugin-builder) | [`spike/assistant-plugin-builder`](https://github.com/litzio/litzio/tree/spike/assistant-plugin-builder) | [Discussion](https://github.com/litzio/litzio/discussions/767), [PR](https://github.com/litzio/litzio/pull/1357) |
| 2026-11-11 | [#1462 검증 실험 ②: 교정 후 원본 대응과 텍스트 블록 ID](2026-11-11-1462-block-identity.md) | Docling 검수에서 교정 후에도 블록과 원본 대응을 유지할 수 있는지(경로 갱신 A), 텍스트 블록 ID(MyST target)가 블록 정체성으로 쓰일 수… | 채택(방식 A) | [`spike/2026-11-11-1462-block-identity`](https://github.com/litzio/litzio/tree/spike/2026-11-11-1462-block-identity) | [`spike/1462-block-identity`](https://github.com/litzio/litzio/tree/spike/1462-block-identity) | [#1462](https://github.com/litzio/litzio/issues/1462) |
| 2026-11-11 | [#1462 검증 실험 ①: 독립 PDF 텍스트 증거와 문서 대응](2026-11-11-1462-evidence-match.md) | pdf.js로 뽑은 PDF 텍스트와 Litzio 문서를 양방향으로 맞춰 텍스트 누락·변조를 독립 증거로 탐지할 수 있는지 측정한다(#1462) | 채택(보조 후보 탐지만) | [`spike/2026-11-11-1462-evidence-match`](https://github.com/litzio/litzio/tree/spike/2026-11-11-1462-evidence-match) | [`spike/1462-evidence-match`](https://github.com/litzio/litzio/tree/spike/1462-evidence-match) | [#1462](https://github.com/litzio/litzio/issues/1462) |
| 2026-11-11 | [문서 작성 안내 투어](2026-11-11-guided-tour.md) | Litzio 화면 위에 영역을 강조하고 나머지를 막는 안내 레이어로 "문서 작성 첫걸음" 투어를 Command Center에서 시작할 수 있는지 확인한다 | 미정 | [`spike/2026-11-11-guided-tour`](https://github.com/litzio/litzio/tree/spike/2026-11-11-guided-tour) | [`spike/guided-tour`](https://github.com/litzio/litzio/tree/spike/guided-tour) | - |
| 2026-11-11 | [요구사항 추적과 ReqIF 내보내기](2026-11-11-requirements-traceability.md) | 표준 요구사항 문서(왼쪽)와 시스템 요구사항 문서(오른쪽)를 모두 평범한 Litzio 문서로 두고 문장 단위 추적이 성립하는지, ReqIF 1.2로 내보낼 수… | 미정 | [`spike/2026-11-11-requirements-traceability`](https://github.com/litzio/litzio/tree/spike/2026-11-11-requirements-traceability) | [`spike/requirements-traceability`](https://github.com/litzio/litzio/tree/spike/requirements-traceability) | - |
| 2026-11-12 | [검토 패널 배치 세 시안 (#1462)](2026-11-12-1462-review-panel.md) | Docling 검수에서 고정된 LSR 원본 쪽을 쓴 검토 패널의 배치 세 가지를 비교해 소유자가 고르게 한다(#1462) | 미정 | [`spike/2026-11-12-1462-review-panel`](https://github.com/litzio/litzio/tree/spike/2026-11-12-1462-review-panel) | [`spike/1462-review-panel`](https://github.com/litzio/litzio/tree/spike/1462-review-panel) | [#1462](https://github.com/litzio/litzio/issues/1462) |
| 2026-11-13 | [공정 분석기 (생산 라인 검사 데이터 그래프·공정 능력)](2026-11-13-process-analyzer.md) | 생산 라인 검사 데이터를 그래프로 보고 하루 또는 여러 날의 생산 결과를 통계로 분석하는 커뮤니티 플러그인이 현재 플러그인 구조에서 … | 미정 | [`spike/2026-11-13-process-analyzer`](https://github.com/litzio/litzio/tree/spike/2026-11-13-process-analyzer) | [`spike/process-analyzer`](https://github.com/litzio/litzio/tree/spike/process-analyzer) | [PR](https://github.com/litzio/litzio/pull/1357) |

결론 표기는 각 기록의 근거를 따른다. 채택 뒤에 붙은 괄호는 채택된 범위다(예: 방향만 채택, 일부 채택). 스파이크 코드를 병합했다는 뜻이 아니다.
