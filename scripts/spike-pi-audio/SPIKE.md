# 스파이크: Ollama 공급자의 실행 엔진을 pi(ACP 어댑터)로 바꾸기

- 날짜: 2026-11-24 (KST)
- 브랜치: `spike/ollama-pi-audio` (master `f9697591` 기준)
- 결론: **미정** (소유자 결정 대기). 작업자 추천은 아래 "추천"에 있다.

## 확인하려던 질문

Ollama 공급자의 실행 엔진을 Copilot CLI(`copilot --acp`) 대신 pi SDK 기반 ACP 에이전트(`@openma/pi-acp`)로 바꿀 수 있는가.

1. 음성 전달: ACP `audio` 블록으로 보낸 WAV가 어댑터와 pi를 지나 Ollama 요청까지 바이트 그대로 가는가. 공개 확장 지점만으로 되는가.
2. 입력 분량: "안녕?" 첫 요청의 도구 수·도구 정의·지시문 글자 수, 리치오 지시문 횟수, 요청하지 않은 추론 값, 실모델 입력 토큰. 목표는 지금의 절반(약 9,500토큰) 이하.
3. 리치오로 돌아오는 통로: Host MCP 도구(질문 카드·문서 도구), 권한 요청의 모양, 취소, Host 재시작 뒤 재개.
4. 유지비의 경계: 코드량, 의존성, Node 버전, Windows 실행 방식과 셸, 번들 가능성.

## 만든 것

| 파일 | 역할 |
| --- | --- |
| `pi-litzio-acp.mjs` (51줄) | Host의 Ollama 연결이 `copilot --acp` 대신 띄우는 래퍼. Copilot 실행 인자는 무시하고, Host가 이미 넣는 `COPILOT_PROVIDER_BASE_URL`·`COPILOT_MODEL`로 임시 폴더에 pi의 `models.json`·`settings.json`을 쓰고 pi-acp를 같은 프로세스에서 실행한다. pi 설정·세션·HOME은 임시 폴더다. |
| `litzio-audio-extension.mjs` (51줄) | pi 확장. `input` 훅(이미지 정규화 전)에서 음성 바이트를 파일로 빼고 표식으로 바꾸며, `before_provider_request` 훅에서 표식(또는 `.wav` resource_link)을 Ollama `/v1/chat/completions`의 `input_audio`로 바꾼다. |
| `litzio-approval-extension.mjs` (10줄) | pi 확장. `write`·`edit`·`bash` 전에 `ctx.ui.confirm`을 불러 ACP `session/request_permission`을 만든다(선택: `LITZIO_PI_APPROVAL=1`). |
| `../../patches/@openma__pi-acp@0.1.8.patch` | 어댑터 수정 2곳: `promptCapabilities.audio`를 `true`로, `convertPrompt`의 `audio` 블록을 거절 대신 pi 이미지 목록에 실어 보냄(바뀐 줄 5줄 + 주석 1줄). |
| `apps/editor/server/provider-connections.ts` 1줄 | `LITZIO_SPIKE_PI_ACP`가 있으면 Ollama 연결의 실행 파일을 `node <래퍼>`로 바꾼다. 화면·대화 계층은 고치지 않았다. |
| `fake-ollama.mjs` | 요청 본문을 기록하는 가짜 Ollama(`/api/tags`·`/api/show`·`/v1/chat/completions`·`/v1/responses`). 사용자 글의 표식(QCARD·READDOC·WRITEFILE·SLOW·BASH)에 따라 도구를 부른다. |
| `acp-client.mjs` | 리치오의 `@agentclientprotocol/sdk` 0.17.1로 래퍼를 띄우는 ACP 클라이언트(음성 블록·resource_link·취소·재개). |
| `host-driver.ts` | 실제 리치오 HTTP Host를 격리 폴더로 띄워 Ollama 공급자로 시나리오(안녕·질문 카드·문서 읽기·쓰기·취소·재개·셸)를 보낸다. |
| `measure.py`, `replay-tokens.mjs` | 기록된 첫 요청의 분량을 재고, 같은 본문을 실제 Ollama에 다시 보내 입력 토큰을 읽는다. |
| `ollama-direct.mjs`, `fleurs-batch.mjs`, `cer.py` | FLEURS 표본을 Ollama에 직접(OpenAI 호환 `input_audio`, 네이티브 `/api/chat` `images`) 보낸 경우와 pi를 거친 경우를 비교하고 글자 오류율을 낸다. |

의존성(`@earendil-works/pi-coding-agent` 1.6.0, `@openma/pi-acp` 0.1.8)은 이 폴더를 스파이크 브랜치의 workspace에 넣어 설치했다. 테스트는 추가하지 않았다.

## 실행 방법

```sh
pnpm install                      # 이 브랜치. protobufjs·@google/genai의 빌드 스크립트는 저장소 설정으로 실행되지 않으며 그대로 동작한다
node scripts/spike-pi-audio/fake-ollama.mjs 11501 <tmp>/fake.jsonl
# 음성 블록(어댑터 수정 경로)
COPILOT_PROVIDER_BASE_URL=http://127.0.0.1:11501/v1 COPILOT_MODEL=fake-audio:latest PI_SPIKE_ROOT=<tmp>/pi SPIKE_CWD=<tmp>/cwd \
  node scripts/spike-pi-audio/acp-client.mjs audio-block a.wav b.wav
# 리치오 Host 경유 (LITZIO_SPIKE_PI_ACP를 빼면 지금의 Copilot CLI 경로)
LITZIO_SPIKE_PI_ACP=$PWD/scripts/spike-pi-audio/pi-litzio-acp.mjs PI_SPIKE_ROOT=<tmp>/pi SPIKE_ROOT=<tmp> OLLAMA_URL=http://127.0.0.1:11501 \
  node_modules/.bin/tsx scripts/spike-pi-audio/host-driver.ts hello   # qcard | readdoc | write-inside | cancel | followup <id> | bash
python scripts/spike-pi-audio/measure.py <tmp>/fake.jsonl
```

실모델은 `OLLAMA_URL=http://127.0.0.1:11434 SPIKE_MODEL=gemma4:e4b`를 준다. FLEURS는 `fleurs-batch.mjs <samples.json> <out.jsonl> gemma4:e4b`(samples.json은 파일 이름·id·정답 글의 목록이며 저장소에 넣지 않았다).

## 결과

### 1. 음성 전달 — 조건부(된다, 어댑터 5줄 수정 또는 다른 블록 사용)

