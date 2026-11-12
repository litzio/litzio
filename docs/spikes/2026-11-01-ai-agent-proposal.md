# 2026-11-01 AI 에이전트 블록 제안 워크플로 (플러그인)

- Status: Historical
- Date: 2026-11-01 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 문서에 "병합을 제안하지 않으며 채택하려면 별도 범위·API 결정이 필요하다"고 적혀 있다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

신뢰된 플러그인 하나와 Codex CLI로, 선택한 문단·제목의 수정 제안을 비교·적용·되돌리는 흐름이 성립하는지 확인한다.

## 무엇을 만들었나

- `plugins/ai-agent` 플러그인(Codex CLI 어댑터와 결정적 fake 어댑터), worker API 2, 제안 Host 라우트, Core의 제안 검증(`proposal.ts`).
- 최상위 문단·제목의 인라인 교체만 지원한다. 비교 렌더러로 원문·제안·단어 차이와 적용/거부를 보여 준다.

## 결과·관찰

- 여덟 조건(요청→비교→적용→Undo 1회, 거부, Core 무효 제안 거부, 문서 변경 후 적용 거부, worker 실패·시간 초과 시 편집기 유지, 플러그인 비활성화, 실제 Codex CLI 제안, 화면 없는 제안 요청)이 모두 통과했다.
- 실제 Codex 요청은 약 4~5초에 Core 유효 제안을 반환했다. 사실 정확성은 보증하지 않는다.
- 한계: 구획 구조 변경 없음, 패키징된 Desktop·다른 플랫폼 미실행.

## 결론/후속

- 결론: **미정**. 문서에 "병합을 제안하지 않으며 채택하려면 별도 범위·API 결정이 필요하다"고 적혀 있다.
- 관련 이슈·PR·문서: [Discussion #767](https://github.com/litzio/litzio/discussions/767)

## 코드 위치

- 태그: [`spike/2026-11-01-ai-agent-proposal`](https://github.com/litzio/litzio/tree/spike/2026-11-01-ai-agent-proposal)
- 브랜치: [`spike/ai-agent-proposal`](https://github.com/litzio/litzio/tree/spike/ai-agent-proposal) (master 대비 커밋 1개)
- 마지막 커밋: [`674db001`](https://github.com/litzio/litzio/commit/674db0011a7112342ab1de922a2f45f6c1c38b51)
- 당시 기록(태그 기준): [AI agent proposal spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-01-ai-agent-proposal/docs/reviews/ai-agent-proposal-spike.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
