# 2026-11-04 템플릿 갤러리 화면 대안 (#936)

- Status: Historical
- Date: 2026-11-04 (브랜치 마지막 커밋일, KST)
- 결론: **채택** — master의 템플릿 갤러리는 카드와 hover·키보드 미리보기를 쓴다(`document-templates-v1.md`). 스파이크 코드는 병합하지 않았다. 구현이 C안과 같은지는 기록으로 확인하지 못했다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

문서 템플릿 갤러리 화면의 구조를 비교한다(#936).

## 무엇을 만들었나

- 개발 전용 `/template-gallery`에 세 안을 만들었다. A: 세로 목록과 오른쪽 즉시 미리보기. B: 카드 갤러리와 전체 폭 상세. C(소유자 추가 피드백): 카드와 hover/focus 읽기 미리보기 Popover.
- 한국어 mock 템플릿 6종, 라이트·다크 캡처. 실제 파일 선택·생성·관리 API는 연결하지 않았다.

## 결과·관찰

- A/B 비교에서는 640px 가독성을 이유로 B를 추천했고, 이후 소유자 피드백으로 C를 추가해 기본 진입을 C로 바꿨다. 추천은 소유자 결정을 대신하지 않는다고 적었다.

## 결론/후속

- 결론: **채택**. master의 템플릿 갤러리는 카드와 hover·키보드 미리보기를 쓴다(`document-templates-v1.md`). 스파이크 코드는 병합하지 않았다. 구현이 C안과 같은지는 기록으로 확인하지 못했다.
- 관련 이슈·PR·문서: [#936 사람과 에이전트가 함께 활용할 문서 템플릿 관리](https://github.com/litzio/litzio/issues/936) · [Document templates v1](../design/document-templates-v1.md)

## 코드 위치

- 태그: [`spike/2026-11-04-936-template-gallery`](https://github.com/litzio/litzio/tree/spike/2026-11-04-936-template-gallery)
- 브랜치: [`spike/936-template-gallery`](https://github.com/litzio/litzio/tree/spike/936-template-gallery) (master 대비 커밋 2개)
- 마지막 커밋: [`684befa1`](https://github.com/litzio/litzio/commit/684befa148e4ee0ce2a95aeec0af2e960332396d)
- 당시 기록(태그 기준): [템플릿 갤러리 스파이크 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-04-936-template-gallery/docs/reviews/template-gallery-936.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