- 수정하지 않은 pi-acp 0.1.8은 `audio` 블록을 받지 않는다. `initialize`가 `promptCapabilities.audio:false`이고 `convertPrompt`가 `UnsupportedPromptContentError("audio")`를 던져 `invalidParams`가 된다(코드로 확인, 수정 전 상태로 실행하지는 않았다). pi의 사용자 메시지도 글과 이미지뿐이고, 이미지로 실으면 pi의 이미지 정규화가 "[Image omitted…]"로 바꿔 버린다(번들 시험에서 실제로 관찰).
- **어댑터 수정 경로(B):** 위 패치(2곳, 5줄) + pi 확장(`input`·`before_provider_request` 공개 훅)으로, 합성 WAV 두 개(16 kHz 16비트, Windows 음성 합성)가 가짜 Ollama의 `input_audio`에 SHA-256까지 같은 바이트로 도착했다. pi 본체는 고치지 않았다.
- **수정 없는 경로(A):** ACP `resource_link`(WAV 파일 경로)를 보내면 어댑터가 글 속 `[resource_link … path=…]`로 바꾸고, 같은 확장이 그 파일을 읽어 `input_audio`로 넣는다. 같은 두 WAV가 같은 바이트로 도착했다. 이 경우 Host가 음성을 파일로 두고 경로를 보내야 하며 ACP의 `audio` 블록 계약은 쓰지 않는다.
- 두 경로 모두 대화 기록에는 표식(로컬 파일 경로)이 남고, 다음 요청마다 같은 음성을 다시 싣는다(이미지와 같은 방식). 표식의 경로 글은 모델에게도 보인다.
- 실모델은 아래 "실모델 음성" 절.

### 2. 입력 분량 — 된다(목표의 절반 이하)

"안녕?", 전체 접근, 리치오 지시문(`AGENTS.md`)·스킬·Host MCP 연결 포함, 리치오 Host 경유. 분량은 가짜 Ollama가 받은 첫 요청, 토큰은 같은 본문을 실제 Ollama에 다시 보낸 값(캐시 0)과 Host 경유 실행의 엔진 보고값.

| 항목 | 지금(Copilot CLI 1.0.114) | pi 1.6.0 + pi-acp 0.1.8 |
| --- | --- | --- |
| 요청 본문 | 82,047자 | 12,180자 |
| 모델에 보이는 도구 | 36개(Host 10개, GitHub MCP 4개 포함) | 5개(`read`·`bash`·`edit`·`write`·`tool_search`). Host 도구는 `tool_search`로 불러온 뒤 7~8개 추가 |
| 도구 정의 | 52,422자 | 3,626자 |
| 지시문(시스템) | 27,833자 | 7,573자(리치오 `AGENTS.md` 6,068자 포함) |
| 리치오 지시문 | 1번 | 1번 |
| 요청하지 않은 추론 값 | `reasoning.effort: medium`, `summary: auto`, `include: reasoning.encrypted_content` | 없음(`max_completion_tokens`·`store:false`·`stream_options`만) |
| 입력 토큰 `gemma4:e4b` (재생 / Host 경유) | 18,671 / 18,685 | 3,969 / 3,991 |
| 입력 토큰 `qwen3.5:4b` (재생 / Host 경유) | 19,084 / 19,110 | 4,040 / 4,072 |

- pi 쪽 숫자는 아래 두 가지를 바로잡은 뒤의 값이다. 바로잡기 전: 리치오 스킬이 빠짐(프로젝트 신뢰 전이라 `.agents/skills` 미로드, 지시문 6,558자) → `PI_ACP_TRUST_PROJECTS=1` 뒤에는 작업 폴더의 상위 폴더를 거슬러 올라가 사용자 홈의 `~/.agents/skills` 12개 목록까지 들어감(11,664자) → 비서 폴더에 빈 `.git` 폴더를 두어 그 탐색을 멈춤(7,573자).
- pi는 추론 값을 보내지 않지만 `gemma4:e4b`·`qwen3.5:4b`는 Ollama 기본값으로 생각 과정을 내보냈다(질문 카드 실행에서 추론 항목이 보임). 리치오의 추론 강도 선택은 래퍼가 무시하므로 이 경로에서는 효과가 없다.

### 3. 리치오로 돌아오는 통로 — 조건부

| 항목 | 결과 |
| --- | --- |
| 질문 카드 `request_litzio_user_input` | 된다. 가짜 서버: `tool_search` → `mcp__litzio_host__request_litzio_user_input` 호출 → 리치오 대화에 대기 중 카드, `{"accepted":true,…}`가 같은 세션의 도구 결과로 돌아와 턴 완료. 실모델: `qwen3.5:4b`는 한 번에 성공, `gemma4:e4b`는 셸로 `litzio operation invoke`를 먼저 시도(실패)하고 형식 오류 2번 뒤 성공(턴 31초). |
| 문서 도구 `read_document` | 된다(가짜 서버). 열린 폴더의 문서를 읽어 결과가 같은 세션으로 돌아옴. 범위 밖 경로는 Host가 `forbidden`으로 거절했다. |
| Host 도구 노출 | pi는 ACP `mcpServers`를 `deferred`로 등록해 모델이 `tool_search`로 먼저 불러와야 한다. 이름은 `mcp__litzio_host__<도구>`로, 지시문의 `request_litzio_user_input` 이름과 다르다. |
| 권한 요청 | **수정 없이는 안 된다.** pi-acp는 자기 도구에 `session/request_permission`을 보내지 않는다(README: "adds no tool approval modes"). 읽기 전용·열린 폴더 권한에서도 열린 폴더 안·밖 파일을 승인 없이 썼다(가짜 서버, `write` 4가지 조합). 승인 확장(10줄)을 넣으면 `request_permission`이 오고 리치오 승인 카드가 뜨며 허용·거절이 동작했고 전체 접근은 자동 허용됐다. 다만 요청이 `kind:"other"`·경로 없음이라 리치오 승인 처리(`copilotPermission`)의 "열린 폴더 안 편집 자동 허용"과 "읽기 전용에서 읽기만 허용" 판정을 쓸 수 없어, 열린 폴더 안 쓰기도 매번 카드가 된다. |
| 취소 | 된다. 느린 응답 중 Host `interrupt` → ACP `session/cancel` → 턴 `interrupted`. |
| Host 재시작 뒤 재개 | 된다. 새 Host에서 `resume` → `session/load` 재생으로 사용자 글·답이 복원되고, 다음 전송의 모델 요청에 앞선 대화가 들어갔다. |
| 기타 | pi-acp의 `_auth/status_update` 확장 알림을 리치오 클라이언트가 처리하지 않아 SDK가 "Method not found"를 stderr에 찍는다(동작에는 영향 없음). Host 진단의 버전 줄이 `node --version` 값(v24.22.3)이 된다. |

### 4. 유지비의 경계

