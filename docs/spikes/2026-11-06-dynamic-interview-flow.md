# 2026-11-06 동적 UI 인터뷰 → 흐름도 → 보고서

- Status: Historical
- Date: 2026-11-06 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 채택 여부 기록을 찾지 못했다. 비서 동적 UI는 이후 #1341에서 제거됐다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

비서가 인터뷰 질문과 흐름도를 만들고, 사용자 의견과 승인을 거쳐 공식 문서 생성까지 이어지는 흐름이 성립하는지 확인한다.

## 무엇을 만들었나

- 전용 개발 서버(`spike-artifacts/`)에서 실제 Codex 모델이 주제에 맞는 질문 5개와 흐름도 5개 노드를 만들고, 폼 값 전달 → 노드 의견 2회 → 명시적 승인 → Core/Host 공식 문서 생성 → 디스크 재읽기까지 진행한다.
- 흐름도는 React Flow(노드·선·선택·drag·zoom)로 그렸다.

## 결과·관찰

- 합성 시나리오(도서 교환 행사)에서 완주했다. 승인 전에는 문서가 없고, 기존 이름 재생성은 거부되며 SHA-256이 변하지 않았다.
- 2026-11-06 소유자 지시로 추가 구현·검증을 중단하고 업로드했다. 중단 직전 변경(자연어 승인 판별 등)은 검증하지 않았다.
- 내용 품질의 최종 평가는 소유자 몫이라고 적었다.

## 결론/후속

- 결론: **미정**. 채택 여부 기록을 찾지 못했다. 비서 동적 UI는 이후 #1341에서 제거됐다.
- 관련 이슈·PR·문서: [#1341 목적에 맞지 않는 비서 동적 UI 기능 제거](https://github.com/litzio/litzio/issues/1341)

## 코드 위치

- 태그: [`spike/2026-11-06-dynamic-interview-flow`](https://github.com/litzio/litzio/tree/spike/2026-11-06-dynamic-interview-flow)
- 브랜치: [`spike/dynamic-interview-flow`](https://github.com/litzio/litzio/tree/spike/dynamic-interview-flow) (master 대비 커밋 1개)
- 마지막 커밋: [`add92489`](https://github.com/litzio/litzio/commit/add92489f40a0960499933c09fa646236e3c7305)
- 당시 기록(태그 기준): [실증 기록](https://github.com/litzio/litzio/blob/spike/2026-11-06-dynamic-interview-flow/spike-artifacts/README.md) · [업로드 시점 상태](https://github.com/litzio/litzio/blob/spike/2026-11-06-dynamic-interview-flow/spike-artifacts/UPLOAD-STATUS.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
