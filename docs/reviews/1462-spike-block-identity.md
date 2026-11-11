# #1462 검증 실험 ②: 교정 후 원본 대응과 텍스트 블록 ID

- Status: Historical
- Date: 2026-11-11
- Base: `origin/feature/docling-stage3`, `519a10182bc0eeae038652c62057a034d1b8face`
- Branch: `spike/1462-block-identity`
- 변경 범위: 이 보고서와 `scripts/spikes/1462-block-identity/`만. Core·SDK·Host·저장 형식·화면 변경, PR, 병합 없음.
- Last verified: 2026-11-11 — spike `903931ef5c74a26ee9f4b99703282bc9dbe26d92` 보고서·링크 이관 점검. 실험 재실행 없음.
- Scope: 당시 실험 기록. 현재 교정 방향은 [아키텍처 확정](../design/docling-review-stage3.md#2026-11-11-아키텍처-확정소유자-승인)을 따른다. 스크립트·fixture는 이 PR에 포함하지 않는다.

## 판정

**A 통과. B는 현재 Core 단일 연산만으로는 실패하며, 실험 안의 target 쌍 처리 함수를 사용하면 통과한다.**
두 fixture 각각에 7개 연산을 연속 적용했다. A와 B 임시 처리의 총 112개 checkpoint에서
잘못된 원본 연결 0, 조용한 출처 소실 0이었다. 이는 시험한 연산과 명시적 대응 갱신에 한정된다.
Core 그대로의 B에는 별도 독립 probe 7개를 적용했다. 잘못된 연결 2, 출처 소실 4,
합치기 거부 1이 나왔다. 이 probe 합계는 연속 실행 checkpoint의 수치와 섞지 않는다.

질문 1에는 **가능하다**고 답한다. 경로 재계산은 26줄의 연산별 함수로 끝났으며 diff·무효화 엔진이 필요하지 않았다.
질문 2에는 **텍스트와 MyST 해석상의 ID는 저장되지만, 블록과의 결합 수명은 자동 보장되지 않는다**고 답한다.
B 임시 처리는 44줄로 A보다 작지 않았다. ID가 원본 페이지·bbox 자체를 담는 것도 아니다.

**현재 교정 실험에는 A를 추천한다.** 문서 revision에 묶인 대응을 각 Core 연산 직후 갱신하면 충분하다.
경로를 영속 identity로 승격하지 않는다. #347 같은 외부 참조에 B를 쓰려면 별도 정체성 계약과
Core의 target 결합 연산이 먼저 필요하다. 이 spike는 그 기능을 구현하거나 제품 방향으로 확정하지 않는다.

## 읽은 결정과 기존 계약

`gh issue view 1462 --comments`와 API의 마지막 두 댓글을 확인했다.

- [순서 재조정](https://github.com/litzio/litzio/issues/1462#issuecomment-6782543427): 2026-11-11 소유자 승인. Docling 패치를 전제로 한 세부는 다음 결정에 따라 재작성 대상이다.
- [교정 대상 전환](https://github.com/litzio/litzio/issues/1462#issuecomment-6783018003): 원본 PDF는 증거, DoclingDocument는 불변 해석 가설, 리치오 문서는 Core 연산으로 교정되는 결과다. 조회 시 이 댓글이 최신이었다. 이후 실험 지시는 이번 작업 지시를 따른다.

[AGENTS](../../AGENTS.md)와 [문서 색인](../README.md)을 확인하고,
[ADR-0002](../adr/0002-document-persistence-semantic-ownership.md),
[ADR-0003](../adr/0003-document-addressing-identity-boundary.md),
[Section references](../design/section-references-v1.md)의 표현·Core 절,
[Table caption](../design/table-caption-v1.md)의 저장·logical cell path 절,
[Document editing](../design/document-editing-v1.md)의 변환·구조 편집 관련 절을 확인했다.
큰 설계 문서는 통독하지 않았다. 문서 색인의 stage3 항목은 Draft이며, 옛 patch/replay 설명을 현재 authority로 사용하지 않았다.

## 입력과 재현

- [합성 fixture](https://github.com/litzio/litzio/blob/903931ef5c74a26ee9f4b99703282bc9dbe26d92/scripts/spikes/1462-block-identity/synthetic.json): 제목 1, 문단 6, 표 1. 동일한 `Repeated sentence.`가 서로 다른 페이지의 두 문단과 표 칸에 나온다. 페이지·bbox는 합성이며 PDF 충실도를 측정하지 않는다.
- [LSR 발췌 fixture](https://github.com/litzio/litzio/blob/903931ef5c74a26ee9f4b99703282bc9dbe26d92/scripts/spikes/1462-block-identity/lsr-excerpt.json): 실제 Docling 반환값 중 제목 1, 문단 4, 표 1을 고른 비연속 발췌다. 원본 `#/texts/40,33,24,45,44`, `#/tables/3`을 사용한다. 작은 DoclingDocument의 배열을 재번호화했으며 `sourceRefs`에 원래 참조를 보존한다. 텍스트·prov·표 data를 보존하고 캡션·children·이미지는 실험 범위에서 제외했다.
- 두 입력 모두 기존 `community-plugins/docling/document.js::convertDocument`를 패치 없이 호출한다. Host가 제공하는 SDK import binding만 스크립트에서 같은 로컬 SDK로 연결한다. 최초 대응은 반환된 `report.items[].targets`를 역으로 모은 것이다. `workspace.js`의 correspondence와 같은 source→target path 구조지만, 실제 Host `workspace-seal` 호출이나 기존 작업공간 저장을 시험한 것은 아니다.
- LSR 원본 PDF SHA-256: `63cda884de96dfd0357843a534895f1beb7a10b24f3244398d930817a32b82ea`.
- LSR은 기존 실행 중인 docling-serve 1.32.0에 고정 `litzio-pdf-en-v1` 프로필로 한 번 제출했다. 작업 `31c75045-6d68-4519-8b5a-61dfbbf794b3`의 결과는 **partial_success**, `document_backend / preprocess / backend_failure / Page 2 failed to parse.`였다. 기존 archive 경로가 이를 거부했다. 재제출하지 않고 같은 task 결과를 읽었다. 전체 13쪽 변환 성공이나 이전 168항목 결과의 재현을 주장하지 않는다.
- 반환 DoclingDocument는 142개 text를 포함했다. 이미지가 포함된 약 4.15 MB의 원본 반환물은 `tmp/`에만 두고 커밋하지 않았다. 저장한 JSON 표현의 SHA-256은 fixture의 `rawDocumentSha256`에 기록했다. 살아남은 항목의 추적 실험 통과가 누락된 2쪽을 보완하지 않는다.

저장소 루트에서 실행한다. 주 실험은 서버 없이 커밋된 fixture로 재현된다.

```powershell
pnpm install --frozen-lockfile
pnpm exec tsx scripts/spikes/1462-block-identity/run.ts
```

전 단계 `.md`, 실험용 대응 snapshot, 전체 결과, 최종 export가 `tmp/block-identity/`에 생성된다.
대응 JSON은 spike 재열기 검사용 산출물이며 새 제품 저장 형식 제안이 아니다. snapshot은 canonical 문서 hash에 결합해 확인한다.
[커밋된 요약](https://github.com/litzio/litzio/blob/903931ef5c74a26ee9f4b99703282bc9dbe26d92/scripts/spikes/1462-block-identity/result-summary.json)은 실행 결과에서 복사한 작은 기록이다.

새 LSR 변환이 필요할 때만 `prepare-lsr.ts`를 명시적으로 실행한다. 기존 고정 변환 helper를 사용하며
archive 거부 시 같은 task 결과만 보존하고 exit 1을 유지한다. 기존 raw result 경로를 인자로 주면
서버 요청 없이 보존 단계를 재현할 수 있다. 이 실행의 반환물은 완전한 변환 성공으로 승격하지 않았다.

## 연속 연산과 기대값

각 연산의 대상은 현재 snapshot의 경로 또는 ID 조회 결과다. 문장 첫 일치를 찾는 `replaceText`는 사용하지 않았다.
fixture의 `expectedOrder`와 `expectedChanges`가 기대값이며 A/B 갱신 함수에서 기대값을 만들지 않는다.

| 순서 | 공개 Core 연산 | 합성 fixture | LSR 발췌 |
| --- | --- | --- | --- |
| 1 | `updateNodeTextAtPath` | 두 번째 반복 문장만 교정. 첫 번째와 표 칸은 그대로 | `#/texts/33`의 `protcol` 교체 |
| 2 | `convertBlock` | 첫 번째 반복 문단을 H3로 | `#/texts/24` 문단을 H3로 |
| 3 | `splitParagraph` | `First half.` / `Second half.` | 두 페이지에 걸친 `#/texts/45`를 첫 문장 뒤에서 분할 |
| 4 | `mergeParagraphWithPrevious` | 1쪽 front와 2쪽 back 합치기 | 직전 분할 두 조각 재결합 |
| 5 | `moveBlock` | 교정한 반복 문단을 표 뒤로 이동 | 교정한 문단을 표 뒤로 이동 |
| 6 | `removeBlock` | 삭제 기록을 남기고 대응 제거 | `#/texts/44` 삭제 기록과 대응 제거 |
| 7 | `updateTableCell` | `[table,1,1]`의 오탈자 교체 | 같은 logical 칸을 `checked`로 교체 |

LSR의 교정·종류 변경·칸 값은 추적을 시험하기 위한 인위적 편집이다. 실제 검수자가 승인한 수정안이나 변환 정확도 판정이 아니다.
LSR 표는 고른 문단들과 원본에서 연속하지 않는다. 합성의 쪽 경계 합치기는 서로 다른 두 원본 ref를 합쳐 union을 확인한다.
LSR `#/texts/45`는 Docling 단계에서 이미 물리 6·7쪽 두 bbox를 가진 하나의 논리 항목이다.
그 분할 조각 둘은 모두 두 bbox를 공유하고 `estimated: true`다. 실제 글자별 영역을 새로 추정하지 않는다.
LSR은 분할 offset에 첫 문장 뒤 공백까지 포함해 합치기 후 원래 문자열을 복원한다.
Core 합치기는 구분 공백을 자동 삽입하지 않으며 합성의 front에는 원래 공백이 있다.

A의 의미는 path→출처 목록이다. 나누면 뒤 경로를 +1 하고 두 조각을 추정으로 표시한다.
합치면 앞 경로에 ref별 원본 영역의 합을 남기고 뒤 대응을 지운 뒤 후속 경로를 -1 한다.
이동은 지나간 구간의 경로만 ±1, 삭제는 별도 deleted 기록과 후속 -1이다.
출처의 page_no·bbox·coord_origin·charspan은 원본 값 그대로 비교한다.

B의 의미는 ID→출처 목록이다. 매번 현재 Core projection에서 target과 바로 뒤 블록을 찾는다.
`b-001` 같은 번호는 이 실험 문서 안에서만 유일하며 문서 간 전역 주소가 아니다.
나누면 앞 ID 유지·뒤 새 ID, 합치면 앞 ID 유지와 `merged(old,new)` 기록,
이동은 두 `moveBlock`, 삭제는 본문과 target 각각 `removeBlock`을 호출한다.
이 조합은 스크립트 내부 처리이며 Core가 보장하는 하나의 원자적 연산이 아니다.
추가로 반대 방향으로 이동했다 돌아오는 조합도 최종 source 동일성을 확인했다.

## 비교와 실패 사례

| 항목 | A: 경로 갱신 | B: 텍스트 target + 실험용 쌍 처리 |
| --- | --- | --- |
| 갱신 코드 크기 | `path-map.ts` 측정 구간 26줄 | `target-pairs.ts` 측정 구간 44줄 |
| 코드 크기 산정 | 주석·빈 줄 포함, 입출력·초기화·검증 harness 제외 | 같은 기준. 공통 union 함수는 양쪽에서 제외 |
| 연속 연산의 잘못된 연결 / 조용한 소실 | 0 / 0 | 0 / 0, 단 쌍 처리 사용 시 |
| 반복 문장 | 경로로 두 번째만 교정, 독립 출처 유지 | ID를 현재 경로로 해석해 두 번째만 교정 |
| 나누기·합치기 | 후속 경로 이동과 출처 union 필요 | 새 ID 할당과 merged alias, target 제거 필요 |
| 이동·삭제 | 경로 구간 이동 / 삭제 기록 | ID별 출처는 그대로지만 target과 본문을 함께 움직이거나 삭제해야 함 |
| 저장·재열기 | 같은 revision의 대응 snapshot과 함께 경로 유지 | ID 줄은 canonical `.md`에 그대로 유지, 대응은 별도 |
| 단독 `.md` export | 블록을 외부 durable ID로 추적할 수 없음. 동일 hash의 대응이 있으면 위치 추적 가능 | ID로 블록을 찾을 수 있음. PDF·bbox 추적에는 ID→출처 대응과 증거가 여전히 필요 |
| 원문 가독성 | ID 줄 없음 | 발췌 6블록 기준 26→38줄. ID 6줄과 빈 줄 6줄 증가 |
| 범용 추적 엔진 필요 | 시험 범위에서는 없음 | 시험 범위에서는 없음. 임시 쌍 처리만 사용 |

원문에 ID 줄을 넣는 것만으로는 B가 완성되지 않는다. Core 단독 probe는 각각 같은 저장된 초기 문서에서 실행했다.

| Core 단독 동작 | 잘못된 연결 | 조용한 출처 소실 | 관측 |
| --- | --- | --- | --- |
| 글자 교정 / 종류 변경 / 표 칸 교정 | 0 | 0 | 선행 target 그대로 유지 |
| 나누기 | 0 | 1 | 뒤 조각에 새 ID 없음 |
| 합치기 | 해당 없음 | 해당 없음 | 직전 형제가 target이므로 `operation requires a paragraph`로 거부 |
| 이동 | 1 | 2 | 본문만 이동, 원래 target은 다른 블록 앞으로 남음. 기대 ID의 미해결·오연결 발생 |
| 삭제 | 1 | 1 | 삭제된 본문의 target이 다음 표 앞으로 남음. MyST의 다중 선행 target 해석으로 다음 표의 기대 ID도 유지되지 않음 |

여기서 잘못된 연결은 ID 해석 결과가 기대 블록 경로와 다른 경우 및 삭제된 ID가 다른 블록을 가리키는 경우다.
조용한 소실은 살아 있는 기대 블록을 자신의 기대 ID로 찾지 못하면서 Core 연산이 성공한 경우다.
같은 결함이 두 지표에 모두 잡힐 수 있다. 실험 검출기가 이를 보고했지만 Core 연산 자체에는 출처 경고가 없다.

## 문단 target과 필요한 Core 최소 변경

중요한 구분이 있다. **문단 앞 MyST target의 파싱·직렬화·참조 해석은 현재 Core에서도 된다.**
제목·문단·표 앞에서 `insertTarget` 후 저장·재파싱하면 MyST lookup은 각각 바로 뒤 블록을 가리켰다.
따라서 이를 지원하려고 parser나 `label.ts`를 새로 만드는 변경은 필요하지 않다.
반면 Core의 문단 projection에 소유 label은 없고 `updateLabel(document, paragraphPath, ...)`는 거부한다.
`insertTarget`의 round-trip 검사는 target 노드의 type/label 보존만 확인하며,
이후 편집에서 본문과 함께 따라가는지까지 보장하지 않는다.

같은 sibling `(id)=` 표현을 유지한다는 전제에서 필요한 최소 지점은 다음과 같다. 이번에는 고치지 않았다.

1. `packages/core/src/editable.ts`의 `EditableBlock`, `getEditableDocument` / `toBlock`: 선행 target과 본문의 연관을 editor-neutral projection으로 읽는 작은 정의. 지금은 target과 paragraph가 별도다. 표의 기존 `:name:`과 선행 target을 혼동하지 않아야 한다.
2. `packages/core/src/operations.ts`의 `moveBlock`, `removeBlock`: 대상 본문의 선행 target도 같은 의미 연산에서 옮기거나 제거. 현재 두 호출의 스크립트 조합이 필요하다.
3. 같은 파일의 `splitParagraph`, `mergeParagraphWithPrevious`: 나누기 뒤 ID의 입력/할당 책임을 정하고, 합치기에서 중간 target을 처리하면서 앞 ID 보존·뒤 ID 병합 결과를 반환. `convertBlock`은 sibling target을 이미 보존했으므로 이 표현에서는 변환 로직의 재작성 근거가 없다.
4. `packages/core/src/myst/reference.ts::prepareReferences/targetLine`, `myst/label.ts::referenceTargetIndex`, `operations.ts::insertTarget/assertLabelRoundTrip`는 이미 되는 구문 보존과 target 해석 경계다. 새 결합 계약의 회귀 검증 지점이지 전부 수정해야 한다는 뜻은 아니다.

문단 AST에 label 속성을 직접 추가하는 다른 설계를 택하면 `myst/native.ts::supportedBlock`의 허용 필드,
`operations.ts::TEXT_BLOCK_FIELDS/convertBlock`, serializer round-trip 의미까지 추가로 검토해야 한다.
이 실험은 그런 설계를 만들지 않았다. ID 생성·merged alias·문서 간 주소·임의 Source 편집의 정체성은 별도 결정 대상이다.

표 칸에는 ID를 만들지 않았다. **이번 칸 값 교체에서는 표 ID + 0-based 행·열이면 충분했다.**
두 fixture 모두 `(row=1,column=1)`을 기존 converter report의 source cell index 3에 연결했다.
행·열 삽입·삭제·재정렬이나 병합 칸의 독립 정체성은 시험하지 않았으므로 일반화하지 않는다.

## 원문 발췌와 가독성

아래는 LSR 발췌를 변환하고 ID를 붙인 초기 `.md`의 두 구간이다. 중간의 다른 문단은 생략했다.
첫 구간은 원본 `#/texts/40,33`, 둘째는 `#/tables/3`이다. 내용 자체는 교정 전이다.
ID가 짧아도 짧은 문단마다 두 줄이 증가하고 Markdown을 훑을 때 본문 사이에 끼어든다.
이는 텍스트 발췌를 보고 내린 판단이며 실제 Editor Source 보기의 시각 승인으로 보지 않는다.
브라우저 캡처는 생략했다. 촬영만을 위한 runner·서버를 시작하지 않았다.

```markdown
(b-001)=

# 4. Duration bands and continued records

(b-002)=

The source intentionally spells the status as "protcol pending". A corrected spelling would be a separate editorial operation.
```

````markdown
(b-006)=

:::{table}
:enumerated: false

| Parameter     | Default settings | Default settings | Allowed settings | Allowed settings |
| ------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| Parameter     | Profile A        | Profile B        | Minimum          | Maximum          |
| Capture floor | ≥ 0.932 u a      | ≥ 0.941 u        | 0.90 u           | 0.98 u           |
| Delay factor  |                  |                  |                  |                  |
| Review path   | Archive stream   | Archive stream   | TCP              | Ethernet         |
| Review path   | Archive stream   | Archive stream   | N/A              | RS-422           |
| Record status | protcol pending  | protcol pending  |                  | 0                |
:::
````

## 검증 기록

- 주 실험: `run.ts` exit 0. 각 방식·각 fixture 28 checkpoint(초기·7연속 연산·최종의 즉시/재파싱/디스크 재열기, 단독 Markdown export 재열기), 총112개.
- 모든 checkpoint에서 블록 순서·종류·텍스트/전체 표 칸·원본 대응·추정 표시·삭제 기록을 비교했다. B는 ID와 merged alias도 비교했다. canonical write의 재안정성과 입력 DoclingDocument 불변을 확인했다.
- `run.ts --fault=swap`: 동일 문장 두 개의 대응을 실제로 교환하면 exit 1, `wrong source regions` 2건으로 검출한다.
- `run.ts --fault=drop`: 두 번째 반복 문장의 대응을 제거하면 exit 1, 대응 수 7 대 8 불일치로 검출한다.
- `prepare-lsr.ts`의 기존 raw result 재읽기: exit 1을 유지하며 `partial_success`와 2쪽 실패를 다시 표시했다.
- `pnpm docs:check`: exit 1, 이 보고서의 색인 누락 1건만 확인했다. 병합하지 않는 spike이므로 색인 연결을 생략하라는 작업 지시에 따라 색인과 checker를 바꾸지 않았다.
- `git diff --cached --check`: 통과. 커밋 대상의 로컬 경로·사용자명 포함 여부도 검사했다.
- 제품 Core/SDK 코드를 변경하지 않아 전체 제품 suite와 browser 검증은 실행하지 않았다. 실험의 실행 소비자는 위 수동 명령뿐이며 CI에 새로 등록하지 않았다.
- 작업에서 시작한 pnpm/tsx/Python은 종료됐다. docling-serve는 처음부터 실행 중이던 기존 컨테이너로, 시작·중지하지 않았다. 새 상주 server·watcher·browser session은 없다.

결과는 짧은 fixture와 반환된 LSR 항목의 Core＋파일 왕복에 대한 증거다. 전체 PDF의 추출 품질, 실제 Host 저장, Editor 조작, 임의 손편집, 외부 참조의 제품 성공을 뜻하지 않는다.
