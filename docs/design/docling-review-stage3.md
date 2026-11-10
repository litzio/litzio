# Docling 검수 3단계 — 문제 묶음과 비서 검사

- Status: Draft
- Last verified: 2026-11-10 — `d25aef81`의 SDK·Docling·Host 소스 및 기존 계약 대조. 아래 재측정은 별도 Codex CLI 실험이며 제품 비서·저장·화면 실행 검증이 아니다.
- Scope: [#1462](https://github.com/litzio/litzio/issues/1462) 1단계의 설계안과 입력 방식 비교. 구현·SDK 변경·기존 문서 migration은 하지 않는다. 개발 및 하위 PR base는 `feature/docling-stage3`; master 반영에는 소유자 승인과 독립 리뷰·merge queue 검사가 필요하다.
- Authority: [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0020](../adr/0020-plugin-architecture.md), [현재 플러그인 계약](plugin-stage1-v1.md). #1462의 소유자 결정은 목표이며 이 Draft의 필드·작업 이름까지 수락했다는 뜻은 아니다.

## 목적과 현재 경계

수백 쪽의 모든 블록을 사람이 승인하는 대신, 제품의 기본 비서가 모든 페이지를 검사하고 구체적인 문제를 이유별 묶음으로 제시한다. 사람은 각 묶음의 대표와 전체 대상·변경 내용을 확인하고 승인하거나 거절한다. 대표 하나의 확인으로 나머지 대상의 근거 검사를 대신하지 않는다. 페이지 직접 훑어보기는 선택이다.

현재 Docling은 커뮤니티 플러그인이며 별도 AI를 실행하지 않는다. 플러그인은 원본·변환 데이터 읽기, 결정적 규칙, 교정 replay와 SDK 문서 생성을 제공하고, 제품 비서는 도구를 사용해 검사·판단·제안을 한다. 번들 앱은 공통 검토 UI를 제공한다. Docling 전용 Core·Host 기능이나 별도 AI 공급자·대화·작업 엔진을 만들지 않는다.

현재 구현과 이 제안의 차이는 다음과 같다.

| 현재 구현 | 3단계 제안 |
| --- | --- |
| V4 review의 pending 제안·승인/거절/Undo와 Core text 변경, daemon 수명 bundle | 여러 대상과 개별 근거를 가진 영속 문제 묶음. 기존 Core text 경로를 Docling 교정 이력 대신 쓰지 않는다. |
| generated-document의 opaque 교정·재생성과 `sourceRevision/documentRevision/linkRevision` 보호 | 같은 source-first 경로로 승인된 묶음의 교정을 저장·재생성하고 부분 실패를 공개한다. |
| Docling `review.json`의 `patches/checkedPages/lastPage/approval:null` | 비서 검사 범위·판단·묶음·승인 이력과 완료 판정을 추가한다. 현재 reader는 추가 필드를 거부하므로 SDK/플러그인 구현 변경이 필요하다. |
| 사람이 저장하는 페이지 확인과 원본 대조 | 사람 확인과 비서 검사 기록을 분리하고, 비서 전 페이지 검사·열린 문제 해소로 완료를 판정한다. |

실행 근거: [Docling review adapter](../../community-plugins/docling/review.js), [Docling Host](../../community-plugins/docling/host.js), [공용 review Host](../../apps/editor/server/plugins/reviews.ts), [생성 문서 Host](../../apps/editor/server/plugins/generated-documents.ts). 현재 동작의 권위는 계속 [플러그인 1단계](plugin-stage1-v1.md)다.

## 소유권과 문제 묶음 모델

문제 묶음의 휴대 가능한 내용과 검사 기록은 해당 원본 보관 파일이 소유한다. Docling은 `.docling`의 `review.json`에 저장한다. Host는 현재 파일 접근·revision·요청 receipt·미확정 변경 잠금을 소유한다. 대화는 검사 요청과 AI 응답의 문맥을 소유하며 검수 상태의 정본이 아니다. 화면의 선택·확대·초안은 앱 소유다.

공통 모델 후보는 아래와 같다. `self_ref`와 원본 `table_cells` 인덱스는 Docling adapter의 locator이며 Core 문서 path나 영속 ID로 승격하지 않는다. 원본 revision 안에서만 유효하다.

| 내용 | 필요한 필드와 의미 |
| --- | --- |
| 묶음 식별·범위 | `id`, `reasonCode`, 사람이 읽는 이유, provider ID/version, source/content revision, 생성 시각·검사 run. 같은 이유·같은 복구 의도로만 묶고 근거 없는 유사 항목 자동 확장은 금지한다. |
| 대상 목록 | 대상 ID·opaque locator·페이지들·영역들·변환 전 값. 표는 실제 원본 cell index와 행/열 범위를 함께 표시한다. 빈 grid 자리에 원본 cell이 없으면 `cell:null`로 구분한다. |
| 대표 | 대상 목록 안의 `representativeTargetId`; 대표 선정 이유. 예외·다른 패치가 필요한 대상도 생략하지 않는다. |
| 대상별 근거 | 원본 페이지/확대 영역 참조와 해시, 관찰한 글자·배치, 변환 값, 규칙 ID/version 또는 AI 모델·추론 강도·입력 범위. 오류 확신과 복구 가능성을 분리한다. |
| 제안 패치 | 대상별 operation 목록, expected before 값/revision, 예상 after, 지원 가능 여부·보류 이유. 실행 불가 변경은 설명만 보존하고 적용 가능한 척하지 않는다. |
| 판단·처리 | 검사 상태, 제안 상태, 사람의 승인/거절 및 이유, 적용 receipt, 실제 저장/재생성 여부, 되돌리기 연결. 한 묶음의 대상마다 서로 다른 판단을 보존한다. |

같은 표의 수식 누락 두 칸은 한 이유로 묶을 수 있지만 칸마다 읽힌 수식과 locator를 가진다. 같은 제목 점프 후보라도 하나는 본문 오분류, 하나는 실제 계층 오류일 수 있으므로 하나의 자동 수준 패치로 묶지 않는다. 일부 대상만 처리하려면 미처리 대상을 새 묶음으로 명시 분리하고 기존 결정을 덮어쓰지 않는다.

## 상태와 완료 조건

검사 상태와 제안 처리 상태를 한 enum으로 섞지 않는다.

| 표시 | 의미·전이 |
| --- | --- |
| 검사 못 함 (`not-inspected`) | 실행 전, 중단/실패, 입력 누락, 오래된 검사. JSON 파싱 성공이나 규칙 0건으로 검사됨 처리하지 않는다. |
| 판단 불가 (`uncertain`) | 검사했으나 원본 근거 부족, 읽기 어려움, 모순 또는 복구 표현 불가. 필요한 추가 자료·작업을 기록한다. |
| 문제 없음 (`no-issue`) | 명시된 자료·검사 범위에서 문제가 발견되지 않음. JSON 내부 일관성 통과는 원본 일치 통과가 아니다. |
| 제안 (`proposed`) | 대상별 근거와 변경안이 저장됐으나 사람이 처리하지 않음. 패치 없는 확정 문제도 열려 있는 문제로 남는다. |
| 승인 (`approved`) | 사람이 정확한 대상·변경안을 승인. 승인과 실제 적용 성공은 별도이며 `applied`, `regeneration-required`, `uncertain` 결과를 기록한다. |
| 거절 (`rejected`) | 제안 변경을 적용하지 않는 사람 판단과 이유. 오탐이면 문제를 닫을 수 있지만 알려진 실제 문제의 수정 거절만으로 문제 없음으로 바꾸지 않는다. |

Undo는 과거 승인을 삭제하지 않고 `undone` 처리 이력을 추가한 뒤 해당 문제를 다시 연다. 전송/실행 결과 불확실(`receipt.outcome:uncertain`)은 내용 판단 불가와 별도이며, 같은 요청 ID 조회와 파일 재확인이 끝날 때까지 후속 변경을 막는다.

완료는 현재 content revision에 대해 다음 조건을 **모두** 만족해야 한다.

1. 비서가 모든 실제 페이지를 검사했고 검사 못 한 페이지가 0이다. 최종 원본 충실도 검사는 모든 페이지 이미지와 변환 내용을 포함한다. JSON 전용·후보 영역 전용 검사는 그 coverage만 기록하며 전체 이미지 검사로 승격하지 않는다.
2. 열린 문제 묶음과 판단 불가가 0이고, 사람이 모든 묶음을 승인 또는 근거 있는 거절로 처리했다. 규칙 후보의 기각·확정 문제의 해소·재검사 결과도 남는다.
3. 승인 변경이 `.docling`에 저장되고 공식 write path로 문서가 재생성돼 현재 mapping·문서 revision과 일치한다. 재생성 필요, 외부 수정, stale 자료, pending/unknown 요청은 0이다.
4. 교정 뒤 필요한 재검사를 마쳤다. 사람이 페이지를 직접 확인했는지는 완료의 필수 조건이 아니다.

이는 workflow 완료 조건이며 원본과 의미가 완전히 같다는 수학적 증명이나 모델의 무오류 보증이 아니다. 실제 제품 수락은 LSR와 실제 문서에서 비서 검사→묶음 처리→재생성→완료 판정의 연결, 놓침·위험 제안 기록을 포함한다. 이번 문서 실험은 이 연결의 완료가 아니다.

## 공용 Host 작업·CLI·비서 도구 제안

다음 이름은 **미구현 후보**다. 기존 `/api/reviews` dispatcher와 generated-document 경로를 확장하고, 새 범용 backend/registry를 만들지 않는다. 각 CLI·비서 도구는 같은 공용 작업 정의와 검증을 호출한다. 공통 입력은 대상 Host·provider·Root 상대 생성 문서/원본 연결·content revision이며 임의 파일 경로/URL을 image ref로 받지 않는다.

| Host 작업 후보 | CLI 후보 / 비서 도구 후보 | 입력 → 결과 |
| --- | --- | --- |
| `review.material` (read) | `review material` / `read_review_material` | baseline, pageNo, kind `page/region/items/cells/structure`; region은 검증된 page+영역 ID 또는 좌표·배율 → 이미지 ref/hash·실제 치수·해상도·좌표계, 관련 모든 provenance 페이지, 항목의 원문/유효값·관계·실제 cell index/행열 범위, 전체 구조 및 continuation. 자료 없음·상한 초과·미지원은 명시 오류. |
| `review.rules` (read) | `review rules` / `run_review_rules` | baseline, rule IDs/version, 범위 → 결정적 무결성 결과와 의미 판단 후보를 구별한 대상·근거·완료 범위. 0건도 검사 범위와 실패를 반환. |
| `review.inspection` (write) | `review inspection` / `record_review_inspection` | requestId, baseline, run/model/effort, 실제 읽은 자료 refs/hash, 페이지별 modality·결과·한계 → 저장 revision과 검사 coverage. 단순 호출자가 claimed한 완료를 전체 검사 증거로 취급하지 않는다. |
| `review.groups.propose` (write) | `review groups propose` / `propose_review_groups` | requestId, baseline, 묶음·개별 근거·제안 패치 → 검증된 묶음 IDs, 지원/보류, 새 baseline. 원본/문서 변경 없이 제안만 저장. |
| `review.groups.read` (read) | `review groups read` / `read_review_groups` | baseline, groupId 또는 상태 필터/continuation → 전체 대상·대표·근거·제안·판단·처리 이력·열린 문제 수. 잘라서 완전 목록처럼 표시하지 않는다. |
| `review.groups.approve` (write) | `review groups approve` / `approve_review_group` | requestId, baseline, groupId, 정확한 proposal revision과 사람 결정 → 승인·교정 저장·문서 재생성·mapping 결과 각각과 새 baseline. 사람 승인 근거 없이 비서가 스스로 적용하지 않는다. |
| `review.groups.reject` (write) | `review groups reject` / `reject_review_group` | requestId, baseline, groupId, 사람 판단·이유 → 거절 이력과 잔여 문제. 문서 교정 없음. |
| `review.groups.undo` (write) | `review groups undo` / `undo_review_group` | requestId, baseline, 승인 receipt/groupId → 승인 교정 비활성화·원본부터 replay·공식 재생성 결과. 후속 의존 교정 충돌 시 거부하며 임의 역텍스트를 쓰지 않는다. |
| 기존 status/regenerate + 완료 읽기 | `review status/regenerate/completion` / 동일 의미 도구 | status는 같은 requestId; 재생성은 최신 baseline; 완료는 현재 content revision → 기존 no-replay 안내·단계별 결과 또는 미완료 조건 목록. |

읽기는 현재 자료 검증을 위한 receipt를 반환하되 모든 읽기 바이트를 영속 ledger에 저장하지 않는다. 쓰기는 UUID·operation/version·scope·success/failure/uncertain·전후 revision·단계별 저장 결과를 반환한다. Host 실패를 다른 Host/로컬 CLI의 재실행으로 대체하지 않는다. timeout·취소는 해당 요청 소유이며 모델 응답 중단을 교정 취소/원복 성공으로 표시하지 않는다.

공통 material은 페이지·영역·항목·칸 locator·근거·coverage를 다룬다. Docling label·JSON pointer 해석, PDF 내 provenance 좌표 변환, `.docling` 압축·교정 replay는 플러그인 책임이다. Host는 provider capability를 검사하고 SDK 공통 envelope·권한·상한·revision을 검증한다. Core는 Litzio 문서 의미·유효성·canonical 생성/쓰기만 소유한다. CLI·화면이 독자적으로 Docling JSON/Markdown 의미를 구현하지 않는다.

## 안전장치와 패치 형식 판단

- 원본의 모든 provenance 페이지를 확인하지 않은 글자 삭제·일괄 exclude를 거부한다. 부분 페이지에서 보이지 않는다는 이유는 삭제 근거가 아니다. 원본에 실제 없는 OCR 잡음 삭제는 별도의 충분한 근거와 사람 승인을 요구한다.
- 번호 깊이·제목 점프는 후보이지 자동 수준 교정 근거가 아니다. 글꼴·배치·주변 제목 관계·본문 재분류 가능성을 함께 본다.
- 근거 없는 추정, 상한으로 빠진 자료, 불명확한 수식/칸/각주 관계는 판단 불가다. 원문 오탈자·유효한 문단 연속·이미 보존된 furniture를 고치지 않는다.
- 현재 지원은 정확한 `text`, `kind:paragraph|heading`(heading level 1–6), `exclude`, `cell`(원본 index)이다. 원본 `orig`, PDF, 변환 JSON은 보존하고 복사에 replay한다. no-op·없는 target/index·미지원 키·stale baseline·중복/상충 패치는 저장 전에 거부한다.
- 승인 단위는 묶음의 정확한 대상 집합과 patch revision이다. 일부 대상 실패를 전체 성공으로 감추지 않는다. source-first 저장과 재생성은 두 파일의 원자적 transaction이 아니므로 기존 `correctionsSaved/documentRegenerated/regeneration-required`를 유지하고 새 baseline으로 명시 재생성한다.

| 보완 후보 | 판단과 최소 조건 |
| --- | --- |
| 문단 나누기 | S03의 합쳐진 정의와 S20의 발행기관+초록에 필요하다. 우회 text 삭제 대신 후속 구현에서 검토한다. 원본 텍스트의 정확한 분할 경계·공백 보존 규칙·생성 항목별 kind/순서/provenance·입력 key→Core target 대응이 필요하다. 이어지는 정상 문단은 분리하지 않는다. 원본 locator를 재번호화하지 않고 파생 항목 locator를 adapter가 소유하며 replay 결정성과 Undo를 검증한다. |
| 없는 표 칸 추가 | S07/S17에서 빈 grid 자리에는 원본 cell 자체가 없어 현행 cell patch가 불가능하다. 후속 구현에서 원본 table locator, 명시 행열 반열림 범위·span·text·header flags·근거 bbox를 받는 adapter patch를 검토한다. 기존 셀 중복 점유·범위 밖·추정 수식은 거부한다. 새 칸의 파생 locator와 생성 문서 mapping을 함께 검증한다. |
| 각주 연결·표 연속·roster·그림 내부 텍스트 | 현행 텍스트 패치만으로 의미 복구했다고 주장하지 않는다. 측정에서 발견돼도 판단 불가/미지원으로 남기고 후속 범위를 별도 결정한다. 모든 문제를 이번 두 패치로 해결할 수 없다. |

이번 PR에서는 patch schema를 추가하지 않는다. 보완의 의미와 유효성은 provider 변환·Core 공식 작성 계약에서 먼저 정의하고 UI의 문자열 조작으로 우회하지 않는다.

## `.docling` 저장·인계와 확인 기록 초기화

후속 `review.json`은 명시적인 형식 version과 immutable 원본 PDF/JSON 해시, ordered 교정 ledger, 검사 run/coverage, 문제 묶음, 사람 결정·적용/Undo 이력을 보관하는 안이다. 현재 `approval:null`을 완료 boolean으로 바꾸기보다 현재 content revision에 대한 완료 근거/미완료 이유를 계산한다. 과거 파일 migration은 소유자 지시 전 범위 밖이다.

원본 PDF/JSON bytes·해시는 변하지 않는다. content revision은 immutable 입력+유효 교정 ledger로 정하고, 압축 파일 전체 revision 및 Host link revision과 구분한다. 검사/진행/거절만 저장해 archive hash가 바뀌어도 문서 의미와 mapping을 무효화하지 않아야 한다. 현재 generated-progress가 link를 갱신하는 경계를 재사용하되 이 구분은 구현 시 추가해야 한다.

단일 `.docling` 인계로 교정·묶음·검사 근거를 읽고 동일 결과를 재생성할 수 있어야 한다. daemon 수명의 bundleRef·requestId 결과 cache·절대 경로·대화 ID는 이식 가능한 권한/완료 증거로 사용하지 않는다. 다른 Host에서는 등록된 provider와 원본/교정 해시를 재검사하고 새 bundle/mapping·연결을 발급한다. 과거 모델 판단은 이력이지 새 검사를 실행했다는 증거가 아니다. provider/profile 또는 입력이 달라 재현할 수 없으면 완료를 보류한다.

| 변화 | 초기화 범위 |
| --- | --- |
| 승인 교정·Undo·원본/변환 입력 교체 | 첫 구현은 현재와 같이 **모든 페이지의 비서 검사와 사람 확인을 무효화**한다. 이전 기록은 삭제하지 않고 superseded로 보존한다. 부분 페이지 무효화는 관계 의존성 증거가 생기기 전 구현하지 않는다. |
| 규칙/검사 지시문·변환 profile/provider 의미 버전 변경 | 해당 검사 run을 현행 완료 근거에서 제외하고 재검사한다. 자동 재교정·과거 사람 판단 복사는 하지 않는다. |
| 제안 저장·거절·lastPage/선택·확대·사람 페이지 확인 | 문서 의미 검사 결과는 유지하되 열린 문제/사람 처리 상태를 다시 계산한다. 새 증거가 기존 no-issue와 충돌하면 해당 판단을 다시 연다. |
| 재생성·외부 `.md` 편집·mapping 불일치 | 새 mapping과 결과 문서 검증 전 완료 불가. 원본 검사 이력은 보존하되 결과에 대한 완료 승인을 무효화한다. 외부 편집을 교정 ledger에 자동 역수입하지 않는다. |

## 측정 설계와 결과

### 입력과 판정 방법

2026-11-10에 [LSR 1.1](../../community-plugins/docling/sample/lsr-1.1/README.md)의 동일한 13쪽 변환을 재사용했다. 텍스트 156+표 10+그림 2=168항목이며 원본 변환 JSON SHA-256은 `fc3a4b657e3bbd530c245226f191a8b9b9b53b3e1ab5f599389323aa7c47098d`다. 변환을 다시 실행하지 않아 변환기의 변동을 비교에 넣지 않았다. 원래 profile은 `litzio-pdf-en-v1`, docling-serve 1.32.0 / Docling 2.124.0 / core 2.93.0, embedded 144dpi PNG다. Docker를 조작하지 않았다.

규칙은 직전과 같은 과거 `candoc/diagnostics.py` 고정본(`399e930`)의 반복 가장자리·번호 깊이 후보, 참조/parent-child/순환/page/bbox·셀 중복 검사, 제목 jump다. 현재 규칙 계약으로 채택한 것이 아니다. 같은 원본 해시의 직전 규칙 결과를 고정 입력으로 재사용했으며 이번에 규칙을 재실행하지 않았다. 후보는 제목 jump 1묶음·2항목이고 구조 무결성 오류는 0건이다. 과거 IEEE-1547 JSON 조사도 셀 범위 중복·제목 번호와 계층·각주/머리말 혼합을 후보로 삼았지만 PDF 없이 확정하지 않았다는 경계를 유지한다. 번호만으로 수정하거나 0건으로 의미 품질을 통과시키지 않는다.

세 방식은 `gpt-6.1-terra` / `high`, 같은 현행 patch schema와 전체 구조를 제공하는 지시문으로 각 1회씩 측정했다. 정답은 AI 입력에 넣지 않고 응답 고정 후 작성자 기대 구조 208요소·21사례와 수작업 대조했다. 외부 지식·도구·파일 탐색을 금지했고 event 기록상 도구 호출은 0이다. 출력 JSON schema를 강제해 원시 응답 46/46이 파싱됐다.

| 방식 | 실제 제공 자료와 호출 단위 |
| --- | --- |
| JSON만 | 전체 문서 항목·body/furniture 구조·parent/children·provenance·`orig/text`·표 칸·header flags와 페이지별 focus, 규칙 후보. 이미지·정답 없음. 13쪽 각각 1회. |
| JSON → 후보 영역 이미지 | 위 13회 결과를 고정한 뒤, finding이 지목한 refs의 모든 provenance bbox만 여백과 함께 잘라 확인. JSON 무후보 1쪽은 추가 호출 없음; 12쪽에 12회. 전체 JSON을 다시 제공하고 원래 후보의 확인/거절에 한정했다. 이미지 확인으로 새 후보를 역으로 1차 결과에 넣지 않았다. |
| 전 페이지 이미지+JSON | 같은 JSON에 focus 페이지·인접 페이지·focus 항목의 모든 provenance 페이지 PNG, 수식·표 bbox 확대를 추가. 13쪽 각각 1회. 확대는 동일 PNG의 2배 resize이며 새 고해상도 원본은 아니다. |

공통 지시문은 규칙 무후보 페이지도 독립 검사, 본문 재분류 허용, 실제 `table_cells` index와 완전한 replacement text, 오류 확신/복구 가능성 분리, 모든 provenance 페이지 확인, 보이지 않는 글자 삭제 금지, 미지원 변경의 패치 보류를 명시했다. `orig`와 전체 문서 문맥 추가, schema 강제, 모델·추론 강도도 직전과 달라졌으므로 아래 차이를 프롬프트 하나의 효과로 분리할 수 없다.

### LSR 비교

직전 보고의 실제 차이 14사례(S02/03/05/06/07/09/10/12/13/16/17/18/19/20)를 고정 비교군으로 쓴다. **검출은 실제 차이 하나 이상의 올바른 후보 발견이며 판단 불가 후보도 포함**한다. 괄호의 확정은 오류 자체를 확정한 사례다. 정확 제안은 실제 patch 내용이 맞는 부분 수정 사례이며 완전 복구율이 아니다. 판단 불가는 필요한 복구 중 패치 없음·지원 불가·수정 보류가 남은 사례다. 열들은 중복되고, 한 사례 안의 추가 놓침은 별도다.

| 방식 | 검출 / 14 (확정) | 정확 부분 제안 사례 / patch 수 | 판단 불가·복구 보류 / 14 | 사례 전체 놓침 | 위험 patch | 잠정 묶음 / 고유 대상 |
| --- | --- | --- | --- | --- | --- | --- |
| 직전 Luna low, 페이지 PNG+부분 JSON | 10 (분리 집계 없음) | 1 / 2 | 10 | 4 | 2 | 10 / 20 |
| JSON만, Terra high | 14 (12) | 1 / 2 | 14 | 0 | 0 | 11 / 40 |
| JSON → 후보 이미지, Terra high | 14 (14) | 2 / 3 | 12 | 0 | 0 | 11 / 39 |
| 전 페이지 이미지+JSON, Terra high | 14 (14) | 3 / 4 | 12 | 0 | 0 | 10 / 34 |

직전 위험 patch 2개는 정상 각주 정의의 `107`을 위첨자로 바꾸는 변경과 발행기관 문자열 삭제다. 이번 위험 patch 0은 이 한 번의 응답에서 관측되지 않았다는 뜻이며 제품 안전장치 구현·위험 제거의 증명이 아니다. 0놓침은 14사례 각각에서 하나는 찾았다는 뜻이다. 208요소의 완전 정답률, 전체 오류 recall/precision, 모든 칸·각주 관계의 복구 성공률은 산출하지 않았다.

잠정 묶음은 직전과 같이 이유 범주로 연구자가 합친 **거친 검토량 추정**이며 규칙 대상과 오탐/보류를 포함한다. 같은 발행기관+초록 문제의 페이지별 중복은 하나로 합쳤다. 표 메타데이터 범주 안의 caption/header/continuation은 실제 UI에서는 서로 다른 복구 묶음으로 나눠야 하므로 위 수가 완성된 제품 모델의 처리 횟수는 아니다. 이번에는 더 많은 문제·의심 대상이 나와 고유 대상이 늘었다. 검토 시간 절감이나 안전한 검토 축소율로 환산하지 않는다.

주요 사례별 결과는 다음과 같다.

| 사례 | JSON만 | 후보 이미지 | 전 페이지 이미지 |
| --- | --- | --- | --- |
| S02: Annex L 제목 계층 | 문서 목차/구조로 검출하나 병합이 필요하다고 과도하게 보류 | 같은 보류 | 같은 보류. 실제 정답은 연속 component heading도 허용하므로 level 1 패치가 가능하다. |
| S03: 굵은 본문·정의 | 본문 오분류와 정의 병합을 의심, 정의 분할은 검출 | 정의 병합 확정, 본문 역할은 고립 crop만으로 여전히 판단 불가 | 본문을 `kind:paragraph`로 정확 제안, 정의 나누기/합치기는 미지원 |
| S07/S17: 표 안 누락 수식 | 빈 수학 칸을 의심하지만 원문 존재/내용 판단 불가 | 누락을 확정하고 min/max 내용을 읽음, 없는 칸 생성은 미지원 | 같은 한계. row/column을 원본 cell index로 가장하지 않음 |
| S09/S16: 표 연속·121번 각주 | 설명 문장·관계·양쪽 페이지 항목으로 검출 | 관계 근거 확인, 패치 미지원 | 양쪽 페이지 대조로 확인. 정상 문단 연속을 오류로 기각하지 않음 |
| S12: 그림 | 축 제목 `#/texts/105`의 그림 밖 분리를 구조로 검출 | 확인 | 확인. 세 방식 모두 9쪽 graph edge 부재를 추가 문제로 출력했으나 이미지 보존과 graph 의미 복구는 달라 엄격 오류에서 제외함 |
| S13/S18: 수식 | `orig`의 (1)/(2)로 번호 추가 2patch, 세제곱근은 설명과 충돌을 발견하지만 정확 식 복원 보류 | 원본을 보고 식 (3)까지 3patch | 3개 식+본문 재분류 총 4patch. 식 (3)의 근호 차수 3·상한 9를 복원 |
| S19/S20: 각주 범위·별개 문단 | 명시 설명으로 잘못된 표 연결/문단 병합 검출 | 확인하되 모두 미지원 | 같은 한계. 발행기관 삭제 대신 문단 분리 보류 |

또한 전 페이지 방식은 직전 보존 판정 S04의 4쪽 표에서 **row-header metadata 손실**을 발견했다. 작성자 기대 구조의 `row_header:true`와 변환값 false가 다르다. 5쪽의 명시적인 빈 칸 누락 등 추가 지적도 있다. 비교군을 사후에 늘려 이전 점수를 바꾸지 않고 별도 관찰로 남긴다. 모든 방식에서 일부 주장은 과도했다. 예를 들어 5쪽 표는 기존 `footnotes` 연결이 있는데도 연결 전체가 없다고 기술했다. 위첨자 손실이라는 실제 차이를 발견했어도 근거 설명 전체가 정확하다는 뜻은 아니다.

각 방식의 **출력 그대로**인 patch를 현행 `applyCorrections`에 replay하고 `convertDocument`/공개 SDK 작성 경로에 전달했다. JSON 2·후보 이미지 3·전 페이지 4patch 모두 수용됐고 원본 객체는 보존됐다. 이는 오프라인 replay·작성 요청 수용 근거다. 실제 Host 파일 저장, 수식 번호 렌더링·참조 의미, 사람 승인/Undo와 최종 Litzio 문서 충실도는 검증하지 않았다.

### 호출·토큰과 Sol 비교

아래는 CLI event의 실제 usage 합계다. 토큰은 청구액이 아니며 구독/과금 단가를 추정하지 않았다. cached input은 input의 부분집합이고 reasoning output은 별도 관측값이다. JSON→후보 행은 1차 JSON 호출을 포함하므로 실험 총합에서 JSON 행과 중복 계산하지 않는다.

| 방식 | 호출 수 | 입력 토큰 (cached) | 출력 토큰 | reasoning output |
| --- | --- | --- | --- | --- |
| JSON만, Terra high | 13 | 1,065,799 (162,304) | 7,562 | 1,366 |
| JSON→후보 이미지, Terra high | 25 = 13+12 | 2,117,079 (376,320) | 14,798 | 1,741 |
| 전 페이지 이미지+JSON, Terra high | 13 | 1,158,755 (172,544) | 5,991 | 765 |
| 같은 입력 2·5·7·11·13쪽, Sol high | 5 | 455,441 (12,928) | 6,892 | 3,119 |
| NIST 3쪽, Terra high | 3 | 375,869 (45,568) | 1,702 | 351 |

**고유 AI 호출은 총 46회: Terra high 41회, Sol high 5회**다. 총 입력 4,107,144·출력 29,383토큰이다. 직전은 Luna low 13회+Terra high 3회=16회였다. 이번 JSON 전용은 전체 이미지 방식보다 입력이 약 8% 적었고, 후보 확인 방식은 전체 이미지 방식의 약 1.83배 입력을 썼다. 모든 호출에 전체 JSON을 반복 전달한 구성의 비용이며 JSON 방식 일반의 하한/최적 비용이 아니다. 부분 문맥·배치·cache 최적화는 이번에 구현하지 않았다.

같은 5쪽·같은 입력의 Terra는 지적 16건·정확 부분 patch 2개, Sol은 20건·3개였다. 두 모델 모두 발행기관을 삭제하지 않았고 누락 표 칸 생성은 보류했다. Sol은 Terra가 불필요하게 보류한 Annex L component 제목을 정확한 `kind:heading,level:1`로 제안했고 세제곱근도 복원했다. Sol 3patch도 현행 replay·SDK 작성 경로가 수용했다. 반복 측정이나 전 페이지 Sol 검사는 아니므로 모델 우열·완전 정답률로 일반화하지 않는다.

### NIST 발췌와 JSON 전용의 원리적 한계

[보관 fixture](https://github.com/litzio/litzio/tree/ce90560aacaee2482d37c4b25e36e93060ed156c/plugins/docling/test/fixtures/nist-sp1108r4)의 11쪽 발췌 중 6·9·10쪽(인쇄 17·20·21쪽)을 Terra high로 검사했다. 보관 PDF/변환 JSON/PNG를 그대로 사용했고 재변환하지 않았다. 독립 작성자 정답·직전 NIST 비교군이 없으므로 LSR의 14사례 표에 합산하거나 recall/놓침 수를 만들지 않는다.

7지적 중 5개가 text patch를 포함했다. 9쪽 그림의 `M9gmt`→`Mgmt`는 원본 이미지와 맞는 OCR 부분 수정이다. 나머지 4개는 em dash/apostrophe/공백 보존 제안으로 의미 오류와 구별한다. 다른 지적은 그림 label children 읽기 순서와 각주 15의 위첨자 역할이며 현행 patch로 보류했다. 직접 PNG 대조에서 제안 내용은 확인했지만 이 3쪽의 미발견 오류 수·전체 정확도·저장/렌더링은 확인하지 않았다. 작은 그림 글자는 제공된 해상도의 한계도 남는다.

JSON만으로 잡을 수 있는 것은 참조/셀 점유 등 내부 구조 충돌, 반복 머리말/제목 jump 후보, 다른 항목과의 논리 모순과 명시 설명의 불일치다. 이번 LSR는 스스로 “원래 어떻게 읽어야 하는가”를 설명하는 문장과 `orig`, bbox가 많아 JSON 성과가 유리했다. 실제 문서 전체로 일반화하지 않는다.

반대로 **서로 다른 두 원본이 같은 변환 JSON을 만들면 JSON만 받은 검수자는 어느 원본이었는지 구별할 수 없다.** 다음은 원본 대조가 필요한 경계다.

- 표의 빈 자리가 원래 빈 칸인지 변환기가 놓친 분수/min/max인지: S07/S17은 JSON으로 의심 가능하지만 정확한 원문 수식은 이미지가 필요했다.
- 일관되게 잘못 읽힌 글자·숫자·부호·수식: NIST의 문장부호 원형, LSR 식 (3)의 원래 상한 9 등. `orig`나 주변 설명이 다른 증거를 남긴 경우만 JSON 내부 비교가 가능하며, 그것도 원본과 독립인 증거는 아니다.
- 흔적 없이 통째로 빠진 문장·표 칸·그림 내부 내용, 또는 내부적으로 자연스러운 다른 값: 이번 변환에서 없는 특정 누락을 새로 관측했다고 주장하는 것이 아니라 JSON 전용의 식별 불가능 범위다.
- 시각적 본문/제목·정의/별개 문단 경계: JSON 후보로 좁힐 수 있어도 좁은 crop만으로 주변 위계를 못 읽는 경우가 있었다.

권고는 JSON/규칙을 빠른 후보 정리에 쓰되, #1462의 최종 검사는 전 페이지 이미지+변환 내용으로 유지하는 것이다. 후보 확인 방식은 준비 단계 또는 명시적으로 한정된 검수에는 쓸 수 있지만 무후보 페이지를 확인한 것으로 표시하지 않는다. 이번에는 어느 방식도 열린 복구 문제 0을 달성하지 못했으므로 검수 완료가 아니다.

원시 입력·PNG/crop·프롬프트·schema·응답/event·호출 manifest·사례 판정·patch 검증은 로컬 `tmp/stage3-detection-v2/`에만 보관하고 커밋하지 않는다. 이전 14사례 비교군의 요약 근거는 [#1462](https://github.com/litzio/litzio/issues/1462)와 위 사례별 표다. 이 문서에는 공개 가능한 요약과 재현 범위만 싣는다.

## 구현 순서와 검증 경계

#1462의 순서를 유지한다: 공용 material/규칙/묶음 저장·읽기와 CLI·비서 → 안전장치 → 필요한 patch 보완 판단 → 공통 문제 묶음 화면. 문서와 측정만으로 후속 구현이 끝났다고 표시하지 않는다.

의미·보존은 기존 Docling replay/작성 검사, 공용 revision·stale·no-replay·부분 실패는 기존 generated-document/review Host 검사, CLI·비서 도구는 같은 정의의 실제 호출 연결에서 검증한다. 전체 블록 승인을 다시 도입하지 않고 실제 LSR/실문서의 workflow 완료·누락과 위험 제안을 별도 수락 근거로 남긴다. UI 구현 시 [UI 결정표](ui-decision-table-v1.md)와 [반복 패턴](ui-patterns-v1.md)을 읽고 기존 review 목록·상세·Notice·Button·대조 뷰를 우선 재사용한다. 이번 PR은 화면 구조·시각 승인을 포함하지 않는다.
