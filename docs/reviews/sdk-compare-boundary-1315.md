# SDK 대조 뷰 경계 스파이크 #1315

- Status: Historical
- Date: 2026-11-06
- Branch: `spike/sdk-compare-boundary`
- Base: `5591f6e9c4c6f7211244e382d1a02ae19b8d67cb`
- Implementation model: `paseo inspect $env:PASEO_AGENT_ID --json` → `codex/gpt-6.1-sol`, high. Paseo skill used for inspect. No AI service calls.
- Scope: 로컬 Windows의 임시 플랫폼 실험. PR/push/이슈 변경 없음. 초기 실험 후 소유자 승인으로 임시 브랜치 로컬 커밋에 보존. 제품 완료·채택 계약이 아니다.
- Authority: [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0019](../adr/0019-plugin-tiers.md), [ADR-0020](../adr/0020-plugin-architecture.md), [plugin stage 1](../design/plugin-stage1-v1.md), [generated views](../design/generated-views-v1.md). 이 실험은 해당 Implemented 계약을 개정하지 않는다.

## 입력·출처·권리

보관 SHA `ce90560aacaee2482d37c4b25e36e93060ed156c`의 `plugins/docling/test/fixtures/nist-sp1108r4`에서 **document.json과 PNG 19개(페이지 11, 그림 8)**만 별도 OS 임시 디렉터리에 추출했다. `spike/compare/location.json`에 실제 경로·파일별 SHA-256·bytes를 보존했다. JSON hash는 `9940863e6110fea3ca065e65d3dc9da573b7f807a7b2a8edcf32688a67f3927d`다. 기존 document.md/map, PDF, 합성 대량 데이터와 사용자 파일을 실행 입력으로 쓰지 않았다. 추출된 데이터와 실패 시도 디렉터리도 보존했다.

