# 2026-11-10 비서와 플러그인 만들기

- Status: Historical
- Date: 2026-11-10 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 문서에 "증거만 제공하며 현재 계약이나 구현 승인이 아니다"라고 적혀 있다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

#1341로 비서 동적 UI를 제거한 뒤에도, 사용자가 플러그인 사양 인터뷰에서 결정을 바꾸면 다음 질문과 사양이 바뀌고 앞선 결정이 유지되는 협의형 흐름이 성립하는지 확인한다.

## 무엇을 만들었나

- "플러그인 만들기" 탭: 비서 대화, 질문 폼(단일·다중 선택, 텍스트, 토글), 결정요소 카드, 개발 계획 노드 그래프, 승인 뒤 설치 결과.
- `POST /api/plugin-builder`(별도 읽기 전용 Codex thread, `outputSchema`, 검증 실패 시 1회 재질문 후 대본 모드). 비서는 코드를 쓰지 않고 검증된 사양을 `github-issues` 템플릿에 넣어 공식 관리 경로로 설치한다.

## 결과·관찰

- 사용자가 결정(인증)을 바꾸면 다음 라운드가 바뀌고, 사용자가 바꾼 결정은 서버가 다시 적용해 비서가 덮어쓰지 못한다. 승인 뒤 플러그인이 설치·활성화되어 실제 `litzio/litzio` 이슈를 조회했다.
- 한계: 템플릿이 `github-issues` 하나뿐이다. 토큰이 필요한 플러그인은 Linux Host에서 생성하지 않는다. 모델명과 추론 강도는 코드 상수다.

## 결론/후속

- 결론: **미정**. 문서에 "증거만 제공하며 현재 계약이나 구현 승인이 아니다"라고 적혀 있다.
- 관련 이슈·PR·문서: [Discussion #767](https://github.com/litzio/litzio/discussions/767) · [PR #1357](https://github.com/litzio/litzio/pull/1357)

## 코드 위치

- 태그: [`spike/2026-11-10-assistant-plugin-builder`](https://github.com/litzio/litzio/tree/spike/2026-11-10-assistant-plugin-builder)
- 브랜치: [`spike/assistant-plugin-builder`](https://github.com/litzio/litzio/tree/spike/assistant-plugin-builder) (master 대비 커밋 1개)
- 마지막 커밋: [`ad5d9535`](https://github.com/litzio/litzio/commit/ad5d9535414d562062079ddc7e1692b44ed7add0)
- 당시 기록(태그 기준): [비서와 플러그인 만들기 스파이크 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-10-assistant-plugin-builder/docs/reviews/assistant-plugin-builder-spike-2026-11.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