- **코드량(스파이크):** 래퍼 51줄 + 음성 확장 51줄 + 승인 확장 10줄 + Host 1줄 + 어댑터 패치 5줄. 시험 도구는 별도.
- **의존성:** pi-acp에서 따라 들어오는 패키지 124개, 설치 크기 약 129 MB(번들 전). 큰 것: pi-coding-agent 24.8 MB, openai SDK 24.1 MB, @google/genai 12.5 MB, @anthropic-ai/sdk 9.5 MB, AWS Bedrock SDK — pi-ai가 모든 공급자 SDK를 함께 끌고 온다. 설치 스크립트가 있는 패키지(protobufjs, @google/genai)는 저장소의 `allowBuilds` 규칙으로 실행되지 않았고(`ERR_PNPM_IGNORED_BUILDS`) 그대로 동작했다. 승인 설정은 넣지 않았다. 공개 24시간 규칙에는 걸리지 않았다(pi 1.6.0 11-20, pi-acp 0.1.8 10-17 공개).
- **사전 조사 정정:** `@openma/pi-acp`의 최신 버전은 0.1.9가 아니라 **0.1.8**이다(npm `latest`). pi-acp는 ACP SDK `^1.4.0`(설치 1.9.0)을 쓰고 리치오는 0.17.1을 쓴다. 두 판이 함께 설치되며 프로토콜은 시험한 범위에서 맞았다.
- **Node:** pi·pi-acp는 Node ≥22.19, 리치오는 ≥24.22.3을 요구한다. 이 PC의 Node 24.22.3에서 자식 프로세스(`node.exe <래퍼>`)로 동작했다. Desktop에서 Host가 Electron 안에서 돌 때 `process.execPath`가 Electron이라 `ELECTRON_RUN_AS_NODE` 같은 처리가 필요한지는 확인하지 않았다.
- **셸:** pi의 기본 `bash` 도구는 Git Bash(`/usr/bin/bash`)로 실행된다. 리치오 CLI 심(`litzio.cmd`)이 Bash에서 `litzio`로 불리지 않았다("command not found"). pi의 선택형 `powershell` 도구(`defaultTools: ["read","powershell","edit","write"]`)로 바꾸면 PowerShell 7에서 `litzio --version`이 동작했다. Git for Windows가 없는 PC의 동작은 확인하지 않았다.
- **사용자 환경을 읽는 곳:** `~/.pi/agent`(래퍼에서 임시 폴더로 돌림), 작업 폴더의 상위로 올라가는 `.agents/skills`(git 뿌리에서 멈춤. 비서 폴더가 사용자 홈 아래라 실제로 사용자 홈의 스킬 목록이 들어왔고 빈 `.git` 폴더로 막음), 상위로 드라이브 뿌리까지 올라가는 `AGENTS.md`/`CLAUDE.md`(막지 않음, 이 PC에는 해당 파일 없음), 환경 변수의 공급자 API 키(이 PC의 `OPENCODE_API_KEY`로 OpenCode 모델들이 세션 모델 목록에 나왔다. 부르지는 않았다). 원격 텔레메트리·버전 확인은 환경 변수로 껐다.
- **번들:** esbuild로 어댑터를 단일 파일(16.7 MB)로 묶으면 실행·대화는 되지만, pi의 확장 로더가 `typebox` 등을 실행 중에 찾지 못해 리치오 확장이 로드되지 않았고 음성이 "[Image omitted…]"로 조용히 사라졌다. pi 패키지 폴더를 함께 싣거나 확장 로드 방식을 맞추는 일이 필요하다(미해결).

### 실모델 음성 (`gemma4:e4b`)

- `/api/show`의 capabilities: `completion, vision, audio, tools, thinking`. `qwen3.5:4b`는 `audio` 없음.
- `ollama ps`: 100% GPU, 컨텍스트 65536(VRAM 8 GB PC). CPU로 밀리지 않았다.
- 표본: Google FLEURS(Hugging Face `google/fleurs`, CC-BY 4.0) — 한국어 `ko_kr` test 0~3(id 1883, 1929, 1701, 2000), 영어 `en_us` validation 0~3(id 1548, 1620, 1510, 1578). 영어 test 분할은 데이터셋 뷰어 API가 크기 한도로 거절했고 압축 묶음이 290 MB라 validation을 썼다. 뷰어가 주는 WAV(16 kHz, 32비트 부동소수, 모노)를 변환 없이 보냈다. 음성 파일과 정답 글은 저장소에 넣지 않았다.
- 경로: v1 = Ollama `/v1/chat/completions` `input_audio`(pi가 쓰는 길), native = `/api/chat` `images`, pi = 리치오 클라이언트 → ACP `audio` 블록 → 수정 어댑터 → pi(리치오 지시문 포함) → Ollama.
- 받아쓰기 글자 오류율(NFKC·소문자, 문장부호·공백 제거 뒤 편집 거리 / 정답 글자 수. 숫자 표기 차이도 오류로 셈):

| 언어 | v1 | native | pi |
| --- | --- | --- | --- |
| 한국어(4개, 177자) | 4.5% | 5.1% | 3.4% |
| 영어(4개, 409자) | 4.9% | 3.9% | 3.9% |

| 표본 | v1 | native | pi |
| --- | --- | --- | --- |
| ko test 1883 | 3.8% | 5.7% | 0.0% |
| ko test 1929 | 4.9% | 4.9% | 7.3% |
| ko test 1701 | 3.0% | 3.0% | 3.0% |
| ko test 2000 | 6.0% | 6.0% | 4.0% |
| en validation 1548 | 1.6% | 1.6% | 1.6% |
| en validation 1620 | 4.2% | 3.3% | 2.3% |
| en validation 1510 | 0.0% | 0.0% | 2.3% |
| en validation 1578 | 22.2% | 17.8% | 17.8% |

- 내용 질문("이 음성은 무엇에 관한 내용인가? 한 문장으로 답하라."): 판정 기준은 "정답 문장의 주제를 맞게 말하면 맞음, 고유명사 오류는 따로 적음". v1 8/8, pi 8/8 맞음. 두 경로 모두 en 1620의 "Javanese"를 "Japanese"로 들었다(예: 정답 "…Javanese cuisine features an array of simply seasoned dishes…").
- 시간(평균): 받아쓰기 v1 0.4초·native 0.9초·pi 7.2초, 내용 질문 v1 2.5초·pi 4.7초. pi 쪽은 어댑터 프로세스 시작(약 1.2초), 약 4천 토큰의 지시문, 모델의 생각 출력이 더해진 값이다.

## 검증하지 않은 것과 한계

- 화면(브라우저·Desktop) 표시, Electron 안에서의 실행, 설치본 패키징.
- 리치오 화면에서 음성을 첨부하는 경로(Host 첨부는 지금 이미지뿐). 음성은 스파이크 클라이언트로만 보냈다.
- 수정 전 어댑터의 음성 거절은 코드로만 확인했다.
- 실모델의 승인 카드(가짜 서버로만 확인), 실모델의 `read_document`, 긴 대화·자동 압축, 두 번째 턴 이후 음성 재전송의 비용, 다른 모델·GPU, Git Bash가 없는 Windows, 원격 Ollama 주소.
- 표본은 언어마다 4개뿐이고 글자 오류율은 작은 표본의 값이다. 모델 품질 평가가 아니다.
- 대안 D(Host가 `/api/chat`을 직접 부르는 루프)는 구현하지 않았다. 아래 추정만 있다.

