# 2026-10-31 Docling 플러그인 UI 기여

- Status: Historical
- Date: 2026-10-31 (브랜치 마지막 커밋일, KST)
- 결론: **보류** — `docling-plugin-runtime`과 같다. ADR-0012가 구현은 채택하지 않았다고 적었다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

설치된 플러그인이 Editor 실행 중에 명령 하나와 탭 종류 하나를 추가·제거할 수 있는지 확인한다. `docling-plugin-runtime` 위에 쌓은 실험이다.

## 무엇을 만들었나

- "Docling 대조" 명령과 `docling-comparison` 뷰를 설치된 ESM/CSS로 기여한다. 선택 UI와 탭·내비게이션 상태는 Editor가 소유한다.
- 매니페스트의 선택 `ui` 절, 해시 검증을 거친 자산만 제공하는 Host 라우트, 500ms 주기 등록 감시, 렌더 오류 경계, UI Host API 버전 검사.

## 결과·관찰

- Desktop·serve·Vite 세 환경에서 모두 통과: 동적 명령과 탭, 새로고침 없는 등록/비활성/재등록, 렌더·로드 실패 격리(문서 편집 상태 유지), API 버전 불일치 시 번들 요청 없이 거부.
- 사이드바·설정·변환 대화상자는 가능하지만 추가 계약이 필요하다고 정리했다. 정적 Docling import가 모두 사라진 것은 아니다.
- 실제 Docling 변환, 패키징된 앱, 악성 코드 격리는 증명하지 못했다.

## 결론/후속

- 결론: **보류**. `docling-plugin-runtime`과 같다. ADR-0012가 구현은 채택하지 않았다고 적었다.
- 관련 이슈·PR·문서: [Discussion #767](https://github.com/litzio/litzio/discussions/767) · [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md) · [ADR-0020](../adr/0020-plugin-architecture.md)

## 코드 위치

- 태그: [`spike/2026-10-31-docling-plugin-ui`](https://github.com/litzio/litzio/tree/spike/2026-10-31-docling-plugin-ui)
- 브랜치: [`spike/docling-plugin-ui`](https://github.com/litzio/litzio/tree/spike/docling-plugin-ui) (master 대비 커밋 2개)
- 마지막 커밋: [`b35f854b`](https://github.com/litzio/litzio/commit/b35f854b69fc7d7c762097326045b34de0610c96)
- 당시 기록(태그 기준): [Docling UI contribution spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-10-31-docling-plugin-ui/docs/reviews/docling-plugin-ui-spike.md) · [Docling runtime spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-10-31-docling-plugin-ui/docs/reviews/docling-plugin-runtime-spike.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
