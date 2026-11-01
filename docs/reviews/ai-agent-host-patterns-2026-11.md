# AI 에이전트와 플러그인 역할 분리 사례 조사

- Status: Historical
- Last verified: 2026-11-02 KST. 공개 공식 문서·소스와 Litzio checkout `0501e0f2884d2b4e477f66410561b07275cc8571`을 읽고 대조했다. 외부 제품 실행·성능·계정별 기능 제공 여부는 검증하지 않았다.
- Scope: [#877](https://github.com/litzio/litzio/issues/877)의 B 최소 골격 설계 참고자료. 설계안·채택 결정·현재 구현 계약이 아니다. 예상 읽기 시간 20–30분.
- Authority: 현재 Litzio 계약은 [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), [Host worker plugins](../design/plugin-runtime-v1.md), [Plugin UI contributions](../design/plugin-ui-v1.md)를 따른다. 조사에서 도출한 해석·권고는 아래에서 **시사점**으로 구분한다.

## 1. 읽는 기준과 Litzio의 출발점

가장 가까운 참고 사례는 **Raycast의 도구 기여**, **VS Code의 Language Model Tools**, **Paseo의 provider 경계**다. 앞의 둘은 기능을 공통 에이전트에 제공하고, 마지막은 서로 다른 실행기를 하나의 수명·이벤트 표면으로 연결한다. MCP는 도구·데이터 교환, ACP는 클라이언트와 에이전트 연결, A2A는 독립 에이전트 간 위임을 다룬다. 이들을 같은 종류의 모델 어댑터로 보면 책임이 섞인다. 각 주장과 출처는 2절, 축별 비교는 3절, B에 대한 해석은 마지막 절에 있다.

### 이미 정해진 것과 이번에 정하지 않는 것

| 근거 | 이번 조사에서 지켜야 할 경계 |
| --- | --- |
| [#767, 2026-10-31](https://github.com/litzio/litzio/discussions/767#discussioncomment-19308593) | AI 에이전트는 기본 포함이지만 끄거나 지울 수 있는 플러그인이다. 본체는 AI 없이 동작한다. 업체 어댑터의 장기 방향과 Litzio 문서 제안·사용자 승인 방향이 기록됐다. |
| [#767, 2026-11-01 보류](https://github.com/litzio/litzio/discussions/767#discussioncomment-19323901) | 문서 수정 제안 스파이크는 병합하지 않는다. 성공 기록을 정식 API로 취급하지 않는다. |
| [#767, 2026-11-02 재개](https://github.com/litzio/litzio/discussions/767#discussioncomment-19335168) | B는 업체 중립 어댑터, Codex 어댑터 하나, 기능 플러그인의 AI 작업 등록·요청 지점, 가짜 어댑터 검증이다. 기능 플러그인은 AI 업체를 모른다. 대화·문서 수정 제안·업체 선택/자격 증명 화면·네트워크 세부는 계속 보류다. |
| [#766, 2026-11-02](https://github.com/litzio/litzio/discussions/766#discussioncomment-19335167) | A는 사람이 읽을 수 있는 JSON 교정 기록·사본 적용·재변환·얇은 CLI다. C에서 Docling이 구조 검수 작업과 제안 승인 화면을 제공한다. 원본은 보존하고 승인 취소는 기록을 빼고 다시 변환한다. |
| [#767, 장래 다중 에이전트 메모](https://github.com/litzio/litzio/discussions/767#discussioncomment-19335233) | 메인 에이전트의 전문 에이전트 생성·지시·메시지 교환은 가능성일 뿐 결정이 아니다. B가 막지 않게 하되 기능을 미리 만들지 않는다. |

**작업과 도구를 구분한다.** B의 AI 작업은 기능 플러그인이 지시·입력 조각·결과 형식·검증을 제공하고 에이전트에 추론을 요청하는 단위다. 일반적인 tool calling은 반대로 에이전트가 기능을 골라 호출한다. 조사 사례의 도구 등록만으로 B의 작업 요청 계약까지 해결되지는 않는다.

현재 [`@litzio/plugin-api/host`](../../packages/plugin-api/src/host.ts)는 설치 플러그인의 `operations`와 Host 서비스 주입을, [`ui`](../../packages/plugin-api/src/ui.ts)는 명령·탭·설정·좁은 Host 호출을 제공한다. [`worker`](../../packages/plugin-api/src/worker.ts)의 API 1은 `input/output/server` PDF 변환 전용이며, 범용 AI 작업 등록·추론 결과 계약은 없다. Host facade는 신뢰한 in-process 코드이고 별도 worker와 격리 수준이 다르다. UI 해제는 이미 수락된 작업 취소가 아니며, 재시작 시 `uncertain`·자동 재실행 금지, 완료 결과만 공개하는 제약을 유지한다.

스파이크 [`674db001…`의 기록](https://github.com/litzio/litzio/blob/674db0011a7112342ab1de922a2f45f6c1c38b51/docs/reviews/ai-agent-proposal-spike.md)과 [`plugins/ai-agent`](https://github.com/litzio/litzio/tree/674db0011a7112342ab1de922a2f45f6c1c38b51/plugins/ai-agent)는 별도 근거다. `adapters.ts`의 중립 함수·Codex/가짜 어댑터, `worker.ts`의 IPC, `ui.tsx`·CSS의 명령/탭으로 나뉜다. 브랜치 전용 worker API 2와 Core 문서 제안 연산을 추가했고, 보고된 a–h 성공은 단일 문단/제목 인라인 수정과 Windows Vite 범위다. 이번에는 재실행하지 않았다. **B가 이 문서 편집 기능이나 API 2를 채택했다는 뜻이 아니다.**

## 2. 사례별 확인

모든 외부 출처의 확인 날짜는 **2026-11-02**다. 공식 안내에서 확인한 기능은 **문서 확인**, 고정 commit을 읽은 사실은 **소스 확인**, 근거가 부족한 부분은 **미확인**으로 표시한다. 제품 내부 구조나 실패 복구 보장은 공개 UX만 보고 추정하지 않는다.

### 2.1 VS Code: 도구 기여와 직접 모델 호출은 별도 경로

**문서 확인.** Language Model Tools는 확장이 이름·설명·`inputSchema`를 기여하고 `vscode.lm.registerTool`로 실행 함수를 등록하는 경로다. 에이전트가 호출을 선택하고 확장이 도메인 기능을 실행한다. `prepareInvocation`은 승인 설명을 제공하고 입력은 schema 검사를 받는다. 취소 토큰도 전달된다. 한편 Language Model API는 확장이 직접 프롬프트를 만들고 `selectChatModels({vendor, id, family, version})`와 `sendRequest`를 사용할 수 있다. 따라서 **VS Code의 모든 확장이 업체를 모른다고 일반화할 수 없다.** 모델 없음·동의 거절·할당량 실패를 확장이 처리해야 한다. [Tools](https://code.visualstudio.com/api/extension-guides/ai/tools), [Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model).

Chat participants는 확인 시점 공식 문서에서 **deprecated**이며 Copilot harness에서 지원하지 않고 Local harness 호환용으로 남아 있다. 신규 통합은 도구·MCP 등을 권한다. 예전 participant 중심 설계를 현재 권장 경로로 옮기지 않는다. MCP 서버의 도구 외에도 resource·prompt를 사용할 수 있고, 모델 선택은 사용자 측 picker/설정에도 존재한다. [Chat participants](https://code.visualstudio.com/api/extension-guides/ai/chat), [MCP 연결](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [모델 구성](https://code.visualstudio.com/docs/agent-customization/language-models).

**미확인:** 임의의 확장 도구 결과에 대한 공통 도메인 검증·원자적 Undo·프로세스 재시작 후 정확한 재개 보장. 입력 schema나 도구 승인 자체가 이를 제공하지는 않는다.

### 2.2 Zed: 자체 에이전트와 ACP 외부 에이전트의 소유권 차이

**문서 확인.** Agent Panel은 대화·컨텍스트·진행·변경 검토를 호스팅한다. Zed Agent에는 LLM provider 설정을 쓰고, ACP External Agent는 보통 자신의 실행기·인증·모델 선택·도구·설정을 소유한다. UI가 같아도 같은 추론 루프는 아니다. checkpoint·history 복원 등의 제공 범위도 외부 에이전트마다 다르다. [Agent Panel](https://zed.dev/docs/ai/agent-panel), [External Agents](https://zed.dev/docs/ai/external-agents), [Agent Settings](https://zed.dev/docs/ai/agent-settings).

확장은 `[context_servers.*]`와 `context_server_command`로 MCP context server를 제공할 수 있다. 공식 문서는 이 확장 배포 방식을 MCP registry 방향으로 폐기할 계획도 밝힌다. 컨텍스트 서버 기여와 모델 실행기 기여를 구분해서 참고해야 한다. [MCP](https://zed.dev/docs/ai/mcp), [MCP Server Extensions](https://zed.dev/docs/extensions/mcp-extensions).

ACP v1은 클라이언트↔에이전트 JSON-RPC 경계다. `session/new`, `session/prompt`, 진행 `session/update`, `session/request_permission`, `session/cancel`과 선택적인 `session/load` 등을 규정한다. **미확인:** 외부 에이전트 전부의 재개·파일 복구·결과 schema 준수. ACP 지원만으로 동일한 기능이 생기지 않는다. [ACP v1 overview](https://agentclientprotocol.com/protocol/v1/overview).

### 2.3 JetBrains AI Assistant / Junie: 도메인 도구와 실행기 확장

**문서 확인.** AI Assistant는 MCP 서버를 연결하고 도구 목록·연결 상태·로그를 노출한다. Junie도 설정된 MCP 도구를 사용할 수 있다. 사용자는 채팅에서 모델을 선택하고, provider/API key 설정이 그 선택지에 영향을 준다. Junie의 작업 승인·명령 승인 모드와 파일 diff·개별/전체 rollback은 별도 UX로 제공된다. [AI Assistant MCP](https://www.jetbrains.com/help/ai-assistant/mcp.html), [Junie](https://www.jetbrains.com/help/ai-assistant/junie-agent.html).

플러그인 SDK에는 `com.intellij.mcpServer.mcpToolset` 등의 확장점이 있다. 공식 MPS 예제는 `McpToolset` 구현의 `@McpTool`·`@McpDescription` 메서드를 `plugin.xml`로 등록한다. IDE 지식을 도구로 내놓는 구체적 사례다. 외부 ACP 에이전트 연결도 별도로 제공한다. [SDK 확장점](https://plugins.jetbrains.com/docs/intellij/intellij-community-plugins-extension-point-list.html), [공식 toolset 예제](https://www.jetbrains.com/help/mps/writing-mps-mcp-tools-plugin.html), [AI 기능 개요](https://www.jetbrains.com/help/idea/ai-assistant-in-jetbrains-ides.html).

**미확인:** 제3자 확장이 Junie 내부 프롬프트·계획기·모델 어댑터를 임의로 대체하는 안정된 공개 API. MCP toolset은 그런 API와 다르다. 중단·IDE 재시작 뒤 모든 작업의 복구 보장도 확인하지 않았다.

### 2.4 Obsidian: AI 정책이 각 플러그인 안에 모이는 사례

**문서·소스 확인.** Copilot은 자체 Agent/Quick Chat/Quick Ask를 제공하고 자신의 설정에서 에이전트·모델을 고른다. 현재 README는 OpenCode, Codex ACP 등 여러 실행기와 BYOK·로컬 모델을 설명한다. Text Generator도 여러 AI provider를 연결하는 별도 플러그인이다. 공통 Obsidian 추론 서비스를 공유한다는 근거는 이 두 사례에서 확인하지 못했다. [Copilot README, `915b8615…`](https://github.com/logancyang/obsidian-copilot/blob/915b86159eaa301312dbcc897919dde4780fd3ab/README.md), [Text Generator](https://github.com/nhaouari/obsidian-textgenerator-plugin), [공식 플러그인 목록의 설명](https://community.obsidian.md/plugins/obsidian-textgenerator-plugin).

**시사점:** 기능 확장을 빠르게 실험하는 데 유리하지만, 각각 실행기·모델·컨텍스트·승인 UX를 가지면 사용자가 이를 반복 설정하고 여러 작업을 잇는 공통 에이전트는 별도로 필요해진다. 이는 구조에서 도출한 해석이며 사용자 불편 빈도를 측정한 결과가 아니다. **미확인:** Obsidian 전체에 공통 AI Host API가 절대로 없다는 주장, 모든 AI 플러그인의 자격 증명 저장·취소·Undo 방식. Copilot 하나가 여러 에이전트를 통합한다는 사실도 호스트 전체의 공통 정책을 뜻하지 않는다.

### 2.5 Raycast: 기능 도구와 provider 기여를 따로 제공

**문서 확인.** 확장은 manifest의 `tools`와 함수로 기능을 내놓고 Raycast AI가 호출한다. 도구 입력 타입/JSDoc은 모델에게 기능을 설명하며, 확장 전체 `ai.instructions`도 기여할 수 있다. `confirmation`은 실행 전 동의 내용을 제공한다. 공통 AI 실행을 쓰면서도 도메인 지시를 기능 측이 공급하는 B의 가까운 참고 사례다. [AI Extension 생성](https://developers.raycast.com/ai/create-an-ai-extension), [Tools·Instructions·confirmation](https://developers.raycast.com/ai/learn-core-concepts-of-ai-extensions).

모델 공급은 별도 `ai.modelProvider` 경로다. `getModels`와 `streamCompletion`을 구현하고 기능 지원 정보를 내놓으면 사용자 model picker에 나타난다. 따라서 도구 확장이 자신의 모델 연결까지 반드시 구현할 필요는 없다. 도구 권한은 전역/채팅 설정의 Ask·Auto·Always Allow 등으로 관리한다. [Model provider](https://developers.raycast.com/ai/provide-ai-models), [AI Extensions와 권한](https://manual.raycast.com/ai/ai-extensions).

**미확인:** 모든 도구의 결과에 대한 강제 output schema 검증, 변경의 공통 diff/Undo, 확장 실행 중단 후 외부 부작용 취소·재시작 복구 보장. 실행 전 confirmation은 문서 제안의 승인 기록과 같지 않다.

### 2.6 MCP: 교환 규약이 추론기·검수기를 대신하지 않는다

**문서 확인.** MCP의 host는 AI 애플리케이션, client는 그 안의 서버 연결 담당, server는 기능·데이터 제공자다. tools는 모델이 사용할 함수, resources는 컨텍스트 자료, prompts는 사용자가 활용할 지시 템플릿이다. LLM 선택과 제공받은 컨텍스트의 사용 방식은 MCP의 결정 대상이 아니다. [Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), [2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28).

`inputSchema`와 선택적인 `outputSchema`/`structuredContent`가 있다. output schema를 선언한 서버는 그 형식의 결과를 제공하고 클라이언트도 검증하도록 권고된다. `structuredContent`는 **서버 도구 결과**이며 모델의 schema-constrained generation과 다르다. protocol error와 `isError` 도구 실행 실패도 구분한다. 사람의 거부 가능성과 실행 표시를 권고하지만 특정 승인 UI나 Undo transaction은 규정하지 않는다. [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

**버전 주의:** 확인한 최신 명세는 `2026-07-28`이다. `2025-11-25`와 달리 stateless 요청·capability metadata로 바뀌었고, 장기 tasks는 별도 opt-in extension으로 이동했다. 여러 앱이 MCP를 지원한다는 사실만으로 동일 버전·extension을 지원한다고 추정하지 않는다. **미확인:** 조사한 제품 전부의 해당 버전 지원. [변경 기록](https://modelcontextprotocol.io/specification/2026-07-28/changelog). Sampling의 버전 경계는 4절에 따로 적었다.

### 2.7 Continue: 모델 역할과 도구 정책을 조합

**문서·소스 확인.** 사용자는 모델에 `chat`, `edit`, `apply`, `autocomplete` 등의 역할을 부여하고 역할별 활성 모델을 고른다. Agent mode는 도구 정의를 모델에 전달하고, 허용된 tool call을 내장 기능/MCP로 실행해 결과를 다시 모델에 공급한다. 도구 정책은 Ask First·Automatic·Excluded이며 사용자 로컬에 보관한다. [Model roles](https://docs.continue.dev/customize/model-roles/00-intro), [Agent loop](https://docs.continue.dev/ide-extensions/agent/how-it-works), [IDE 정책](https://docs.continue.dev/ide-extensions/agent/how-to-customize).

소스의 `BaseLLM`과 provider별 구현이 모델 실행 차이를 흡수한다. CLI에는 `allow/ask/exclude` 정책과 headless에서 승인 대기 도구를 제외하는 규칙이 있다. UI 없는 실행에서도 승인 정책을 잃지 않는 참고점이다. [BaseLLM, `5522c6f4…`](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/llm/index.ts), [CLI tool permissions](https://docs.continue.dev/cli/tool-permissions).

**미확인:** 모든 provider의 동일한 native tool calling·output schema 능력, 임의의 도메인 결과 검증과 프로세스 장애 후 작업 재개 보장. 역할별 여러 모델을 고를 수 있다는 사실은 B에서 그 선택 화면까지 만들 근거가 아니다.

### 2.8 Cline: 실행 허용과 변경 복원을 서로 다른 장치로 제공

**문서·소스 확인.** 현재 VS Code 소스의 `sdk-api-handler.ts`는 `@cline/llms`의 `createHandler`를 사용하고 provider/model/key/base URL 해석을 세션 경로와 공유한다. 과거 `src/api/providers` 구조라고 단정하면 현재 소스를 잘못 설명한다. [Adapter 진입점, `a6507a62…`](https://github.com/cline/cline/blob/a6507a62a147db4a35e27f4294589742ccac5060/apps/vscode/src/sdk/sdk-api-handler.ts).

Auto Approve는 도구 호출별 읽기·편집·명령·MCP 등 권한을 판단한다. Checkpoints는 별도 shadow Git에 파일 상태를 보관하고 diff와 Restore Files / Task / Files & Task를 제공한다. 실행 허용, 파일 복원, 대화 복원을 구분하는 사례다. [Auto Approve](https://docs.cline.bot/features/auto-approve), [Checkpoints](https://docs.cline.bot/core-workflows/checkpoints).

**미확인:** checkpoint가 shell/API의 외부 부작용까지 되돌린다는 보장, 임의 도메인 JSON의 의미 검증, 모든 adapter의 취소 완료 보장. 파일 복원 방식은 Litzio Editor Undo 또는 Docling 교정 기록 취소와 다른 수명·범위를 가진다.

### 2.9 Paseo: LLM 호출이 아니라 에이전트 실행기를 정규화

**소스 확인.** 공개 저장소 `getpaseo/paseo`의 `3e83f433da29b87a73da2550e34898e070b9856a`를 기준으로 읽었다. 이 PC의 설치본과 같다는 주장은 하지 않는다. `AgentClient`는 `createSession/resumeSession`·catalog 조회를, `AgentSession`은 capability·permission 응답·`interrupt/close`와 선택적인 `setModel` 등을 제공한다. 공통 이벤트에 `permission_requested`, `turn_failed`, `turn_canceled`가 있다. [공통 types](https://github.com/getpaseo/paseo/blob/3e83f433da29b87a73da2550e34898e070b9856a/packages/server/src/server/agent/agent-sdk-types.ts).

Codex app-server, ACP 등의 transport·세션 차이는 adapter 안에 있다. provider 가이드는 실행기 연결·모델 발견·인증·capability 차이를 설명하며 provider 플러그인 등록 경로도 제공한다. 공통 도구 catalog는 native 등록과 MCP fallback을 지원하므로 내부 도구를 모두 MCP 서버로 구현한 구조도 아니다. [Provider guide](https://github.com/getpaseo/paseo/blob/3e83f433da29b87a73da2550e34898e070b9856a/docs/providers.md), [Codex adapter](https://github.com/getpaseo/paseo/blob/3e83f433da29b87a73da2550e34898e070b9856a/packages/server/src/server/agent/providers/codex-app-server-agent.ts), [ACP adapter](https://github.com/getpaseo/paseo/blob/3e83f433da29b87a73da2550e34898e070b9856a/packages/server/src/server/agent/providers/acp-agent.ts).

**시사점:** provider는 단순한 `prompt → text` API일 수도, 이미 도구와 대화 수명을 가진 실행기일 수도 있다. 기능 플러그인이 이 차이를 알지 않게 하는 점을 참고할 수 있다. **미확인:** 이 공통 인터페이스만으로 모든 provider에 동등한 재개·Undo·취소 효과가 보장된다는 주장. Paseo의 daemon·스케줄러·세션 저장 전체를 B에 가져올 이유는 없다.

### 2.10 Notion AI / Google Docs Gemini: 제안과 승인 UX

**문서 확인.** Notion은 선택 영역의 Edit with AI에서 수락·폐기·다시 시도를 제공하고, Agent는 페이지/워크스페이스 작업을 다룬다. Google Docs Gemini는 문서 안에 제안된 변경을 보여주고 개별 Accept suggestion·Accept all·Reject all을 제공한다. 결과 생성과 사람이 적용하는 결정을 분리한 사례다. [Notion AI](https://www.notion.com/help/notion-ai-faqs), [Gemini 쓰기·편집](https://support.google.com/docs/answer/13447609?hl=en), [Gemini side panel](https://support.google.com/docs/answer/14206696?hl=en).

**미확인:** 내부 provider adapter·결과 schema·검증 위치·revision 충돌 규칙·Undo의 정확한 transaction 단위·재시작 복구. 공개 UX만으로 기능 플러그인 계약을 추정할 수 없다. 일반 공동 편집용 Google Docs Suggesting mode를 모든 Gemini 작업의 내부 구현이라고도 단정하지 않는다.

## 3. 축별 비교

표는 2절의 출처를 요약한다. **미확인**은 기능이 없다는 뜻이 아니라 이번 공개 자료로 확정하지 못했다는 뜻이다. 8번째 축은 다음 절에서 비교한다.

### 축 1–3: 소유권·모델 선택·구조화 결과

| 사례 | 1. 지시·컨텍스트·실행·검증의 경계 | 2. 사용자 선택과 확장의 모델 지정 | 3. 구조화 결과·검증·실패 |
| --- | --- | --- | --- |
| VS Code | 도구는 확장의 도메인 기능, agent loop는 harness. 직접 LM 호출에서는 확장이 프롬프트/컨텍스트를 구성 | 사용자 picker와 별개로 LM API의 vendor/family/id 필터 가능 | Tool input schema, `LanguageModelError`; 도메인 결과 검증은 별도 |
| Zed | 자체 agent와 MCP 도구 분리. External Agent는 자체 loop/도구/인증 소유 | Zed provider 설정과 외부 agent의 모델 설정은 별개 | ACP의 타입·에러/진행 규약; 도메인 결과 검증은 미확인 |
| JetBrains | IDE toolset이 도메인 기능 제공, Assistant/Junie가 도구 사용 | 사용자 모델/계정 설정. toolset의 Junie 모델 강제 선택은 미확인 | MCP 도구 경계; 내부 최종 결과 검증 API는 미확인 |
| Obsidian 사례 | 각 AI 플러그인이 컨텍스트·실행기·도구를 통합 | 플러그인 내부에서 실행기/모델/연결 선택 | 플러그인별 처리. 호스트 공통 검증은 미확인 |
| Raycast | 도구/확장 지시 기여, Raycast AI가 사용·실행 조정 | 공통 picker + 별도 model-provider 기여. 도구 기여에 provider 구현 필수 아님 | 타입/JSDoc 도구 입력. 공통 output schema 강제는 미확인 |
| MCP | host/client/server 경계. 모델 추론·컨텍스트 정책은 애플리케이션 소유 | 모델 선택을 통일하는 규약 아님 | input/output schema, structuredContent, protocol/tool error 구분 |
| Continue | 공통 agent loop + 내장/MCP 도구 + provider 구현 | 사용자 config/역할별 모델 선택 | 도구 arguments schema와 결과 피드백. 도메인 검증은 별도 |
| Cline | 공통 세션·도구 승인과 SDK inference 경계 | provider/model 설정 해석을 공통 경로로 모음 | 공통 inference handler. 임의 도메인 의미 검증은 미확인 |
| Paseo | daemon의 세션/도구 catalog와 provider 실행기 분리 | provider catalog·capability·세션 모델 변경 표면 | 정규화된 이벤트/실패. 도메인 결과 schema는 별도 |
| 문서 앱 2종 | 호스트가 컨텍스트·제안 UI 제공. 내부 역할 분담 미확인 | 기능 확장의 모델 선택 API는 미확인 | 사용자가 보는 제안 확인. schema/semantic validation 미확인 |

입력 schema, 생성 시 출력 제약, 반환값 schema 검사, 도메인 검증은 서로 다른 단계다. 가령 `self_ref`가 문자열이어도 원본에 존재하지 않을 수 있고, 존재하는 제목의 깊이를 바꿀 수 있어도 원문상 올바른 판단인지는 사람의 확인이 필요하다. 이 구분은 B/C를 위한 해석이며 MCP나 도구 API가 Docling 정확성을 보증한다는 뜻이 아니다.

### 축 4–5: 승인·거절·되돌리기와 작업 수명

| 사례 | 4. 승인·diff·되돌리기 | 5. 장기 작업·취소·장애·재시작 |
| --- | --- | --- |
| VS Code | 도구 실행 승인/Always Allow. 모든 확장 변경의 공통 Undo는 미확인 | cancellation token. 도구별 외부 취소·재시작 재개는 미확인 |
| Zed / ACP | permission 요청, 변경 검토·checkpoint. 외부 agent 지원 범위에 의존 | `session/update/cancel`, 선택적 load. 취소와 복구의 효과는 실행기마다 다름 |
| JetBrains | 실행 승인과 파일 diff·개별/전체 rollback을 구분 | MCP 상태·로그·재연결 제공. 작업 재개·부작용 취소 보장은 미확인 |
| Obsidian 사례 | Quick Ask 교체/삽입 등 플러그인별 UX | 공통 수명·실패 격리·재개 계약은 미확인 |
| Raycast | confirmation + 공통 도구 권한. 문서 diff/Undo는 미확인 | provider streaming 표면. 도구 중단·프로세스 복구 보장은 미확인 |
| MCP | 사람이 도구를 거부할 수 있는 UX 권고. 문서 승인/Undo는 앱 책임 | progress/cancellation, opt-in tasks extension. 제품 전체의 재시작·정확히 한 번 실행 보장은 아님 |
| Continue | 도구별 Ask First/Automatic/Excluded | tool result/error를 loop로 반환. crash 후 실행 재개는 미확인 |
| Cline | 도구 승인과 shadow Git diff/파일·대화 복원 분리 | checkpoint는 editor session을 넘어 보관. 외부 명령 효과의 복구는 미확인 |
| Paseo | permission event/응답. 파일·대화 revert는 선택적 기능 | create/resume·interrupt·close·실패/취소 event. 실제 지원은 provider capability에 의존 |
| 문서 앱 2종 | Notion 수락/폐기/재시도, Gemini 문서 내 개별/전체 승인·거절 | 내부 timeout·실패 격리·정확한 재시작 재개는 미확인 |

도구를 실행해도 된다는 승인과 교정 제안을 문서에 반영한다는 승인은 다르다. 취소 요청, 실행기 종료, 외부 작업 중단, 결과 폐기도 별개다. Litzio의 기존 `uncertain`·자동 재실행 금지를 다른 제품의 Resume 버튼이나 파일 checkpoint로 대체할 수 없다.

### 축 6–7: 권한 경계와 상주 에이전트로의 확장 단서

| 사례 | 6. 권한·자격 증명·네트워크 방향 | 7. 단발 기능과 대화형 에이전트의 관계 |
| --- | --- | --- |
| VS Code | LM 사용 동의, 도구 승인·MCP 신뢰/연결, 사용자 provider 설정 | 직접 LM 기능과 공통 agent 도구 기여가 공존. participant는 폐기 방향 |
| Zed | Zed 모델 설정과 외부 agent의 인증·provider 관계를 구분 | Agent Panel을 공유하되 자체/외부 loop를 구별 |
| JetBrains | 중앙/사용자 MCP 설정, provider key와 작업 승인 분리 | Assistant 채팅, Junie 및 ACP agent, IDE 도구 기여를 조합 |
| Obsidian 사례 | 인증·전송 대상이 플러그인별로 나뉨. 저장 안전성은 미확인 | Quick Ask 같은 단발 UX와 plugin-owned Agent가 공존 |
| Raycast | 공통 도구 권한과 사용자 허용 model-provider 연결 | 기존 확장 기능에 도구를 더해 공통 채팅/Quick AI에서 사용 |
| MCP | host가 노출 범위·승인·연결 정책을 정함 | tools/resources/prompts 재사용. 상주 대화·기억 관리 자체를 제공하지 않음 |
| Continue / Cline | agent 설정의 provider 연결과 도구별 권한 | chat/plan/agent 또는 장기 task가 공통 실행 계층을 사용 |
| Paseo | provider별 실행 환경/인증과 공통 도구 노출 정책 | provider 세션을 상주 관리. daemon 필요성은 Litzio와 별도 판단 |
| 문서 앱 2종 | 앱의 계정·접근 범위를 사용. 플러그인 계약은 미확인 | inline 제안과 넓은 agent/side panel이 공존 |

이 표는 **확장 가능한 경계의 사례**다. 각 서비스가 실제로 같은 개발 순서를 거쳐 단발 기능에서 상주 agent로 성장했다는 연혁은 조사하지 않았다. B에서 권한·키 저장·네트워크 정책의 상세 구현을 결정할 근거로 확대하지 않는다.

## 4. 축 8: 다중 에이전트와 통신 사례

### 하위 에이전트 생성·지시

| 사례 | 공개 근거로 확인한 생성·지시·결과 전달 | 한계 |
| --- | --- | --- |
| Paseo | `create_agent`, `send_agent_prompt`, 상태/활동 조회 도구. agent caller의 신원을 붙이고 queued receipt·완료 응답을 구분. [고정 소스의 tool catalog](https://github.com/getpaseo/paseo/blob/3e83f433da29b87a73da2550e34898e070b9856a/packages/server/src/server/agent/tools/paseo-tools.ts) | Paseo 자체 orchestration 계약이며 다른 실행기의 native 하위 agent와 같지 않음 |
| Claude Code | 별도 context·지시·도구/권한의 subagent가 결과를 반환. Agent teams는 별도 세션을 만들고 이름으로 서로 메시지를 전달. [Subagents](https://code.claude.com/docs/en/sub-agents), [Agent teams](https://code.claude.com/docs/en/agent-teams) | 같은 파일의 충돌·권한은 별도 문제. 다른 agent의 메시지가 사용자 동의가 되는 것은 아님 |
| Codex | 주 agent가 전문 agent를 생성·지시하고 결과를 수집. 별도 thread를 검사/중단·steer할 수 있고 custom agent의 모델·지시 설정 지원. [OpenAI 공식 Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) | local client에서 부모 sandbox/승인 경계를 상속. 임의 업체 간 통신 표준이라는 근거는 없음 |
| VS Code | Local harness의 `runSubagent`, Copilot의 native `task`, Claude/Codex harness의 provider-native 위임을 구분. [Subagents](https://code.visualstudio.com/docs/agents/run/subagents) | 같은 UI의 하위 agent라도 도구 이름·인자·기능이 동일하지 않음 |
| Zed | 자체 agent 도구 `spawn_agent`가 별도 context의 하위 agent를 만들고 결과를 부모가 검토. [Tools](https://zed.dev/docs/ai/tools) | 외부 ACP agent 모두에 동일한 생성·peer messaging이 있다는 근거는 미확인 |

이번 조사에서는 이 기능들을 실제 실행하지 않았다. 독립 context는 파일·외부 부작용 격리와 다르며, 전문 agent가 반환한 결과도 도메인 검증·사람 승인을 대신하지 않는다.

### 프로토콜이 담당하는 관계

| 규약 | 실제로 다루는 관계 | B 관점에서 혼동하면 안 되는 점 |
| --- | --- | --- |
| A2A 1.0 | 독립 agent의 Agent Card로 기능/연결을 발견하고 Message·Task·Artifact로 요청·상태·산출물을 교환. streaming·조회·취소 등의 수명 표면. [고정 버전 명세](https://a2a-protocol.org/v1.0.0/specification/), [개념](https://a2a-protocol.org/latest/topics/key-concepts/) | 원격 전문 agent에 일을 맡기는 규약이며 local subagent를 생성하는 API는 아님. 내부 prompt/도구 구현을 공유할 필요도 없음 |
| ACP v1, Agent Client Protocol | 편집기/클라이언트↔에이전트의 세션·진행·권한·취소 교환. [명세](https://agentclientprotocol.com/protocol/v1/overview) | agent끼리 메시지를 주고받는 A2A와 다름. 같은 약자의 다른 프로토콜과도 구분 |
| MCP tools/resources/prompts | agent 애플리케이션↔기능/데이터 서버. agent를 tool 뒤에 감쌀 수는 있으나 그 자체가 peer-agent 팀 계약은 아님. [Architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) | MCP tool call을 동료 agent 대화·세션 복원과 동일시하지 않음 |
| MCP sampling, 버전 구분 필요 | `2025-11-25`에서 server가 client의 LLM 생성을 요청하고 client가 모델 선택·사람 검토를 통제. [당시 Sampling 명세](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling) | agent 간 일반 통신 규약이 아님. [SEP-2577](https://modelcontextprotocol.io/seps/2577-deprecate-roots-sampling-and-logging)과 [공식 SDK 안내](https://github.com/modelcontextprotocol/go-sdk/blob/main/docs/client.md)는 `2026-07-28`부터 deprecated임을 명시. B의 새 기반으로 단정하지 않음 |

**미확인:** 위 제품들이 서로 A2A로 통신한다는 주장, B에 A2A/ACP/MCP가 필요하다는 주장. 다중 에이전트는 현재 API의 필요성을 입증하는 요구사항이 아니다.

## 5. Litzio에 대한 시사점

다음은 B 설계자가 검토할 **조사자의 해석·권고**다. 새 계약·API 모양·구현 순서를 확정하지 않는다. 기준 범위는 1절의 소유자 결정이다.

### B 최소 골격에 가져올 것

1. **기능과 추론의 소유권을 나눈다.** Raycast/VS Code의 도구 기여처럼 Docling은 구조 지식·입력 조각·지시·결과 형식·검증을 제공하고 기본 포함 AI 에이전트가 실행을 맡는 방향이 적합하다. 도메인 지시와 agent 공통 실행 지시의 최종 조합 책임은 B에서 명확히 해야 한다.
2. **provider 차이를 어댑터 안에 둔다.** Paseo처럼 인증·실행기 오류·취소 차이를 기능 플러그인으로 누출하지 않는 점을 참고한다. B는 Codex 하나와 가짜 어댑터로 충분하며, 모든 실행기를 동일한 대화 세션으로 취급할 필요는 없다.
3. **생성 제약과 결과 검증을 분리한다.** schema를 따르지 않거나 Docling 검증이 거부한 결과를 성공 제안으로 공개하지 않는 방향이 적합하다. provider 실패·취소·형식 실패·도메인 거부를 식별할 수 있어야 사람이 재요청 여부를 판단한다. 가짜 어댑터는 정상/부정 결과와 실행 실패를 재현하는 데 쓸 수 있다.
4. **AI 작업은 제안을 반환하고 적용은 도메인에 남긴다.** C의 Docling 승인·거절·교정 기록 취소는 기능 플러그인 책임이다. Litzio 문서 변경이면 Core semantic operation과 일반 editor history가 책임지지만, 이번 B는 그 보류 기능을 다시 열지 않는다. schema 통과와 사람의 원문 검수는 다른 판정이다.
5. **기존 Host 수명 제약을 먼저 대조한다.** PDF 전용 worker API를 범용 AI로 가장하지 않는다. 별도 실행·완료 공개·UI detach/drain·`uncertain` 제약과 맞는 최소 변경을 설계 때 검토한다. 다른 제품의 durable session을 이유로 새 DB·daemon·자동 retry를 넣지 않는다.

### 미룰 것

- 대화 화면·업체/자격 증명 선택 화면·문서 수정 제안은 최신 결정대로 보류한다. streaming·history·자동 context 수집도 첫 구조 검수에 실제 필요하다는 근거가 생길 때 검토한다.
- MCP/ACP/A2A의 구현·외부 통신·registry·상주 세션 저장은 이번 조사로 채택하지 않는다. 내부 작업 등록·실행과 외부 프로토콜 연결은 서로 다른 문제다.
- 다중 모델 역할, 전문 agent 팀, 장기 계획기, 스케줄러·공유 daemon·공식 배포/보안 운영 상세를 B의 준비 작업으로 만들지 않는다.

### 피할 것

- 기능 플러그인마다 Codex/Claude/API key·모델 선택·retry loop를 두는 구조. Obsidian 사례처럼 기능 단위로 실험하기 쉬워도 공통 실행 정책과 여러 기능의 조합이 분산된다.
- provider가 생성한 문자열/JSON을 승인된 교정으로 처리하거나, 일반 diff/checkpoint를 Docling 교정 기록의 취소와 동일시하는 것.
- 취소 요청을 외부 작업 취소 완료로 표시하거나, 중단 뒤 결과가 불명확한 요청을 자동 재실행하는 것. 기존 Host 계약과 충돌한다.
- **장래 다중 에이전트를 막는 결합:** 작업 요청·결과를 특정 대화 탭, 전역 선택 모델, 단 하나의 mutable agent 객체에만 접근 가능한 값으로 묶는 것. 요청을 전달할 때 도메인 입력·검증 책임·호출자 식별이 사라지는 형태도 피한다. 이것은 결합을 피하자는 의미이며 메시지 버스·agent registry·생성 API를 지금 만들자는 제안이 아니다.
- **권한 우회가 되는 결합:** 다른 agent가 보낸 지시/결과를 사용자 승인으로 간주하거나, provider-native subagent를 항상 독립 권한·독립 작업공간이라고 가정하는 것.

### 열린 질문

- 기능이 요청하는 AI 작업과 장래 agent가 호출할 도구는 어떤 부분만 공유하는가? 같은 registry라는 결론을 먼저 두지 않고 첫 Docling 작업으로 판단해야 한다.
- 기능의 지시·사용자 지시·agent 공통 지시를 누가 조합하고 입력 조각의 범위/기준 snapshot을 누가 고정하는가? provider에 Docling 원문 경로를 넘길 필요가 있는가?
- B의 결과 형식 검증과 C의 Docling 연산 검증은 어디서 연결하며, 결과가 나온 뒤 원본·교정 기록이 달라졌을 때 어떤 기준으로 오래된 제안을 거부하는가?
- generic installed Host operation과 PDF 전용 worker 사이에서 AI 실행에 실제 필요한 최소 확장은 무엇인가? Docling과 AI 플러그인 중 하나가 해제될 때 수락한 작업의 검증·결과 소유권은 어떻게 유지하는가?
- schema/도메인 검증 거부를 재요청할지 사용자가 판단할 수 있는 최소 실패 정보는 무엇인가? 비용을 유발하는 자동 재시도는 아직 전제하지 않는다.

이 질문의 답은 B/C 설계 및 별도 결정에서 정한다. 이번 문서는 사례와 경계를 남기며 제품 동작이나 현재 계약을 변경하지 않는다.
