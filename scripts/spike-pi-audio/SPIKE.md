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
