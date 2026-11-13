# 2026-11-05 동적 UI: 생성 UI와 저장 뷰를 같은 렌더러로

- Status: Historical
- Date: 2026-11-05 (브랜치 마지막 커밋일, KST)
- 결론: **폐기** — 결정은 ADR-0020에 반영됐으나(2026-11-05), 2026-11-09 #1341에서 비서 생성·저장 뷰·Chart 등을 제거하며 종료했다(PR #1353·#1357).
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

비서가 만든 UI와 저장된 뷰가 같은 Core 명세와 같은 React 렌더러를 쓰는 경로가 성립하는지 확인한다.

## 무엇을 만들었나

- 명세 v0(`litzio-view`)와 카탈로그: 앱 번들 Table·BarChart·VerticalPanel만 허용하고, 데이터는 `folder.statistics` operation 결과만 바인딩한다.
- 독립 스파이크 화면의 비서 패널에서 실제 Codex CLI를 호출했다. 저장은 정의 고정이며 데이터 고정이 아니다.

## 결과·관찰

- 결론: 생성 UI와 저장 뷰가 같은 명세·렌더러를 쓰는 경로를 확인했다.
- 전체 설정 이전은 불가했다. 실제 Copilot 공급자·원격 Host·외부 API는 검증하지 않았다.

## 결론/후속

- 결론: **폐기**. 결정은 ADR-0020에 반영됐으나(2026-11-05), 2026-11-09 #1341에서 비서 생성·저장 뷰·Chart 등을 제거하며 종료했다(PR #1353·#1357).
- 관련 이슈·PR·문서: [#1341 목적에 맞지 않는 비서 동적 UI 기능 제거](https://github.com/litzio/litzio/issues/1341) · [PR #1357 비서 동적 UI를 제거하고 플러그인 기본 화면 유지](https://github.com/litzio/litzio/pull/1357) · [ADR-0020](../adr/0020-plugin-architecture.md)

## 코드 위치

- 태그: [`spike/2026-11-05-dynamic-ui`](https://github.com/litzio/litzio/tree/spike/2026-11-05-dynamic-ui)
- 브랜치: [`spike/dynamic-ui`](https://github.com/litzio/litzio/tree/spike/dynamic-ui) (master 대비 커밋 1개)
- 마지막 커밋: [`28b298cd`](https://github.com/litzio/litzio/commit/28b298cd01b13e1b1cf7711c54e89ce7195f4d14)
- 당시 기록(태그 기준): [동적 UI 스파이크 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-05-dynamic-ui/spikes/dynamic-ui/report.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
