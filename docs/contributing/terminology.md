# 제품 용어집

- Status: Implemented
- Scope: #1168 화면·문서·CLI·API·코드·설정 용어.
- Last verified: 2026-11-05 — #1168 PR B의 이름과 소유자 결정 대조.

| 개념 | 한국어 UI | 영어 UI | 코드·API | 문서 용어 |
| --- | --- | --- | --- | --- |
| 사용자 기능 | 비서 | Assistant | `AssistantSettings`, `createAssistantHost`, `ASSISTANT`; `litzio assistant`; `/api/assistant/*` | 비서(Assistant) |
| 대화 | 대화 / 새 대화 / 대화 기록 | Conversation / New conversation / Conversation history | `AssistantConversation`, `conversationId`; 기존 공통 `id`는 맥락이 분명하면 유지 | 비서 대화; 공급자 thread/session과 구분 |
| 연결할 공급자 | AI 공급자 / 기본 AI 공급자 | AI provider / Default AI provider | `AiProvider`, `provider`, `codex`, `copilot` 유지 | AI 공급자(provider): 비서를 실행하는 연결 제품, 모델 제조사와 다름 |
| 모델 | 모델 | Model | `model`, 공급자 model ID 유지 | 모델; 공급자별 카탈로그 |
| 추론 강도 | 추론 강도 | Reasoning effort | `reasoningEffort` 유지 | 추론 강도; 지원 값·고정 여부는 공급자별 |
| 실행 프로세스 | 진단에서 Codex app-server / Copilot CLI | Codex app-server / Copilot CLI | `CodexAppServer`, `CopilotAcp` 유지; 공용 연결 소유자 `ProviderConnections` | 공급자 런타임 / 공급자 연결; ACP는 프로토콜 |
| 비서 도구 | 비서 도구 | Assistant tools | `create_document`, `read_document` 등 유지; 설명 상수 `ASSISTANT_INSTRUCTIONS` | 비서 도구(Host 공용 작업 호출); 외부/native 도구와 구분 |
| 권한 모드 | 권한 모드: 읽기 전용 / 열린 폴더 / 전체 접근 | Permission mode: Read-only / Opened folders / Full access | `permissionMode`; enum 값 유지 | 권한 모드. 쓰기 범위는 파일 쓰기 경계만 지칭 |
| 스킬 | 스킬 / Codex 스킬 | Skills / Codex skills | `skills`, `SKILL.md` 유지 | 스킬: 절차·안내, 도구와 구별 |
| 서비스 프로세스 | 진단에서 백그라운드 서비스 | Background service | `daemon`, `litzio daemon ...` 유지 | daemon: 화면과 독립된 서비스 수명 |
| 작업 제공 경계 | 진단에서 Host | Host | `Host`, `hostClient` 유지 | Host: 공용 작업·HTTP 제공 경계; daemon과 동의어 아님 |


## 바꾸지 않는 것

외부 제품 Codex / GitHub Copilot, Codex thread/turn, ACP session, Copilot Agent/Plan, JSON assistant role, 모델 ID·지원 값, AGENTS.md·SKILL.md, AI-Agent/AI-Model trailer는 유지한다. Accepted ADR의 당시 결정과 docs/reviews·releases·보관 브랜치는 과거 기록으로 보존한다. CLI·문서에서는 daemon을 유지하고 화면에서는 백그라운드 서비스(Background service), 상태 제목에서는 (daemon)을 병기한다. Host는 공용 작업·HTTP 경계이며 daemon과 동의어가 아니다.

## 새 문구와 이름

기능은 비서(Assistant), 연결 제품은 AI 공급자(AI provider), 모델 제조사는 실제 회사 이름으로 구별한다. 연결 제품 안내는 “연결 제품: Codex, GitHub Copilot”이다. 대화는 제품 개념이며 공급자의 thread/session과 구별한다. 사용 불가는 꺼짐이 아니다. 기능·공급자 활성화 스위치는 없다. 한국어·영어, 접근성 이름·오류·도움말을 함께 점검한다. 기술 이름은 같은 변경에서 원자적으로 바꾸며 이 표를 근거로 별도 alias나 migration을 만들지 않는다.

## 권한 모드

동작 계약은 [비서 계약](../design/main-agent-v1.md)을 따른다. 읽기 전용은 파일 쓰기를 거부하고, 열린 폴더는 열린 폴더와 Host Root 안의 파일 쓰기만 허용한다. 제한 모드에서 Codex는 sandbox를 적용하고 네트워크·OS 임시 쓰기 예외를 끈다. Copilot은 경로가 있는 요청을 중개하고 실행·네트워크·알 수 없는 요청을 거부하며 shell 도구를 끈다. Copilot에는 OS sandbox가 없고 사전 승인된 설정의 동작까지 동등하게 격리하지 않는다. 전체 접근은 Codex sandbox를 해제하고 양쪽 공급자의 도구·경로·네트워크 요청을 자동 승인한다. 기존 문서는 변경하지 않고 글로 제안한다는 비서 지침과 문서 도구의 공식 쓰기 경계는 유지한다.

현재 소스·계약의 옛 공개 이름과 화면 locales의 옛 표시 용어는 `pnpm boundaries:check`에서 검사한다. 화면 문구는 번역 값만 검사하며 외부 이름·과거 문서는 검사 범위 밖이다.