## 현재 결정과 어긋나는 점

- [비서 계약](../../docs/design/main-agent-v1.md)의 "GitHub Copilot과 Ollama는 Copilot CLI의 `copilot --acp`" 엔진 표를 환경 변수 하나로 바꿨다. 진단의 "Copilot CLI로 실행"·버전 줄·CLI 업데이트 연결은 pi 경로에 맞지 않는다.
- 비서 계약의 권한 모드(Copilot·Ollama 제한 모드는 `allow_all=off`와 공급자 승인 요청)는 pi-acp에 대응하는 설정이 없다. 승인 확장 없이는 제한 권한이 적용되지 않는다.
- 비서 폴더에 빈 `.git` 폴더를 만들었다(스파이크 래퍼만).

## 추천 (작업자, 결론은 소유자)

**B를 계속한다(정식 구현 이슈로 넘길 가치가 있음). 확신은 중간.** 입력이 약 19,000토큰에서 약 4,000토큰으로 줄고, 음성이 pi 본체 수정 없이(어댑터 5줄 또는 resource_link) 모델까지 같은 바이트로 가며, Host 도구·질문 카드·취소·재개가 그대로 맞물렸다. 남는 위험은 권한 의미(제한 권한), 사용자 환경 격리, 셸, Desktop 패키징이다. 정식 구현 전에 권한 처리 방법과 Desktop 실행을 먼저 확인하는 작은 단계가 필요하다.

**대안 D의 비용 추정(구현하지 않음):** 리치오 Host가 Ollama `/api/chat`을 직접 부르는 최소 루프는 스트리밍 해석, 도구 호출 루프, 파일 읽기·편집·쓰기·셸 도구, 대화 기록 저장·재개, 취소, 사용량, 컨텍스트 초과 처리를 리치오가 새로 가져야 한다. Host 도구는 이미 리치오 안에 있어 직접 부를 수 있고 권한은 리치오 범위로 정확히 맞출 수 있다는 이점이 있다. 이번 스파이크에서 pi가 대신해 준 것(위 목록과 `session/load` 재생, 도구 지연 노출)의 양으로 보면 테스트 포함 1,000~2,000줄 규모로 추정하며, ADR-0021의 범용 에이전트 능력(셸·파일 편집의 질)을 계속 리치오가 유지해야 한다. 음성만 놓고 보면 D가 가장 단순하지만(`images[]`에 바이트 추가) 에이전트 전체를 소유하는 비용이 크다.

**채택 시 master에서 다시 구현할 범위(추정):**

| 일 | 크기 |
| --- | --- |
| 엔진 표에 pi 엔진 추가, Ollama → pi. `CopilotAcp`의 Copilot 전용 부분(실행 인자·`allow_all`·버전·업데이트) 분리 | 중 |
| pi 실행 환경 격리: Host 소유 폴더의 agent·세션 폴더, `models.json`(주소·모델·컨텍스트), 텔레메트리·버전 확인 끄기, 상위 폴더 스킬·`AGENTS.md` 탐색 차단, 공급자 API 키 환경 변수 제외, 프로젝트 신뢰 | 중 |
| 권한: 승인 확장 + 리치오가 판정할 수 있는 종류·경로를 담는 방법(어댑터 수정 또는 리치오 쪽 판정 확장) | 중~대 |
| 음성 첨부: Host 첨부 종류에 음성 추가, ACP `audio` 블록(어댑터 수정 유지) 또는 resource_link, 음성 확장, 모델 능력(`/api/show`)에 따른 허용 | 중 |
| 셸: Windows에서 PowerShell 도구 사용 | 소 |
| 진단·업데이트·계약 문서: 버전 줄, "Copilot CLI로 실행" 안내, `provider-update`의 대상, 비서 계약 갱신 | 중 |
| 추론 강도: pi thinking level과 리치오 선택값 연결 또는 숨김 | 소 |
| Desktop 패키징: Electron에서의 실행, pi 패키지 폴더 포함(설치 크기 +약 130 MB, 번들 전) | 중~대(미확인) |
| 테스트: 가짜 Ollama로 엔진 교체·권한·음성 바이트 | 중 |

## 둘째 실험: 실제 작업을 끝낼 때까지의 비용과 성공률 (2026-11-24)

첫 실험은 "안녕?" 한마디의 입력만 쟀다. 둘째 실험은 실제 작업(문서 수정, 플러그인 제작)을 끝낼 때까지의 누적 입력과 성공 횟수를 두 엔진에 같은 조건으로 잰다. pi가 Host 도구를 `tool_search` 뒤에 숨겨 두는 방식이 작은 모델에서 재시도로 입력 이득을 까먹는지가 질문이다. 결과로 pi 경로를 이어 갈지 접을지를 정하므로 pi 쪽 지시문·도구 구성은 새로 다듬지 않았다.

### 설계 (실행 전에 정한 것)

- 엔진: (A) 지금 제품 경로 — Ollama 공급자 = Copilot CLI 1.0.114(`copilot --acp`) + Ollama, (B) 첫 실험의 pi 경로(`pi-litzio-acp.mjs`, PowerShell 도구 `PI_SPIKE_POWERSHELL=1`, 프로젝트 신뢰, 비서 폴더의 빈 `.git`. 승인 확장은 전체 접근이라 넣지 않음).
- 모델: `gemma4:e4b` 하나(이 PC의 Ollama, 컨텍스트 65536). 지시서는 `qwen3.5:4b`도 넣었으나 소유자 지시(2026-11-24)로 제외했고, `qwen3.5:4b`로 돌린 실행은 없다.
- 추론: 두 엔진 모두 모델 기본값(생각 켬). Copilot CLI는 Host가 넘기는 `--reasoning-effort medium` 때문에 요청에 `reasoning.effort: medium`·`summary: auto`가 실리고, pi는 추론 값을 보내지 않는다. 프록시로 본 응답에서 두 엔진 모두 거의 모든 요청에 생각 출력이 있었다(원자료 "생각 출력 요청" 칸). 생각의 강도가 같은 뜻인지는 확인하지 못했다(gemma4가 `effort` 단계를 구분하는지 미확인).
- 권한: 전체 접근만.
- 과제(실행마다 새 격리 Host·새 대화·같은 초기 폴더):
  1. 문서 수정: 합성 리치오 문서 `점검.md`(제목 둘, 문단 넷, 표 하나)에서 `"검사 주기는 매주 월요일 오전이다." 문단의 요일을 수요일로 고쳐 줘. 다른 곳은 바꾸지 마.` 성공 = 파일이 바뀌고, 바뀐 줄이 그 문단뿐이고, `litzio check` 통과. 후속 턴: `방금 고친 문단 아래에 한 문장을 더해 줘.` 성공 = 앞뒤 원문은 그대로, 그 문단 자리에 글이 늘고, `litzio check` 통과.
  2. 플러그인 제작: 기준 글(`작은 화면 플러그인 하나를 만들어 이 Host에 설치해 줘. ID는 local.counter, …`)을 그대로 보냄. 성공 = 대화가 끝난 뒤 Host 플러그인 목록에 `local.counter`가 켜짐·실행. 후속 턴: `버튼 글자를 '한 번 더'로 바꿔 줘.` 성공 = 켜짐·실행이고 Host가 가진 설치 사본(작업 폴더의 소스가 아님)에 그 글자가 있음.
  3. 음성(pi만): 한 세션에서 ① FLEURS 표본 받아쓰기, ② 글만으로 "방금 음성에서 두 번째로 말한 내용이 뭐였지?", ③ 음성과 무관한 질문. 한국어 `ko_kr` test id 1883, 영어 `en_us` validation id 1620(첫 실험의 표본).
