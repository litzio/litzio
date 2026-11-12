# 2026-10-28 Draw.io 편집 연동 (.drawio.svg 그림)

- Status: Historical
- Date: 2026-10-28 (브랜치 마지막 커밋일, KST)
- 결론: **보류** — 소유자 결정으로 보류(#646 코멘트). #646은 열려 있다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

Draw.io 다이어그램을 Litzio 그림(Figure)으로 첨부하고 문서 안에서 편집할 수 있는지 확인한다(#646).

## 무엇을 만들었나

- `*.drawio.svg`를 일반 그림 이미지로 첨부한다. 캡션·레이블·번호·상호참조는 이미지 그림과 같게 동작한다.
- 그림 팝업의 "Draw.io에서 편집"·"Draw.io로 생성"과 슬래시 명령이 원본 문서 옆의 문서 탭에서 Draw.io를 연다. 저장하면 파일을 쓰고 그림을 갱신한다.
- Draw.io 웹앱은 번들하지 않고 `serve --drawio <webapp 폴더> [--drawio-libraries <폴더>]`로 같은 출처에서 셀프 호스팅한다(외부 diagrams.net 전송 없음).

## 결과·관찰

- 기능이 가능함을 확인했다. 결과와 화면은 이슈 #646 코멘트에 공유했다.
- 이슈 #646의 검토 코멘트(2026-10-28)는 구조상 정할 것이 많아 스파이크를 다듬어 병합하기보다 먼저 결정(ADR)을 내리고 단계적으로 구현하라고 권하며, 소유자 결정으로 보류했다고 적었다.
- 같은 코멘트가 든 이유: Desktop 미지원(`serve` 전용), 문서가 아닌 파일을 Editor에서 쓰는 새 쓰기 경로, 제3자 웹앱을 같은 출처 iframe으로 띄우는 보안 범위, "Draw.io에서 편집" 시 적용하지 않은 대체 텍스트·레이블이 사라지는 결함.

## 결론/후속

- 결론: **보류**. 소유자 결정으로 보류(#646 코멘트). #646은 열려 있다.
- 관련 이슈·PR·문서: [#646 draw.io 다이어그램 첨부 및 편집 지원](https://github.com/litzio/litzio/issues/646)

## 코드 위치

- 태그: [`spike/2026-10-28-drawio-embed`](https://github.com/litzio/litzio/tree/spike/2026-10-28-drawio-embed)
- 브랜치: [`spike/drawio-embed-1028`](https://github.com/litzio/litzio/tree/spike/drawio-embed-1028) (master 대비 커밋 3개)
- 마지막 커밋: [`f7f9b433`](https://github.com/litzio/litzio/commit/f7f9b433548c57a7bdc46b5076a3d235a5e0df10)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
