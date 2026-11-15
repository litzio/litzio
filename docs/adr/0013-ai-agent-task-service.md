# ADR-0013: AI 실행 환경의 결정과 대체 관계

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: 2026-11-02 소유자 승인, [Discussion #767](https://github.com/litzio/litzio/discussions/767).
- Partially superseded by: [ADR-0014](0014-main-agent-app-server.md), [ADR-0017](0017-bundled-client-and-official-ai.md), [ADR-0021](0021-general-agent-assistant.md).

## 남아 있는 결정

AI 실행은 문서 의미를 소유하지 않는다. 문서 의미·검증·직렬화는 Core가 소유한다.
기능과 AI 공급자의 실행 환경을 나누어, 기능마다 문서 의미나 공급자 설정을 별도로 구현하지 않게 한다.
현재 비서의 실행 환경은 ADR-0014, 운영 원칙은 ADR-0021을 따른다.

## 대체 관계

현재 실행 환경은 [ADR-0014](0014-main-agent-app-server.md), 공식 AI는 [ADR-0017](0017-bundled-client-and-official-ai.md), 운영 원칙은 [ADR-0021](0021-general-agent-assistant.md)을 따른다.
새 사용자 기능의 공용 작업·CLI는 [ADR-0015](0015-shared-host-operations.md)를 따른다.

## 2026-11-14 개정과의 관계

지금의 비서·CLI로 끝내지 못하는 실제 플러그인 사례가 생길 때 소유자가 재개 여부와 최소 계약을 새로 정한다. [제품 목적](../purpose.md#지금-하지-않는-것)에 따라 선제 설계하지 않는다.