- 반복: 과제 1·2는 엔진마다 3번, 엔진을 번갈아 실행. 한 턴 20분 제한(실제로는 모두 2분 안에 끝남).
- 판정 기준: "pi의 입력 이득이 남는다" = 성공한 실행끼리 본 과제 누적 입력 토큰 중앙값이 Copilot CLI의 70% 이하. "pi가 작업을 끝낸다" = 과제 1과 2 각각에서 pi 성공 횟수가 Copilot CLI보다 적지 않다. 둘 다 맞으면 "이어 갈 근거가 있다", 성공 횟수가 뒤지면 "접을 근거가 있다", 성공은 비슷한데 입력 이득이 사라지면 "입력 이득은 실제 작업에서 유지되지 않는다".

### 측정 방법

- `ollama-proxy.mjs`: Host가 쓰는 Ollama 주소 자리에 두는 기록용 프록시. 요청과 응답 조각을 받는 즉시 그대로 넘기고(응답을 모아 두었다 보내지 않음), 끝난 뒤 사본에서 Ollama가 보고한 입력·출력 토큰, 생각 출력 글자 수, 모델이 부른 도구, 요청에 실린 음성 개수·바이트를 한 줄씩 적는다.
- `task-driver.ts`: 실행마다 새 격리 리치오 HTTP Host(`isolatedHostEnvironment`, Host 허용 폴더 = 실행 폴더 전체)를 이 프로세스에 띄우고 기존 대화 route로 본 과제와 후속 턴을 보낸 뒤 판정한다. 질문·승인 카드에는 답하지 않고 그 자리에서 멈춘 것으로 기록한다. `run-exp2.sh`가 실행 순서를 돌리고 `summarize-exp2.mjs`가 표를 만든다. 실패 종류는 `transcript.mjs`로 대화 기록(pi 세션 파일, Copilot CLI `events.jsonl`)을 읽어 사람이 분류했다.
- 모델 호출 수 = 프록시가 본 모델 요청 수. 도구 호출(모델) = 모델 응답의 도구 호출 수. 도구 항목/실패 = Host 대화 기록의 도구 항목 수와 그중 실패 수. 질문 카드에서 멈춘 턴은 Host가 턴을 끊으며 마지막 요청의 사용량이 보고되지 않았다("미보고"로 표시, 누적에서 빠짐).

### 사용자 홈 자료 확인 (실모델 전에 가짜 서버로)

`home-leak-check.mjs`로 첫 요청 본문에서 사용자 홈의 스킬(`~/.agents/skills`, `~/.claude/skills` 등) 이름·설명과 지시 파일(`AGENTS.md`, `CLAUDE.md`, `copilot-instructions.md`, 작업 폴더의 상위 폴더 전부)의 문장을 찾았다.

| 경로 | 처음 | 막은 방법 | 막은 뒤 |
| --- | --- | --- | --- |
| pi | 없음(첫 실험의 HOME 임시 폴더·빈 `.git`) | — | 없음. 리치오 스킬 2개(`litzio-authoring`, `litzio-guide`)와 Host 소유 비서 지시문만 |
| Copilot CLI | **사용자 홈의 스킬 10개가 "project" 위치로 실림**(설명 포함) | 비서 폴더의 빈 `.git`·실제 git 저장소: 안 막힘. 실험 폴더를 사용자 홈 밖으로: 안 막힘. **HOME·USERPROFILE을 임시 폴더로 둔 채 실행하는 래퍼(`copilot-home-wrapper.mjs`) + 홈 밖 실험 폴더**: 막힘 | 없음. 리치오 스킬 2개와 비서 지시문만. 도구 36개(GitHub MCP 4개 포함)는 그대로 |

Copilot CLI는 작업 폴더와 상관없이 사용자 홈의 `.agents/skills`를 읽는다(지금 제품 경로에서도 그렇다는 뜻이다). 이 실험에서는 pi 래퍼와 같은 조건(HOME 임시 폴더)으로 맞췄다. 사용자 홈의 Copilot 설정 파일은 읽기만 했고 바꾸지 않았다.

### 실험 중 고친 것 (환경 문제로 실험이 제대로 돌지 않은 경우만)

| 무엇 | 왜 | 버린 실행 |
| --- | --- | --- |
| Copilot CLI에 HOME 임시 폴더 래퍼, 실험 폴더를 사용자 홈 밖에 | 위 사용자 홈 자료 차단 | 없음(실모델 전) |
| 실행기 Host에 `daemon run`과 같은 daemon health 응답을 줌 | 없으면 `/daemon/health`가 없어 비서가 쓰는 `litzio plugins …`가 모두 "Host protocol check failed"로 실패했다. 제품(daemon)에서는 되는 경로다 | 과제 2 첫 6회(두 엔진 모두 0/3) |
| 실행기 Host 허용 폴더를 `docs`에서 실행 폴더 전체로(비서 수락 시험 실행기의 `daemon run --root <run>`과 같게) | 전체 접근에서 Host 도구 `manage_plugins scaffold`가 Host의 플러그인 제작 폴더(데이터 폴더 아래)에 쓰지 못해 `forbidden`. Copilot CLI는 이 도구를, pi는 CLI를 써서 두 엔진의 조건이 달랐다 | 과제 1·2 모두 12회(같은 환경으로 비교하려고 과제 1도 다시 돌림) |
| 판정용 `litzio check`를 비동기로 | 같은 프로세스의 Host를 막아 한 실행의 후속 턴 전송이 실패(`fetch failed`) | 과제 1 pi 1회 |

버린 실행은 아래 "참고: 버린 실행"에 숫자만 남겼고 판정에 쓰지 않았다. 실패한 실행을 고쳐 다시 돌린 것은 없다.

모델이 전체 접근으로 실험 폴더 밖에 파일을 만든 일이 한 번 있었다(버린 실행 중 Copilot CLI 1회, 드라이브 뿌리에 `plugins\local.counter` 폴더와 파일 3개). 지우지 않고 그 실행 폴더로 옮겨 다음 실행의 초기 상태를 같게 했다. 이후 실행 사이마다 같은 자리를 확인했고 다시 생기지 않았다.