원 자료는 Gopstein et al. (2021), *NIST Framework and Roadmap for Smart Grid Interoperability Standards, Release 4.0*, doi:10.6028/NIST.SP.1108r4의 PDF 28–38쪽/인쇄 12–22쪽에서 추출된 11페이지다. 보관 fixture README의 범위를 읽고 [현재 NIST 발행 기록](https://www.nist.gov/publications/nist-framework-and-roadmap-smart-grid-interoperability-standards-release-40) 및 [현재 권리 정책](https://www.nist.gov/nist-research-library/nist-publications#copyright-use-and-licensing)을 2026-11-06 확인했다. NIST 직원 저작물은 미국 내 저작권 대상이 아니고, NIST가 해외 권리를 주장할 수 있는 범위에서도 재배포·파생물 권한을 부여한다. 제3자 자료에는 별도 권리가 있을 수 있다. NIST 자료를 MIT로 재허가하지 않는다. 이번 수동 시각 검토는 첫 페이지·2쪽 그림·5쪽 표의 대응에 한정하며 11쪽 전체의 권리 표식을 새로 전수 검토하지 않았다.

Republished courtesy of the National Institute of Standards and Technology.

## 변경 전 경계와 플랫폼 실험

기존 SDK는 reviewBundle/Page/Mapping, 완료 K1 자료를 공개하지만 Core document authoring 연산은 노출하지 않는다. 기존 앱은 한 페이지씩 표시하고 cross-page 탐색·가시 연결선·스크롤 동기화가 없다. Host는 완성 mapping과 pages를 한 번에 보관하고 continuation 요청을 거부한다. 비교 컨테이너 폭 1024px 미만에서는 비교를 숨긴다. 일반 생성 뷰 열기는 같은 bundle도 중복 탭을 만든다.

실험 변경:

1. `packages/plugin-sdk/src/compare-spike.ts`의 root 공개 `createComparisonDocument`: 중립 paragraph/heading/figure/table 입력 → **기존 Core 공개 create/insert/serialize/parse/read model** → canonical source/revision/targets. 문서 의미 구현을 플러그인으로 복사하지 않는다. Node 전용 임시 API이며 확정 SDK 계약·범용 Docling 변환기가 아니다. runtime 입력 schema/한도·실패 형식의 정식 설계는 미완료다.
2. Host `reviews.ts`: snapshot에 `pageIndex`로 전체 페이지 메타데이터·영역을 전달한다. `jobs.ts`/SDK JobSnapshot: 완료 result의 review ID를 bundle과 함께 전달한다. 기존 Root·revision·이미지 hash 검사·receipt·공식 새 파일 생성 경로를 재사용한다. 새 endpoint/CLI 명령은 없다.
3. 앱 `ContinuousCompare.tsx`: IntersectionObserver로 근처 페이지 이미지만 요청하고 떠난 이미지 URL·영역 DOM을 해제한다. 원본/문서 선택·단일 연결선·양방향 비율 스크롤/해제. Core-backed DocumentEditor의 readOnly/reading layout·selection callback을 재사용한다. 앱이 렌더·interaction을 소유한다.
4. PluginJobs의 `Open comparison`이 완료 bundle로 review view를 만든다. App은 Host/Root/bundleRef가 같은 review 탭을 재사용한다.

플러그인 실파일은 `spike/compare/live.json`의 artifact 절대경로 아래 `host.js`, `litzio-plugin.json`이다. 저장소에는 재현용 `spike/compare/host.js` 템플릿을 보존했다. 런타임 Litzio import는 **`@litzio/plugin-sdk` root 하나**이며 Node fs/path/crypto만 추가 사용한다. Host가 자체 SDK bundle을 공급하고 실제 자식 PID `50664`에서 실행했다. Host PID는 `14340`이다. 가짜 SDK·모의 Host·검증기 변경은 없다.

플러그인의 Docling 해석 범위: body.children 순서, group 재귀, text/heading, picture/표 및 caption, provenance bbox. furniture는 decoration 영역만 남기고 본문에서는 제외한다. 그림 내부 텍스트는 그림 이미지로 유지하며 별도 문단으로 추출하지 않는다. list/footnote 텍스트는 paragraph로 단순화한다. merged cell은 anchor로 평탄화하고 caption은 Figure caption 및 별도 문단에 중복 표시한다. 오래된 변환 코드의 복사·런타임 의존 없음. 과거 변환 결과/사설 map을 읽는 호환 경로 없음. 이 문서는 복원 충실도나 Docling 변환 품질을 입증하지 않는다.

## 실행 결과

NIST JSON에는 texts 427개, pictures 8개, tables 3개가 있다. 이번 순회·지원 범위에서 새 문서는 86 Core block, mapping 86 entry, 페이지 영역 합계 **109개**다. 14 entry가 복수 sourceIds를 갖고, source 12개는 복수 target에 연결된다. 이 다대다는 실제 picture/table과 caption의 합성 연결에서 발생한다. 잘못된 구조를 임의 합성해 규모를 늘리지 않았다.

| 항목 | 실행 증거 | 판정·한계 |
| --- | --- | --- |
| 1 연속 페이지·지연 로딩 | browser 11개 page placeholder, 첫 이미지 표시와 이미지 DOM 11개 미만 검사; page 2/5의 이미지 decode 완료 뒤 선택·촬영 | NIST 규모에서 통과. 페이지 메타데이터는 전체 로딩이며 문서 preview 전체 DOM |
| 2 영역 상태·사유 | SDK의 supported/decoration과 furniture reason이 실제 NIST 영역 aria-label로 전달 | 부분. unsupported/excluded 실제 NIST 사례·표시 전수 검증 없음, 상태별 시각 구분·한글화 미완료 |
| 3 다대다 원본↔Core | CLI mapping 조회, 복수 source 14 entry·복수 target source 12개; 실제 그림/표 선택 시 Core 강조 | 해당 범위 통과. snapshot-local locator이며 영속 identity 아님 |
| 4 페이지 넘는 양방향 선택 | source heading/figure/table → Core 강조; 마지막 Core 문단 클릭 → 원본 scrollTop >1000 | NIST 페이지 이동 통과. 여러 후보 순회·페이지 선택 UX·target 전체 시각 전수 검증 없음 |
| 5 연결선 | 선택 뒤 SVG line 존재 검사, heading/figure/table 캡처 수동 확인 | 부분. 선택 집합의 첫 source와 첫 target만 연결; viewport 밖 endpoint가 잘리고 모든 다대다 선을 표시하지 않음 |
| 6 양방향 scroll·해제 | source wheel→문서 이동, 문서 wheel→source 이동, off 뒤 문서 scrollTop 보존 | 부분. 전체 길이 비율 방식으로 의미 대응 anchor 동기화는 아님 |
| 7 SDK 자료 닫고 다시 열기 | PluginJobs→bundle→일반 review tab, close 후 같은 완료 job에서 재열기 | 동일 Host 수명 내 통과. 앱 reload 후 jobs에서 수동 재열기 가능. 탭 자동 복원·Host 재시작 후 bundle 보존 없음 |
| 8 변경 stale·이동 차단 | NIST JSON/결과 md 각각 trailing newline으로 revision만 변경 → CLI state stale; 앱 Refresh→stale 경고·활성 영역 0; finally 원 바이트 복원 | 명시적 Refresh 후 revision 변경 검증 통과. Refresh 전에는 stale mapping 이동을 막지 못하는 알려진 결함이 있다. 외부 변경 자동 감시·내용 의미 변경·image 변경 UX는 미검증 |
| 9 분할 조회·가시 처리·대규모 | 11페이지를 개별 CLI snapshot으로 조회; 앱 근처 이미지만 요청 | 부분/대규모 미검증. 전체 pageIndex/mapping 보관·전송, continuation 거부 유지. 2000 region/entry·1MiB JSON 기존 한도 그대로. 사용자 지시로 NIST 밖 스트레스 미실행 |
| 10 읽기 전용 탭·중복 방지 | contenteditable=true 0개, 같은 bundle 재열기 탭 1개, 닫은 뒤 재열기 | 통과. 이 실험 탭에 변경 action 없음; 실제 쓰기 단축키 전체 검증 아님 |

브라우저 최종 실행은 `1 passed (11.9s)`/scenario 7.3s. 캡처는 `spike/compare/nist-1440.png`, `nist-picture-1440.png`, `nist-table-1440.png`, `nist-640-ko-dark.png`다. 1440에서는 Explorer를 접어 컨테이너 1024px를 확보했다. 캡처는 원본/preview 그림과 표가 실제 로드된 후 확인했다. 640 한국어 dark shell은 비교 대신 기존 최소 폭 안내가 보이며, review 문구 영어 잔류·라벨 겹침·큰 표 endpoint 잘림은 미완료다. 이 캡처를 640 대조 성공으로 판정하지 않는다. 실제 계정 표시 부분은 마스킹했다.

## lifecycle·독립 경계·수치

`spike/compare/evidence/evidence.json`에 실제 CLI 명령·응답을 보존했다: scaffold → validate → register → list digest → trust → enable → operation invoke(probe) → K1 start/status → 1~11쪽 review read. validation valid와 런타임 성공을 구별한다. probe는 별도 작업으로 `@litzio/core`, `@litzio/plugin-sdk/schema`, 내부 reviews.ts file URL의 import를 각각 시도하여 **모두 rejected:true**, 공개 SDK 0.1.0·실제 child PID를 반환했다. trusted Node 코드의 OS/직접 파일 접근까지 막는 sandbox 증거는 아니다.

`spike/compare/evidence/measurements.json`: CLI 프로세스 기동을 포함한 mapping 조회 936ms/20,445 bytes; source/document revision stale snapshot 각각 976/945ms·1,018,400 bytes; 복원 뒤 bundle ready 909/901ms. 대규모·백분위 성능 측정이 아니다. `spike/compare/evidence/process-measurements.json`의 Windows 프로세스 working set 관측값은 Host 304,627,712 bytes, child 94,085,120 bytes, 관측 peak working set은 330,788,864 / 302,350,336 bytes다. 전체 실험 기간의 프로세스 누적 peak이며 browser 포함 전체 메모리·정밀 할당량은 아니다.

첫 변환 실패 원인은 SDK opaque ID 규칙에 Docling pointer를 그대로 쓴 것이다. ID를 opaque 허용 문자로 변환하여 해결했으며 schema를 완화하지 않았다. 다음 실행의 CLI 수신은 Node execFileSync 기본 maxBuffer보다 큰 이미지 snapshot에서 실패했고 harness maxBuffer를 32MiB로 정했다(Host 한도 변경 아님). 초기 browser는 열린 좌우 패널 때문에 비교 폭 1024 미달, 다음 실행은 reload 후 자동 탭 복원을 잘못 기대하여 실패했다. 실제 사용자 경로의 Explorer 접기·jobs 수동 재열기로 고쳤다. 실패 기록과 별도 임시 artifact를 삭제하지 않았다.

## 재현·검증·정리

PowerShell, repo root, Node 24:

```powershell
python spike/compare/prepare.py
pnpm --filter @litzio/cli build
node spike/compare/run.mjs
# READY 뒤 별도 terminal, 같은 worktree에서
$env:LITZIO_BROWSER_URL='http://127.0.0.1:5197'
pnpm browser:test sdk-compare-spike
node spike/compare/measure.mjs
```

run은 새 root의 별도 artifact를 만들고 정확한 경로·bundle을 live.json에 남긴다. 재실행은 prepare로 새 디렉터리를 만들며 기존 시도 디렉터리를 덮지 않는다. 로컬 증거 JSON의 경로·PID는 실행마다 다르다. 브라우저는 `pnpm browser:test`의 checkout별 고정 persistent profile을 재사용했다. ordinary regression harness가 준비하는 다른 fixture는 이 NIST scenario의 실행 데이터로 사용하지 않는다.

검증: production CLI+Editor build 성공, SDK/Editor typecheck 성공, 기존 `reviews.test.ts`+`plugin-jobs.test.ts` 16/16 성공(일반 회귀 fixture이며 NIST 수락 증거와 별개), browser 최종 성공, git diff --check 성공. 전체 suite/필수 CI·패키징·다른 OS·실제 원격 Host·스크린리더·실제 Docling 서버/PDF 변환·AI 교정·과거 형식 호환·수천 영역 스트레스 미검증.

프로세스 정리: Windows Ctrl-C 뒤 잔존한 본 작업의 정확한 runner/Host/plugin PID 42572/14340/50664만 확인하여 종료했다. `cleanup.json`에서 세 PID 잔존 0·5197 listener 0. browser context는 runner finally 종료. 임시 데이터와 증거는 보존했다. named daemon stop은 foreground run의 lock을 찾지 못했으므로 그 출력만으로 정리 성공을 판정하지 않았다. 초기 보고 당시 커밋·push·PR·이슈 수정이 없었다. 이후 소유자가 승인한 로컬 보존 커밋에 코드·재현 harness·정리한 근거를 포함하며 push/PR/이슈 변경은 하지 않는다.


## 로컬 보존 커밋과 알려진 stale 결함

2026-11-06 추가 승인으로 이 임시 브랜치에만 보존한다. `spike/compare/README.md`와 `evidence/`에 재현 방법·경로 치환 실행 기록·실패 기록·파일 hash·원본 보관 zip hash를 추적한다. `live.json`/`location.json`은 실행하면 다시 생기는 runtime 관측값이며 개인 경로가 있어 원본을 커밋하지 않는다. 원본 로그와 캡처는 worktree 밖 사용자 Documents의 별도 `Litzio-spike-evidence/1315-<timestamp>/raw-evidence.zip`에 복사했고 각 entry SHA-256·zip 무결성을 검증했다. 정확한 로컬 위치는 ignored `spike/compare/preservation.json`과 작업 완료 메시지에 남긴다. 당시 남아 있지 않던 browser trace는 새로 만들거나 있다고 주장하지 않는다. 개인정보 없는 치환 근거와 캡처는 커밋되어 worktree archive 후에도 브랜치에서 복원할 수 있다.

**알려진 stale 결함(정적 코드 검토, 이 결함 자체의 별도 실행 재현 없음):** `createReviewAdapter.read()`는 Host 응답의 `state: stale`를 반환 상태로 반영하지 않는다. `ContinuousCompare`의 LazyPage는 새 snapshot에서 imageUrl만 가져오고, 선택의 유효성은 최초 상위 snapshot을 계속 사용한다. 따라서 원본/문서가 외부에서 변경된 뒤 지연 페이지 조회가 발생해도 상위 stale/disabled로 승격되지 않고, 명시적 Refresh 전에는 이전 mapping으로 이동할 수 있다. 이번 기존 browser 통과는 source/document revision에 trailing newline을 붙인 뒤 **Refresh를 눌러야** stale 경고와 영역 차단이 되는 범위다. 이미지 변경은 조회 실패로만 나타날 수 있다. 이를 전체 stale 안전성 또는 제품 완료로 판정하지 않는다. 이 승인 범위에서는 결함을 고치는 추가 제품 구현을 하지 않고 현재 실험을 그대로 보존한다.

소스에 보존한 마지막 TOPLEFT 좌표 분기는 typecheck만 다시 수행했다. 이전 NIST browser 입력은 BOTTOMLEFT뿐이므로 TOPLEFT 런타임 동작의 증거가 아니다. 전체 suite/필수 CI를 통과한 PR이 아니며, 이 branch를 제품으로 merge하는 근거로 사용할 수 없다.
