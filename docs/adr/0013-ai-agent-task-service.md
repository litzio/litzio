# ADR-0013: AI 실행 환경의 결정과 대체 관계

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-13 — 후속 ADR·현재 비서 구성과 정적 대조. 실행 검증 없음.
- Authority: 2026-11-02 소유자 승인, [Discussion #767](https://github.com/litzio/litzio/discussions/767).
- Partially superseded by: [ADR-0014](0014-main-agent-app-server.md), [ADR-0017](0017-bundled-client-and-official-ai.md), [ADR-0021](0021-general-agent-assistant.md).

## 남아 있는 결정

AI 실행은 문서 의미를 소유하지 않는다. 문서 의미·검증·직렬화는 Core가 소유한다.
기능과 AI 공급자의 실행 환경을 나누어, 기능마다 문서 의미나 공급자 설정을 별도로 구현하지 않게 한다.
현재 비서의 실행 환경은 ADR-0014, 운영 원칙은 ADR-0021을 따른다.

## 대체 관계

- 기본 포함·제거 가능한 AI 플러그인은 ADR-0017의 daemon 공식 AI로 대체됐다. 과거 aiTasks와 스냅샷 실행은 현재 비서 계약이 아니다.
- 상주 비서 도입 시 전용 Codex 홈을 만들던 조건은 ADR-0014로 대체됐다. 현재는 사용자의 기존 로그인·설정을 재사용한다.
- 나머지 전용 홈 격리 도입 조건은 당시 유예 기록이다. 현재 구현은 별도 홈을 만들지 않으며, 향후 격리 판단의 새 의무로 재서술하지 않는다.
- 과거 AI 실행의 CLI 생략은 현재 예외가 아니다. 새 사용자 기능은 [ADR-0015](0015-shared-host-operations.md), 비서 도구 생성 기준은 ADR-0021을 따른다.

현재 동작은 [비서 계약](../design/main-agent-v1.md)에 둔다. 이 문서는 제거된 작업 서비스를 다시 구현하라는 요구가 아니다.

## 이력

[축소 전 본문](https://github.com/litzio/litzio/blob/422e0c1e5499678623a7f5d2be0ad28e4f90a132/docs/adr/0013-ai-agent-task-service.md)에 당시 작업 메시지·실행·격리·검증 기록을 보존한다. 현재 요구사항이 아니다.