### 실행 방법

```sh
# 사용자 홈 밖의 실험 폴더 <E>, 실제 Ollama 앞의 기록용 프록시
node scripts/spike-pi-audio/ollama-proxy.mjs 11600 <E>/proxy.jsonl http://127.0.0.1:11434
bash scripts/spike-pi-audio/run-exp2.sh <E> 3 11600            # 과제 1·2, 엔진 번갈아 3번씩
node scripts/spike-pi-audio/summarize-exp2.mjs <E>               # 원자료·요약 표(<E>/overrides.json의 수기 분류 반영)
node scripts/spike-pi-audio/transcript.mjs <E>/runs/<실행>       # 도구 호출·결과(실패 분류용)
# 과제 3(pi만): <E>/audio/assistant에 비서 지시문·리치오 스킬·빈 .git을 둔다
COPILOT_PROVIDER_BASE_URL=http://127.0.0.1:11600/v1 COPILOT_MODEL=gemma4:e4b PI_SPIKE_ROOT=<E>/audio/pi SPIKE_CWD=<E>/audio/assistant \
  PROXY_LOG=<E>/proxy.jsonl PI_SPIKE_POWERSHELL=1 node scripts/spike-pi-audio/audio-turns.mjs <wav> <out.json>
# 사전 확인: 가짜 Ollama(fake-ollama.mjs)로 한 번 돌린 뒤
node scripts/spike-pi-audio/home-leak-check.mjs <fake.jsonl> <E>/runs/<실행>/assistant
# 판정 코드 자가 시험(모델 없이 CLI로 scaffold·설치·글자 바꿔 재설치)
SPIKE_SELFTEST_PLUGIN=1 OLLAMA_URL=... PROXY_LOG=... tsx scripts/spike-pi-audio/task-driver.ts plugin <E>/selftest
```

### 원자료 (실행별)

본 과제 = 턴 1, 후속 = 턴 2. 입력·출력은 Ollama가 보고한 토큰의 합.

| 실행 | 턴 | 성공 | 실패 종류 | 끝난 상태 | 시간(초) | 모델 호출 | 도구 호출(모델) | 도구 항목/실패(Host 기록) | 누적 입력 | 누적 출력 | 첫 요청 입력 | 마지막 요청 입력 | 생각 출력 요청 | tool_search / 붙은 도구 | 부른 도구 |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| edit-copilot-1 | 1 | O | - | completed | 18.9 | 4 | 3 | 3/1 | 74,613 | 1,343 | 17,803 | 19,272 | 4/4 | 0 / 0 | litzio_host-create_document edit view |
| edit-copilot-1 | 2 | X | 질문에서 멈춤(무슨 문장인지 질문 카드) | question-pending | 5.3 | 2 | 1 | 1/0 | 18,558(+1 미보고) | 284 | 18,558 | - | 1/2 | 0 / 0 | litzio_host-request_litzio_user_input |
| edit-copilot-2 | 1 | O | - | completed | 11.6 | 2 | 1 | 1/0 | 36,091 | 578 | 17,803 | 18,288 | 2/2 | 0 / 0 | edit |
| edit-copilot-2 | 2 | X | 질문에서 멈춤(무슨 문장인지 질문 카드) | question-pending | 4.3 | 2 | 1 | 1/0 | 18,182(+1 미보고) | 197 | 18,182 | - | 1/2 | 0 / 0 | litzio_host-request_litzio_user_input |
| edit-copilot-3 | 1 | O | - | completed | 11.5 | 2 | 1 | 1/0 | 36,093 | 528 | 17,799 | 18,294 | 2/2 | 0 / 0 | edit |
| edit-copilot-3 | 2 | X | 질문에서 멈춤(무슨 문장인지 글로 질문) | completed | 7.4 | 1 | 0 | 0/0 | 18,173 | 513 | 18,173 | 18,173 | 1/1 | 0 / 0 |  |
| edit-pi-1 | 1 | O | - | completed | 10.8 | 3 | 2 | 2/0 | 12,667 | 781 | 3,762 | 4,584 | 3/3 | 0 / 0 | read edit |
| edit-pi-1 | 2 | X | 질문에서 멈춤(질문 카드 도구를 직접 불러 '없는 도구' 실패 뒤 글로 질문) | completed | 6.1 | 2 | 1 | 1/1 | 8,983 | 576 | 4,297 | 4,686 | 2/2 | 0 / 0 | request_litzio_user_input |
| edit-pi-2 | 1 | O | - | completed | 7.1 | 3 | 2 | 2/0 | 12,260 | 519 | 3,762 | 4,381 | 3/3 | 0 / 0 | read edit |
| edit-pi-2 | 2 | X | 질문에서 멈춤(질문 카드 도구 '없는 도구' 2번 뒤 글로 질문) | completed | 10.8 | 4 | 3 | 3/2 | 19,733 | 1,233 | 4,287 | 5,599 | 4/4 | 0 / 0 | read request_litzio_user_input request_litzio_user_input |
| edit-pi-3 | 1 | O | - | completed | 9.1 | 4 | 3 | 3/0 | 17,348 | 772 | 3,760 | 4,751 | 4/4 | 0 / 0 | read edit read |
| edit-pi-3 | 2 | X | 질문에서 멈춤(질문 카드 도구 '없는 도구' 뒤 글로 질문) | completed | 9.7 | 3 | 2 | 2/1 | 14,657 | 1,087 | 4,467 | 5,255 | 3/3 | 0 / 0 | read request_litzio_user_input |
| plugin-copilot-1 | 1 | X | 도구 인자 형식 오류의 반복(create_document 상대 경로·잘못된 입력 6번, manage_plugins source·register 인자 3번), 스킬·scaffold 안 씀 | completed | 44.9 | 11 | 18 | 19/12 | 238,583 | 4,991 | 17,878 | 23,977 | 11/11 | 0 / 0 | litzio_host-create_document litzio_host-create_document litzio_host-create_document powershell litzio_host-create_document litzio_host-create_document litzio_ho |
| plugin-copilot-1 | 2 | X | 그 밖(작업 폴더의 소스만 고치고 설치 없음) | completed | 6.3 | 2 | 1 | 1/0 | 43,229 | 400 | 21,455 | 21,774 | 2/2 | 0 / 0 | edit |
| plugin-copilot-2 | 1 | O | - | completed | 43.7 | 8 | 7 | 10/1 | 219,218 | 4,657 | 17,874 | 31,622 | 8/8 | 0 / 0 | skill litzio_host-manage_plugins view edit litzio_host-manage_plugins edit litzio_host-manage_plugins |
| plugin-copilot-2 | 2 | O | - | completed | 6.4 | 3 | 2 | 3/0 | 88,842 | 338 | 29,308 | 29,940 | 3/3 | 0 / 0 | edit litzio_host-manage_plugins |
| plugin-copilot-3 | 1 | X | 도구 인자 형식 오류의 반복(manage_plugins에 로컬 폴더를 source로 2번), 스킬·scaffold 안 씀 | completed | 35.5 | 5 | 5 | 5/2 | 99,730 | 3,337 | 17,884 | 21,241 | 5/5 | 0 / 0 | powershell create create litzio_host-manage_plugins litzio_host-manage_plugins |
| plugin-copilot-3 | 2 | X | 그 밖(작업 폴더의 소스만 고치고 설치 없음) | completed | 7.1 | 2 | 1 | 1/0 | 38,435 | 444 | 19,064 | 19,371 | 2/2 | 0 / 0 | edit |
| plugin-pi-1 | 1 | X | 도구를 못 찾음(manage_plugins를 셸 명령으로 실행, tool_search 0번) + 작업 폴더에 소스를 써서 ID 설치 거절 2번 | completed | 51.6 | 11 | 10 | 10/3 | 156,994 | 5,363 | 3,838 | 17,784 | 11/11 | 0 / 0 | read powershell powershell write write write powershell powershell powershell powershell |
| plugin-pi-1 | 2 | X | 그 밖(소스 수정 뒤 같은 설치 거절) | completed | 18.8 | 5 | 4 | 4/3 | 76,227 | 1,285 | 14,599 | 15,924 | 5/5 | 0 / 0 | edit edit edit powershell |
| plugin-pi-2 | 1 | X | 도구를 못 찾음(scaffold를 셸로 실행, tool_search 0번) 뒤 직접 작성, 설치 검증 오류(host.mjs 형식) 반복 | completed | 70.5 | 15 | 14 | 14/5 | 245,906 | 7,866 | 3,842 | 21,091 | 15/15 | 0 / 0 | read powershell powershell write write write powershell edit edit read edit powershell write powershell |
| plugin-pi-2 | 2 | X | 그 밖(같은 설치 검증 오류) | completed | 12.7 | 3 | 2 | 2/1 | 50,918 | 810 | 16,611 | 17,290 | 3/3 | 0 / 0 | edit powershell |
| plugin-pi-3 | 1 | X | 도구를 못 찾음(manage_plugins를 셸 명령으로 3번, tool_search 0번), 설치 시도 없이 끝냄 | completed | 43.3 | 9 | 8 | 8/4 | 124,375 | 4,226 | 3,843 | 16,926 | 9/9 | 0 / 0 | read powershell powershell powershell write write write powershell |
| plugin-pi-3 | 2 | X | 그 밖(소스만 고치고 설치 없음) | completed | 8.7 | 2 | 1 | 1/0 | 28,863 | 714 | 14,149 | 14,714 | 2/2 | 0 / 0 | edit |

