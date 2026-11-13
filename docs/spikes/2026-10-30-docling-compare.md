# 2026-10-30 Docling 변환 대조 보기

- Status: Historical
- Date: 2026-10-30 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 채택 여부 기록을 찾지 못했다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

Docling이 변환한 결과가 원본 PDF의 어느 영역에서 왔는지 한 화면에서 대조할 수 있는지 확인한다.

## 무엇을 만들었나

- 사이드바의 "Docling 대조" 항목이 고정 오버레이를 연다. 왼쪽은 원본 PDF 쪽과 Docling 항목의 bbox, 오른쪽은 읽기 전용 Litzio 편집기로 보여 준 변환 문서다.
- 변환 영역에서 대응 블록으로 베지어 연결선을 긋고, 머리말·꼬리말 등 제외 항목은 회색 점선 상자로 표시한다. 앵커 기반 동기 스크롤, 고정 각주 줄, 유형 범례가 있다.
- 대응 정보는 계측한 변환기(`spikes/docling-compare/`)가 쓰는 `<chapter>.docling-map.json` 사이드카이며 `GET /api/docling-map`으로 읽기 전용 제공한다.

## 결과·관찰

- 커밋 하나뿐이며 별도 결과 문서는 없다. 위 내용은 커밋 메시지와 코드에서 확인한 구성이다.

## 결론/후속

- 결론: **미정**. 채택 여부 기록을 찾지 못했다.
- 관련 이슈·PR: 확인한 것이 없다.

## 코드 위치

- 태그: [`spike/2026-10-30-docling-compare`](https://github.com/litzio/litzio/tree/spike/2026-10-30-docling-compare)
- 브랜치: [`spike/docling-compare-1030`](https://github.com/litzio/litzio/tree/spike/docling-compare-1030) (master 대비 커밋 1개)
- 마지막 커밋: [`379c2471`](https://github.com/litzio/litzio/commit/379c2471a1d66164282416ff64105fb6756fde1e)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
