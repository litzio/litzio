# 제품 용어집

- Status: Implemented
- Scope: #1168 화면·문서·CLI·API·코드·설정 용어와 #1174 원격 Host 승인 용어(PR0~4 완료), ADR-0019·0020 플러그인·공통 UI 개념 용어(미구현).
- Last verified: 2026-11-05 — #1168 PR B의 이름 및 #1174·ADR-0018 PR0~4 구현 용어를 master 303e9a1 코드·문서와 대조. ADR-0019·0020 개념 용어는 소유자 결정과 문서 대조. 제품 실행 검증 없음.

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

동작과 공급자별 매핑은 [비서 계약의 권한 모드](../design/main-agent-v1.md#권한-모드)를 따른다. 읽기 전용·열린 폴더·전체 접근은 사용자가 고르는 실행 권한이다. 제한 권한에서도 셸은 공급자 승인 경로로 사용할 수 있다. Copilot의 승인 중개는 Codex의 OS sandbox와 같은 격리를 뜻하지 않는다. 문서 전용 Host 도구는 별도의 파일 범위를 검사한다.

현재 소스·계약의 옛 공개 이름과 화면 locales의 옛 표시 용어는 `pnpm boundaries:check`에서 검사한다. 화면 문구는 번역 값만 검사하며 외부 이름·과거 문서는 검사 범위 밖이다.

## 원격 Host와 여러 Host 보기 (#1174, PR0~4 완료)

아래 용어는 [ADR-0018](../adr/0018-desktop-remote-hosts.md)의 승인 결정이다. 현재 기능 제공을 뜻하지 않으며 PR1~4에서 코드·화면에 적용한다. 상태의 구체 코드 enum과 CLI 명령 표기는 구현 PR에서 정한다.

| 개념 | 한국어 UI | 영어 UI | 코드·API | 문서 용어 |
| --- | --- | --- | --- | --- |
| 같은 PC의 작업 대상 | 로컬 Host | Local Host | local Host 문맥 | 로컬 Host; daemon 수명 제어 대상 |
| 주소로 연결하는 작업 대상 | 원격 Host | Remote Host | remote Host 문맥 | 원격 Host; Desktop 로컬 OS 경로와 구별 |
| 연결 설정 저장 | Host 등록 / 등록 제거 | Register Host / Remove registration | Desktop 로컬 Host registry, 공용 등록 작업 | 등록; 연결·원격 daemon 제어와 구별 |
| 등록 식별자 | 진단에서 Host ID | Host ID | `hostId` | 불변 등록 식별자; daemon instanceId·Paseo serverId·문서 identity와 구별 |
| 등록 주소 | 주소 | Address | `origin` | HTTP(S) origin; 주소 변경은 새 등록, 같은 정규화 origin 중복 거부 |
| 표시 이름 | 라벨 | Label | label | 등록 라벨; 변경해도 hostId·origin 유지 |
| 대상 안의 위치 | Host 표시와 경로 | Host label and path | `(hostId, path)` | Host별 문서·폴더 위치; 경로만으로 식별하지 않음 |
| 연결 상태 | 연결 중 / 연결됨 / 연결 끊김 / 다시 연결 중 | Connecting / Connected / Disconnected / Reconnecting | Host별 connection state; 최종 enum은 구현 PR | 연결 상태; 등록 저장·제품 버전 경고·프로토콜 거부 사유와 구별 |
| 표시 범위 | 전체 Host / 개별 Host 라벨 | All hosts / Individual Host label | Host filter | 전체/개별 Host 필터; 요청 대상 변경 아님 |
| 비서 실행 대상 | 대화의 Host | Conversation Host | 대화 생성 시 고정된 hostId | 대화 대상 Host; 활성 탭 변경으로 전환하지 않음 |

등록 저장 성공과 연결 성공을 같은 말로 표시하지 않는다. 원격의 자동 재연결은 연결 복구이며 저장·AI 쓰기의 자동 재전송이나 원격 daemon 재시작을 뜻하지 않는다. 앱 전역 설정과 Host별 설정을 구분한다.

## 플러그인 계층 개념 (ADR-0019, 미구현)

2026-11-13 공식/커뮤니티 tier·publisher·기본 포함 공급 필드는 제거했다. 당시 계층 용어는 ADR-0019·0020의 역사 기록이다. 현재 플러그인은 등록 단위 신뢰와 활성/비활성 상태를 사용한다.

## 플러그인 화면과 실행

현재 계약은 [ADR-0022](../adr/0022-plugin-screen-code.md), [실행·제작](../design/plugin-stage1-v1.md), [화면 코드](../design/plugin-screens-v1.md)를 따른다.

| 개념 | 한국어 | 영어 | 코드 |
|---|---|---|---|
| 자기 코드를 그리는 화면 | 플러그인 화면 | Plugin screen | screen |
| 외부에 공개하는 호출 | 공개 작업 | Public operation | operations |
| 일반 연결 설정 | 설정 | Settings | settingsSchema |
| Host가 보관하는 자격 증명 | 비밀값 | Secret | secrets |
| 비서에게 제공하는 지침 | 스킬 | Skill | skills |

선언형 조회 명세·UI 카탈로그·검수 대조 틀과 기존 Docling은 삭제했다. 과거 용어는 `archive/2026-11-13-plugins-declarative` 태그에 보관한다. 일반 문서 read model·비서 변경 보기·Undo와 혼동하지 않는다.