### 요약

| 엔진 | 과제 | 성공 | 누적 입력 중앙값(성공한 실행) | 누적 입력 중앙값(전체) | 모델 호출 중앙값 | 시간 중앙값 | 요청 하나의 입력(첫 → 마지막, 중앙값) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Copilot CLI | 1 문서 수정 | 3/3 | 36,093 | 36,093 | 2 | 11.6초 | 17,803 → 18,294 |
| pi | 1 문서 수정 | 3/3 | 12,667 | 12,667 | 3 | 9.1초 | 3,762 → 4,584 |
| Copilot CLI | 1 후속 | 0/3 | - | 18,182 | 2 | 5.3초 | 18,182 |
| pi | 1 후속 | 0/3 | - | 14,657 | 3 | 9.7초 | 4,297 → 5,255 |
| Copilot CLI | 2 플러그인 | 1/3 | 219,218 | 219,218 | 8 | 43.7초 | 17,878 → 23,977 |
| pi | 2 플러그인 | 0/3 | - | 156,994 | 11 | 51.6초 | 3,842 → 17,784 |
| Copilot CLI | 2 후속 | 1/3 | 88,842 | 43,229 | 2 | 6.4초 | 21,455 → 21,774 |
| pi | 2 후속 | 0/3 | - | 50,918 | 3 | 12.7초 | 14,599 → 15,924 |

`tool_search`는 pi의 판정용 6개 실행(12턴)에서 **0번** 불렸다(버린 실행·음성 과제까지 포함한 pi 쪽 모델 요청 159개 전체에서도 0번). 그래서 Host 도구(`manage_plugins`, `request_litzio_user_input` 등)는 pi 쪽 모델에게 끝까지 보이지 않았다.

### 판정 (미리 정한 기준)

- "pi가 작업을 끝낸다": 과제 1은 3 대 3으로 맞다. **과제 2는 pi 0 대 Copilot CLI 1로 맞지 않다.**
- "pi의 입력 이득이 남는다": 과제 1은 성공한 실행끼리 중앙값 12,667 대 36,093, **35%**로 맞다. 과제 2는 pi 성공이 없어 비교할 수 없다.
- 기준에 따른 결론: **"접을 근거가 있다"**(과제 2의 성공 횟수가 뒤짐).
- 한계: 과제마다 3번뿐이고, 갈린 것은 과제 2의 한 번(0/3 대 1/3)이다. 이 차이는 우연으로도 충분히 생길 크기다. 버린 실행 가운데 Host 허용 폴더가 좁던 환경에서는 거꾸로 pi 1/3, Copilot CLI 0/3이었다(그때 Copilot CLI는 Host 도구 scaffold가 막혀 있었다). 과제 1 후속 턴은 두 엔진 모두 0/3이라 두 엔진을 가르지 못했다.

### 실패의 종류

| 엔진 | 턴 | 종류 | 횟수 |
| --- | --- | --- | ---: |
| 둘 다 | 과제 1 후속 | 질문에서 멈춤: "어떤 문장을 더할지" 되물음. Copilot CLI는 질문 카드(2)·글(1). pi는 질문 카드 도구를 `tool_search` 없이 바로 불러 "없는 도구"로 실패(1~2번)한 뒤 글로 물음(3) | 각 3 |
| Copilot CLI | 과제 2 본 | 도구 인자 형식 오류의 반복: 스킬·scaffold를 쓰지 않고 작업 폴더에 지어낸 SDK 코드를 쓴 뒤, `create_document`에 상대 경로·잘못된 입력(6번), `manage_plugins`에 로컬 폴더를 `source`(GitHub 주소 자리)로·`register`에 없는 키(2~3번) | 2 |
| pi | 과제 2 본 | 도구를 못 찾음: 스킬 글의 `manage_plugins {action:"scaffold",…}`를 PowerShell 명령으로 실행(ParserError, 1~3번). 그 뒤 ① 작업 폴더에 소스를 써서 ID 설치가 "폴더 없음"으로 거절(2번), ② 제작 폴더에 직접 썼으나 설치 검증 오류(화면 import·`host.mjs` 형식) 반복, ③ 설치 시도 없이 끝냄 | 3 |
| 둘 다 | 과제 2 후속 | 그 밖: 소스만 고치고 다시 설치하지 않음(Copilot CLI 2, pi 1), 같은 설치 거절·검증 오류 반복(pi 2) | Copilot CLI 2, pi 3 |

