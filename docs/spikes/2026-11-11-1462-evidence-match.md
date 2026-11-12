# 2026-11-11 #1462 검증 실험 ①: 독립 PDF 텍스트 증거와 문서 대응

- Status: Historical
- Date: 2026-11-11 (브랜치 마지막 커밋일, KST)
- 결론: **채택(보조 후보 탐지만)** — master의 설계가 이 방식을 "보조 후보 탐지"로만 쓰기로 했다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

pdf.js로 뽑은 PDF 텍스트와 Litzio 문서를 양방향으로 맞춰 텍스트 누락·변조를 독립 증거로 탐지할 수 있는지 측정한다(#1462).

## 무엇을 만들었나

- `scripts/spikes/1462-evidence-match/`의 양방향 LCS 매칭, 고정 오류 주입(문단 삭제·숫자 변조·순서 변경·표 칸 삭제), 사전 프로토콜과 정상 입력 경보 원인 분류.
- 입력은 LSR 13쪽과 NIST 3쪽 발췌, 이후 새 4쪽 텍스트 PDF(holdout).

## 결과·관찰

- 종합 실패: 주입 오류 탐지 기준 네 종류는 모두 통과(각 3/3)했지만, 정상 입력 경보가 규칙 적용 뒤에도 쪽당 평균 4.62건(LSR)·5.00건(NIST)으로 기준(≤1건/쪽)을 크게 넘었다. holdout도 잡음 기준을 넘었다.
- 이 방식은 독립 증거를 줄 수 있으나 현재 형태로는 저잡음 경보를 보장하지 못한다고 판단했다.

## 결론/후속

- 결론: **채택(보조 후보 탐지만)**. master의 설계가 이 방식을 "보조 후보 탐지"로만 쓰기로 했다.
- 관련 이슈·PR·문서: [#1462 Docling 검수 3단계](https://github.com/litzio/litzio/issues/1462) · [Docling review stage 3 설계](../design/docling-review-stage3.md#2026-11-11-아키텍처-확정소유자-승인) · [보고서(master)](../reviews/1462-spike-evidence-match.md)

## 코드 위치

- 태그: [`spike/2026-11-11-1462-evidence-match`](https://github.com/litzio/litzio/tree/spike/2026-11-11-1462-evidence-match)
- 브랜치: [`spike/1462-evidence-match`](https://github.com/litzio/litzio/tree/spike/1462-evidence-match) (master 대비 커밋 2개)
- 마지막 커밋: [`003da859`](https://github.com/litzio/litzio/commit/003da859be155ba4f2046d62ddc31ace303d115e)
- 당시 기록(태그 기준): [#1462 spike ① 보고서(master)](https://github.com/litzio/litzio/blob/spike/2026-11-11-1462-evidence-match/docs/reviews/1462-spike-evidence-match.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
