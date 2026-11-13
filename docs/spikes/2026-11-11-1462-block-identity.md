# 2026-11-11 #1462 검증 실험 ②: 교정 후 원본 대응과 텍스트 블록 ID

- Status: Historical
- Date: 2026-11-11 (브랜치 마지막 커밋일, KST)
- 결론: **채택(방식 A)** — master의 Docling 검수 설계 "2026-11-11 아키텍처 확정"이 spike ②의 방식 A를 쓰기로 했다. 블록 영속 ID는 후속으로 남겼다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

Docling 검수에서 교정 후에도 블록과 원본 대응을 유지할 수 있는지(경로 갱신 A), 텍스트 블록 ID(MyST target)가 블록 정체성으로 쓰일 수 있는지(B)를 측정한다(#1462).

## 무엇을 만들었나

- `scripts/spikes/1462-block-identity/`의 실험 스크립트와 fixture(LSR 발췌, 합성). 7개 연산을 연속 적용한 A·B 임시 처리와, Core 단독 B에 대한 독립 probe 7개.

## 결과·관찰

- A 통과. B는 현재 Core 단일 연산만으로는 실패하고(잘못된 연결 2, 출처 소실 4, 합치기 거부 1) 실험 안의 target 쌍 처리 함수를 쓰면 통과했다.
- 두 fixture의 연속 적용 112개 checkpoint에서 잘못된 원본 연결 0, 조용한 출처 소실 0.
- 현재 교정 실험에는 A를 추천했다. 경로를 영속 identity로 올리지 않는다.

## 결론/후속

- 결론: **채택(방식 A)**. master의 Docling 검수 설계 "2026-11-11 아키텍처 확정"이 spike ②의 방식 A를 쓰기로 했다. 블록 영속 ID는 후속으로 남겼다.
- 관련 이슈·PR·문서: [#1462 Docling 검수 3단계](https://github.com/litzio/litzio/issues/1462) · [Docling review stage 3 설계](../design/docling-review-stage3.md#2026-11-11-아키텍처-확정소유자-승인) · [보고서(master)](../reviews/1462-spike-block-identity.md)

## 코드 위치

- 태그: [`spike/2026-11-11-1462-block-identity`](https://github.com/litzio/litzio/tree/spike/2026-11-11-1462-block-identity)
- 브랜치: [`spike/1462-block-identity`](https://github.com/litzio/litzio/tree/spike/1462-block-identity) (master 대비 커밋 1개)
- 마지막 커밋: [`903931ef`](https://github.com/litzio/litzio/commit/903931ef5c74a26ee9f4b99703282bc9dbe26d92)
- 당시 기록(태그 기준): [#1462 spike ② 보고서(master)](https://github.com/litzio/litzio/blob/spike/2026-11-11-1462-block-identity/docs/reviews/1462-spike-block-identity.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
