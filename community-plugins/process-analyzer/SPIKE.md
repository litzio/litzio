# 공정 분석기 스파이크 (OBCM EOL)

- 상태: Spike (코드 병합 전 검토용). 승인되지 않은 결정이며 ADR·design contract를 바꾸지 않는다.
- 기준: master `01d09535`. 관련 권한: [ADR-0020](../../docs/adr/0020-plugin-architecture.md), [플러그인 화면 계약](../../docs/design/plugin-screens-v1.md), [플러그인 1단계 #1357 기록](../../docs/design/plugin-stage1-v1.md#플러그인-조회-표-열과-결과-범위-1351).
- 데이터는 전부 **합성 데이터**다(`sample/generate-eol-data.py`, seed 고정). 실제 측정값이 아니다.

## 무엇을 만들었나

| 요청 | 구현 |
| --- | --- |
| 1. 합성 EOL 데이터 | `sample/eol_synthetic_3days.csv`(3일·45대·6조건, 재시험 포함 282행), `eol_spec.csv`(항목별 LSL/USL), xlsx는 생성기가 같은 폴더에 만든다. |
| 2. CSV 그래프 | 화면 "공정 분석기" → 보기 "EOL 측정 그래프". x축 기본은 공정 진행 시간(h), y축은 칩으로 한 개 이상 선택, 입력/출력 전압·설비 필터, 규격선(LSL/USL) 표시. |
| 3. 통계·Six Sigma | 보기 "공정 능력 분석". Cp/Cpk/Pp/Ppk, 평균, σ(군내·전체), FPY·수율, DPMO, 시그마 수준, 정규분포 적합 히스토그램, I-MR 관리도(Nelson 1·2·3), 한국어 인사이트. 하루 또는 기간(시작일·종료일)을 고른다. |

## 플러그인 모델에 맞춘 방식

ADR-0020은 플러그인이 React/JS/CSS를 싣지 않고 앱 소유 컴포넌트를 선언으로만 고르게 한다. 이 스파이크도 그 틀을 지킨다.

- **플러그인은 선언 + 데이터 계산만 한다.** `litzio-plugin.json`이 operation 3개(`csv-files` 후보, `measurements`, `analysis`)·view 2개·screen 1개를 선언한다. `host.js`/`stats.js`는 CSV를 읽고 **모든 숫자**(Cp/Cpk, 관리한계, 이탈 표시, 히스토그램 구간·기대 도수, 인사이트 문장)를 계산해 행으로 돌려준다.
- **앱은 그리기만 한다.** query view의 leaf가 `Table`뿐이라 그래프를 표현할 방법이 없었다. 그래서 generic leaf `Chart`를 추가했다(`packages/core/src/views.ts`의 `chartSchema`, `apps/editor/src/views/Chart.tsx`, 의존성 없는 inline SVG). 선언 필드: `type`(line/bars), `x`/`y` 후보 필드, `filters`, `limits`(정적 규격선), `lines`(행 필드에서 읽는 기준선), `flag`, `separator`, `caption`, `rowFilter`. 모든 필드는 operation `rowSchema`에 있는 숫자·문자·불리언 필드여야 하고(`validateQueryBindings`), 위반하면 등록 단계에서 거부된다. y축 선택·필터·규격선 토글은 앱의 UI 상태일 뿐 데이터를 가공하지 않는다.
- `Table`에도 선택 필드 `rowFilter`를 더했다. 한 operation이 행 종류(`rowType`: kpi/capability/point/bin/insight)를 섞어 돌려주고 panel마다 그 종류만 보이게 한다. 한 view에 source가 하나뿐이라서 필요했다.
- CSV 위치는 플러그인 설정 `dataFolder`(Host 절대 경로)다. 파일 이름은 `^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$`만 받고, 실경로가 `dataFolder` 바로 아래가 아니면(심볼릭 링크 등) 거부한다. 입력 후보(`csv-files`)는 기존 #1352 계약을 쓴다(2글자 이상 입력 시 목록).

## ADR·계약과의 긴장 (숨기지 않고 적는다)

1. **#1357이 통계·차트를 의도적으로 제거했다.** plugin-stage1 문서는 "병합 뒤의 현재 화면에서는 Favorites·생성·통계·차트를 제공하지 않는다"고 기록한다. 이 스파이크는 그 결정을 되돌리는 방향이다. 되돌린다면 소유자 결정이 필요하고, 저장 뷰(`.view.json`)·집계 UI는 복원하지 않았다. 새 leaf는 Host가 돌려준 행을 그리는 읽기 전용 표시일 뿐이다.
2. **ADR-0020 "플러그인은 UI 코드를 싣지 않는다"는 지켰지만 "앱 소유 컴포넌트" 목록을 늘렸다.** 카탈로그에 `Chart`가 새로 생기므로 [카탈로그 v2](../../docs/design/catalog-v2.md) 쪽 갱신 대상이다.
3. **계산을 플러그인(trusted Node 코드)이 한다.** Host는 플러그인이 계산한 값을 그대로 신뢰한다. 통계 정확성은 `apps/editor/test/process-analyzer.test.ts`로 교과서 공식에 대조했다.
4. 보기 두 개를 한 화면으로 묶는 방식은 기존 `defaultViewIds` 다중 기본 뷰를 그대로 썼다(새 필드 없음).

## 통계 정의

- 용량 분석은 **최초 시험(attempt=1)**·선택한 한 조건만 쓴다(조건마다 평균이 달라 합치면 σ가 부풀기 때문).
- σ(군내) = MR̄/1.128 → Cp, Cpk. σ(전체) = 표본 표준편차 → Pp, Ppk. 한쪽 규격만 있으면 Cp/Pp는 비운다.
- DPMO(항목) = 정규분포(평균·σ전체) 가정 예상 규격 이탈률 × 10⁶. 생산 요약 DPMO = 최초 시험의 규격 이탈 측정 수 / (유닛×6조건×8항목) × 10⁶.
- 시그마 수준 = Φ⁻¹(1 − DPMO/10⁶) + 1.5(장기 1.5σ 이동 관례), 표시 상한 6.
- FPY = 최초 시험에서 전 조건·전 항목 합격한 유닛 비율, 수율 = 재시험 후 최종 합격 유닛 비율.
- 관리도: I-MR, CL = 평균, UCL/LCL = CL ± 2.66·MR̄, MR UCL = 3.267·MR̄. 이상 표시는 Nelson R1(한계 이탈)·R2(9점 연속 한쪽)·R3(6점 연속 증감).
- 드리프트: 시간 순서 선형회귀 |t|>3 이고 기간 중 변화량 > 0.5σ일 때 인사이트로 알린다.

## 한계

- 합성 데이터이며 실제 EOL 스키마가 아니다. 컬럼이 다르면 `REQUIRED` 목록과 `SPEC`(host.js·stats.js)을 고쳐야 한다.
- 규격(LSL/USL)은 `stats.js`의 `SPEC`과 manifest `limits`, `eol_spec.csv`에 중복돼 있다(테스트가 일치를 검사). 조건별 규격은 지원하지 않는다.
- 한 번에 2000행까지(operation 행 상한). 기간이 길어지면 `truncated`가 된다. 분석 operation은 점 행을 항목 하나에 대해서만 만든다.
- 조회는 수동(불러오기)이다. 파일 변경 감시·자동 새로고침 없음.
- Chart는 CSV 한 번 조회 분량을 클라이언트에서 그린다. 확대/축소·범위 선택·내보내기·인쇄는 없다. 터치·좁은 화면 최적화는 확인하지 않았다.
- 입력 후보는 설정한 `dataFolder` 안 .csv만 보여준다. Litzio가 연 폴더(Root)와 연동하지 않는다.
- Cp/Cpk 신뢰구간, 비정규 데이터 변환(Box-Cox 등), 조건 합산 분석, X̄-R 관리도는 없다.
