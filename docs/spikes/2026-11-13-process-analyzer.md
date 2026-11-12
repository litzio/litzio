# 2026-11-13 공정 분석기 (OBCM EOL 그래프·공정 능력)

- Status: Historical
- Date: 2026-11-13 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 코드 병합 전 검토용이며 소유자 판단이 필요하다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

OBCM의 EOL(End of Line) 데이터를 그래프로 보고 하루 또는 여러 날의 생산 결과를 통계로 분석하는 커뮤니티 플러그인이 현재 플러그인 구조에서 가능한지 확인한다.

## 무엇을 만들었나

- 합성 EOL 데이터(3일·45대·6조건, 재시험 포함 282행)와 생성기, 항목별 규격 CSV.
- "EOL 측정 그래프"(x축 기본은 공정 진행 시간, y축은 칩으로 선택, 규격선 표시)와 "공정 능력 분석"(Cp/Cpk/Pp/Ppk, FPY·수율, DPMO, 시그마 수준, 히스토그램, I-MR 관리도, 한국어 인사이트).
- 앱에 범용 `Chart` leaf와 `Table.rowFilter`를 추가했다. CSV 파일과 날짜는 드롭다운으로 고르며, 이를 위해 SDK에 `inputOptions`(입력칸 선택지를 플러그인이 채우는 선언)를 일반 기능으로 추가했다.

## 결과·관찰

- 합성 데이터로 두 보기가 동작하고, 통계 정확성은 교과서 공식으로 테스트에 대조했다.
- SPIKE 문서가 긴장 지점을 적었다: PR #1357이 통계·차트를 의도적으로 제거했는데 이 스파이크는 그 방향을 되돌린다. 카탈로그에 `Chart`가 새로 생겨 카탈로그 v2 갱신 대상이다. 계산은 신뢰된 플러그인 코드가 한다.
- 한계: 실제 EOL 컬럼이 다르면 매핑을 고쳐야 하고 조건별 규격은 없다. 차트 확대·내보내기 없음.

## 결론/후속

- 결론: **미정**. 코드 병합 전 검토용이며 소유자 판단이 필요하다.
- 관련 이슈·PR·문서: [PR #1357](https://github.com/litzio/litzio/pull/1357) · [ADR-0020](../adr/0020-plugin-architecture.md)

## 코드 위치

- 태그: [`spike/2026-11-13-process-analyzer`](https://github.com/litzio/litzio/tree/spike/2026-11-13-process-analyzer)
- 브랜치: [`spike/process-analyzer`](https://github.com/litzio/litzio/tree/spike/process-analyzer) (master 대비 커밋 2개)
- 마지막 커밋: [`9e1d6907`](https://github.com/litzio/litzio/commit/9e1d690746b9d0def88f14d1deab821ab5a56e87)
- 당시 기록(태그 기준): [공정 분석기 SPIKE.md](https://github.com/litzio/litzio/blob/spike/2026-11-13-process-analyzer/community-plugins/process-analyzer/SPIKE.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
