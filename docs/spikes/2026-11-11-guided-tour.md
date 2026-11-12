# 2026-11-11 문서 작성 안내 투어

- Status: Historical
- Date: 2026-11-11 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 문서에 "투어 엔진·계약을 제품 결정으로 정하지 않는다"고 적혀 있다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

Litzio 화면 위에 영역을 강조하고 나머지를 막는 안내 레이어로 "문서 작성 첫걸음" 투어를 Command Center에서 시작할 수 있는지 확인한다.

## 무엇을 만들었나

- Command Center의 "도움말: 문서 작성 둘러보기"가 열린 폴더에 연습 문서를 새로 만들고 5단계(제목, 장 제목, 개요, 표, 상호참조) 투어를 시작한다.
- 순수 엔진(`tour.ts`), 닫힌 앵커 목록, 스포트라이트 레이어. 활성 영역 밖 입력을 차단하고 Esc·건너뛰기로 즉시 종료한다. Core·Host·CLI는 바꾸지 않았다.

## 결과·관찰

- headless Chrome 1440×900에서 5단계 전체, 입력 차단, Esc 종료를 확인했다. 창 크기 변경 시 강조 테두리가 대상과 4px 이내로 일치했다.
- 한계: 스크린 리더·키보드 전용 경로 미구현, 640px 미만·Desktop·한국어 IME 미확인, 실행마다 연습 문서가 쌓인다.

## 결론/후속

- 결론: **미정**. 문서에 "투어 엔진·계약을 제품 결정으로 정하지 않는다"고 적혀 있다.
- 관련 이슈·PR: 확인한 것이 없다.

## 코드 위치

- 태그: [`spike/2026-11-11-guided-tour`](https://github.com/litzio/litzio/tree/spike/2026-11-11-guided-tour)
- 브랜치: [`spike/guided-tour`](https://github.com/litzio/litzio/tree/spike/guided-tour) (master 대비 커밋 1개)
- 마지막 커밋: [`e38c26fa`](https://github.com/litzio/litzio/commit/e38c26fa197c3c38120ea8128c883d4938940a73)
- 당시 기록(태그 기준): [Guided tour spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-11-guided-tour/docs/reviews/guided-tour-spike-2026-11.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
