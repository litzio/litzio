# 2026-11-03 편집 중인 블록 표시 세 시안 (#1022)

- Status: Historical
- Date: 2026-11-03 (브랜치 마지막 커밋일, KST)
- 결론: **채택(gutter 계열)** — 이후 master에 편집 흐름 블록 막대(#1022)가 구현됐다(UI 패턴·레이아웃 규칙 문서 참조). 스파이크 코드는 병합하지 않았다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

텍스트를 편집하는 블록의 종류와 범위를 구분하기 어려운 문제(#1022)에 대해 세 가지 표시 방식을 실제 Editor에서 비교한다.

## 무엇을 만들었나

- 개발 전용 쿼리 `?spike1022=frame|gutter|containers`로 세 시안을 켠다: 블록을 둘러싼 테두리(frame), 왼쪽 막대와 종류 아이콘(gutter), 목록·인용·admonition·코드·수식·표에만 막대(containers).
- 라이트 9장·다크 1장 캡처(1440×1000)와 메타데이터를 남겼다.

## 결과·관찰

- frame은 가장 눈에 띄지만 일반 문단에도 경계를 만든다. gutter는 종류와 범위를 함께 주지만 이동 핸들과 간격이 좁다. containers는 일반 문단의 피드백이 없다.
- 문서의 권고는 gutter부터 비교하는 것이었고 채택은 소유자 결정이라고 적었다.
- 한국어 IME, 긴 입력, 다른 뷰포트는 확인하지 못했다.

## 결론/후속

- 결론: **채택(gutter 계열)**. 이후 master에 편집 흐름 블록 막대(#1022)가 구현됐다(UI 패턴·레이아웃 규칙 문서 참조). 스파이크 코드는 병합하지 않았다.
- 관련 이슈·PR·문서: [#1022 텍스트 편집 중인 블록의 종류와 범위를 구분하기 어려움](https://github.com/litzio/litzio/issues/1022) · [UI 패턴](../design/ui-patterns-v1.md) · [Editor layout rules](../design/editor-layout-rules-v1.md)

## 코드 위치

- 태그: [`spike/2026-11-03-1022-editing-block-indicator`](https://github.com/litzio/litzio/tree/spike/2026-11-03-1022-editing-block-indicator)
- 브랜치: [`spike/1022-editing-block-indicator`](https://github.com/litzio/litzio/tree/spike/1022-editing-block-indicator) (master 대비 커밋 1개)
- 마지막 커밋: [`309f5dd6`](https://github.com/litzio/litzio/commit/309f5dd6c833666782ac1a2cecc0804cc73dbf9b)
- 당시 기록(태그 기준): [편집 블록 표시 스파이크 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-03-1022-editing-block-indicator/docs/reviews/editing-block-indicator-1022.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