다른 ID로 설치한 경우, 시간 초과는 없었다. 성공한 Copilot CLI 실행은 `litzio-authoring` 스킬 → `manage_plugins scaffold` → 화면 수정 → 설치(컴파일 오류 1번 뒤 성공) 순서였고, 플러그인 이름은 scaffold 기본값("측정값") 그대로였다(성공 기준은 ID와 켜짐·실행만 봄).

### 대화가 길어질 때의 입력

- 요청 하나의 입력은 Copilot CLI가 약 17,800토큰에서 시작해 과제 2에서 21,000~31,600토큰까지, pi는 약 3,800토큰에서 시작해 과제 2에서 16,900~21,100토큰까지 늘었다. pi 쪽 증가의 대부분은 모델이 읽은 `litzio-authoring` 스킬 본문과 도구 결과다. 과제 2의 마지막 요청에서는 pi 요청 하나가 Copilot CLI의 첫 요청 크기에 가까워졌다.
- 과제 2의 누적 입력은 전체 실행 중앙값으로 pi 156,994 대 Copilot CLI 219,218(72%, 참고값. 판정 기준은 성공한 실행끼리라 해당 없음). pi는 모델 호출이 더 많았다(중앙값 11 대 8).
- 후속 턴은 첫 요청부터 앞선 대화 전체가 실린다. 과제 2 후속의 첫 요청은 Copilot CLI 약 21,500, pi 약 14,600토큰.

### 음성 후속 턴 (과제 3, pi만, `gemma4:e4b`)

| 표본 | 턴 | 답(앞부분) | 시간 | 입력 토큰 | 출력 | 요청의 음성 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| ko 1883 (12.5초) | 1 받아쓰기 | "다리미 수직 간격은 15미터이며 공사는 2011년 8월에 마무리되었으며, …2017년 3월까지이다." ("다리 밑"을 "다리미"로) | 3.8초 | 3,704 | 344 | 1개, 798,778바이트 |
| | 2 두 번째 내용 | "공사는 2011년 8월에 마무리되었으며." (맞음) | 1.8초 | 3,779 | 188 | 1개, 같은 바이트 다시 |
| | 3 무관한 질문 | "서울" | 0.7초 | 3,826 | 2 | 1개, 같은 바이트 다시 |
| en 1620 (16.4초) | 1 받아쓰기 | "Now widely available throughout the archipelago, Japanese cuisine …" ("Javanese"를 "Japanese"로, 첫 실험과 같음) | 3.0초 | 3,802 | 283 | 1개, 1,048,378바이트 |
| | 2 두 번째 내용 | "the predominant flavourings the Japanese favour being …" (문장 뒷부분, 그럴듯함) | 1.8초 | 3,868 | 218 | 1개, 같은 바이트 다시 |
| | 3 무관한 질문 | "서울" | 0.7초 | 3,922 | 2 | 1개, 같은 바이트 다시 |

- 음성 바이트는 음성과 무관한 셋째 턴까지 **매 요청 다시 실렸다**(첫 실험에서 본 대로 대화 기록의 표식이 매번 음성으로 바뀐다).
- 그런데 Ollama가 보고한 입력 토큰은 턴마다 약 50~100토큰만 늘었고, 12.5초 음성과 16.4초 음성의 첫 턴 차이도 약 100토큰이었다. 보고값에 음성 몫이 들어가는지, 들어간다면 얼마인지는 확인하지 못했다. 시간은 둘째·셋째 턴이 1.8초·0.7초로 짧았다(Ollama 쪽 캐시로 추정, 미확인).
- 둘째 턴의 답은 첫 턴의 받아쓴 글이 대화에 있어 글만으로도 답할 수 있는 질문이었다. 음성을 다시 들었기 때문에 맞혔는지는 가를 수 없다.

### 참고: 버린 실행 (환경 문제, 판정에 쓰지 않음)

| 묶음 | 과제 1 본 과제 성공 | 과제 2 본 과제 성공 | 비고 |
| --- | --- | --- | --- |
| daemon health 없음 | (돌리지 않음) | Copilot CLI 0/3, pi 0/3 | 두 엔진 모두 `litzio plugins`가 막힘. Copilot CLI의 Host 도구 scaffold도 막힘 |
| Host 허용 폴더 `docs`만 | Copilot CLI 2/3, pi 3/3 | Copilot CLI 0/3, pi 1/3 | Copilot CLI의 한 실패는 PowerShell 치환이 파일 끝에 빈 줄을 더한 것. pi의 성공은 CLI 경로 |
| `fetch failed` | pi 1회 본 과제 성공, 후속 미전송 | - | 실행기 문제 |

### 둘째 실험의 한계

- 모델 하나(`gemma4:e4b`), GPU 하나(VRAM 8 GB), 과제마다 3번. 작은 표본이다.
- 과제 1 후속 글("한 문장을 더해 줘")은 두 엔진 모두 6번 다 되물었다. 과제가 무엇을 쓸지 정하지 않아 생긴 결과로 보이며 엔진을 가르지 못했다.
- 화면에서의 플러그인 동작(버튼을 누르면 수가 오르는지)은 보지 않았다. 판정은 Host 목록과 설치 사본의 글자다.
- Copilot CLI는 이 실험에서 HOME을 임시 폴더로 바꿔 돌렸다. 제품 경로에서는 사용자 홈의 스킬 목록이 함께 실리므로(위 확인), 제품의 Copilot CLI 입력은 이 실험 값보다 크다.
- pi의 실패 원인(Host 도구가 `tool_search` 뒤에 있어 모델에게 보이지 않음, 스킬 글이 `manage_plugins`를 바로 부를 수 있는 도구처럼 적음)은 고치지 않았다. 고친 뒤의 성공률은 모른다.
- 음성 과제의 입력 토큰에 음성 몫이 반영되는지 미확인.

### 추천 (작업자, 판정과 별도)

판정 기준으로는 "접을 근거가 있다"이다. 작업자 추천은 **pi 경로를 지금 정식 구현으로 넘기지 않는다. 확신은 중간.** 이유: 첫 실험의 입력 이득은 단순한 과제(문서 수정)에서는 그대로 남았지만(35%), 리치오 Host 도구를 써야 하는 과제(플러그인 제작)에서는 pi가 한 번도 Host 도구에 닿지 못했다. 작은 모델은 `tool_search`를 스스로 부르지 않았고(pi 쪽 모델 요청 159개 중 0번), 이것은 표본 크기와 상관없이 일관된 관찰이다. 이어 가려면 먼저 "Host 도구를 지연 없이 처음부터 보이게" 한 조건 하나만 바꾼 작은 재실험이 필요하다(그만큼 첫 요청의 입력은 늘어난다).
