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

동작 계약은 [비서 계약](../design/main-agent-v1.md)을 따른다. 읽기 전용은 파일 쓰기를 거부하고, 열린 폴더는 열린 폴더와 Host Root 안의 파일 쓰기만 허용한다. 제한 모드에서 Codex는 sandbox를 적용하고 네트워크·OS 임시 쓰기 예외를 끈다. Copilot은 경로가 있는 요청을 중개하고 실행·네트워크·알 수 없는 요청을 거부하며 shell 도구를 끈다. Copilot에는 OS sandbox가 없고 사전 승인된 설정의 동작까지 동등하게 격리하지 않는다. 전체 접근은 Codex sandbox를 해제하고 양쪽 공급자의 도구·경로·네트워크 요청을 자동 승인한다. 기존 문서는 변경하지 않고 글로 제안한다는 비서 지침과 문서 도구의 공식 쓰기 경계는 유지한다.

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

아래는 [ADR-0019](../adr/0019-plugin-tiers.md)의 승인 용어이며 현재 기능 제공이나 구현 재개를 뜻하지 않는다. ADR-0020이 manifest 초안의 계층 키를 `tier`로 구체화한다. 세부 SDK 형식은 구현 PR에서 정한다.

| 개념 | 한국어 UI | 영어 UI | 코드·API 후보 | 문서 용어 |
| --- | --- | --- | --- | --- |
| 공식 공급·유지 책임을 맡는 계층 | 공식 플러그인 | Official plugin | `tier: 'official'` (ADR-0020 초안) | 공식 플러그인; 작성자가 공식 개발자라는 사실만으로 분류하지 않음 |
| 공식 공급·유지 책임을 맡지 않는 계층 | 커뮤니티 플러그인 | Community plugin | `tier: 'community'` (ADR-0020 초안) | 커뮤니티 플러그인; 공식 개발자의 개인·실험 플러그인도 가능 |
| 플러그인 공급 주체 | 공급자 | Publisher | `publisher` | 플러그인 공급자(Publisher); 비서의 AI 공급자(provider)와 구별 |
| 배포물에 포함됨 | 기본 포함 | Bundled | 번들 여부; 형식 미정 | 기본 포함; 계층·기본 활성 상태와 독립 |
| 플러그인 실행 상태 | 활성화 / 비활성화 | Enabled / Disabled | `enabled` | 활성화/비활성화; 설치됨·신뢰함·사용 가능·제거·기존 작업 취소와 구별 |

“코어 플러그인”은 `@litzio/core` 문서 엔진과 혼동되므로 쓰지 않는다. 두 계층은 같은 manifest·SDK·권한을 사용하며 공식 전용 내부 API는 없다. 커뮤니티 기본 실행 차단은 명시적 신뢰를 위한 절차이며 sandbox나 실행 후 격리 보장이 아니다. 비서는 플러그인과 무관한 제품 기능이다. Docling은 공식 유지 대상이 아니며 재개 시 커뮤니티 계층으로 다룰 수 있다.

## 플러그인 구조와 공통 UI (ADR-0020, 미구현)

아래는 [ADR-0020](../adr/0020-plugin-architecture.md)의 승인 용어다. 형식·작업 이름은 초안이며 현재 제품 제공이나 구현 재개를 뜻하지 않는다.

| 개념 | 한국어 UI | 영어 UI | 코드·API 초안 | 문서 용어 |
| --- | --- | --- | --- | --- |
| 앱이 연결할 수 있는 선언된 확장 위치 | 기여 지점 | Contribution point | `contributions` | 기여 지점: 공용 작업·폴더·계정/설정·뷰 등; 임의 코드 주입점 아님 |
| 앱 소유 컴포넌트의 허용 목록 | UI 카탈로그 | UI catalog | `catalog` | 앱 번들 UI 카탈로그; 최초 Table·BarChart·세로 패널 |
| 조회·바인딩·표현의 공통 정의 | UI 명세 | UI specification | `schemaVersion`, `sources`, `panels` | UI 명세; 일시적 생성 UI와 저장된 뷰가 같은 형식 사용 |
| 비서가 대화 중 만든 일시적 UI | 생성 UI | Generated UI | 공통 UI 명세 | 생성 UI; 동적 UI라고도 설명하며 원격 JS/CSS 생성·실행을 뜻하지 않음 |
| 이름 있는 동적 UI 상태(명세 + 질의)를 고정한 것 | 즐겨찾기 뷰 | Favorite view | `.view.json`, `view.validate/save/run` | ★ 즐겨찾기에 추가·즐겨찾기 목록; 생성 UI와 같은 앱 렌더러, LLM 없이 재열기, 수동 재조회 |
| 즐겨찾기 뷰의 저장 개념·파일 형식 설명 | 저장된 뷰 | Saved view | `.view.json` | 즐겨찾기 뷰와 같은 개념. 사용자 표시 이름은 즐겨찾기 뷰이며 별도 형식이 아님 |
| 뷰를 계속 열어 쓰는 사용 형태 | 대시보드 | Dashboard | 공통 UI 명세·렌더러 | 대시보드; 별도 UI 형식·자동 실시간 갱신을 뜻하지 않음 |
| 실행 데이터까지 고정한 정적 산출물 | 스냅샷 | Snapshot | `.snapshot.json` | 뷰 데이터 스냅샷; 표현·데이터·조회 시각·조건·receipt 포함, 질의 재실행 권한 없음 |
| 플러그인의 연결별 설정 단위 | 연결 | Connection | `connectionId` | 플러그인 연결; Host 등록·AI 공급자 연결과 맥락을 구별 |

고정 UI는 동적 UI를 멈춰 놓은 것이다. 저장은 같은 UI 명세를 파일로 고정하며 데이터 고정은 별도 스냅샷으로 구분한다. 여기서 뷰 데이터 스냅샷은 ADR-0013의 작업 입력 자료 스냅샷이나 문서 read model snapshot과 다른 산출물이다. 비서 관리 작업의 매번 명시 승인 조건은 기존 권한 모드의 자동 승인과 구별하며 전체 접근에서도 생략하지 않는다. secret 값은 사용자가 앱 설정 UI로 직접 입력한다.

ADR-0020의 별도 소유자 개시로 [플러그인 1단계](../design/plugin-stage1-v1.md)를 구현한다. 현재 manifest 기여 필드는 `contributes`, 계층은 `tier`이며 생성 UI·저장 뷰·secret runtime은 계속 후속 범위다. 전체 접근의 자동 승인에서도 `manage_plugins`의 매 호출 명시 확인은 생략하지 않는다.
