# 스파이크: 비서의 두 연결 뒤 모델을 Ollama 로컬 모델로 바꾸기

- 브랜치: `spike/ollama-local-model` (master에 병합하지 않는다)
- 범위: 작은 합성 문서, VRAM 8GB GPU 한 대, `qwen3.5:4b` 한 모델로만 본 결과다. 모델 품질 평가가 아니다.

## 확인하려던 질문

리치오 비서가 지금 쓰는 두 연결(Codex app-server, Copilot `--acp`)을 그대로 둔 채 그 뒤의 모델만 같은 PC의 Ollama 로컬 모델로 바꾸면 비서가 동작하는가? 동작한다면 정식 구현에 필요한 최소 변경은 무엇인가?

리치오가 Ollama를 직접 부르는 새 공급자(자체 에이전트 루프)는 범위 밖이며 만들지 않았다.

## 만든 것

- `apps/editor/server/provider-connections.ts`: 환경 변수 `LITZIO_SPIKE_OLLAMA_MODEL` 하나로 두 연결을 Ollama로 돌린다(`LITZIO_SPIKE_OLLAMA_URL`은 선택, 기본 `http://localhost:11434/v1`).
  - Codex: `codex app-server`에 실행 인자만 더한다. `-c model_provider=...`, `model_providers.<이름>.base_url`, `wire_api="responses"`, `model_context_window=65536`, `--disable apps --disable memories`. 사용자 홈의 Codex 설정 파일은 바꾸지 않는다.
  - Codex 모델 목록: `model/list`가 로컬 모델을 주지 않으므로 로컬 모델 하나로 바꿔 돌려준다.
  - Copilot: 프로세스 환경 변수만 더한다. `COPILOT_PROVIDER_BASE_URL`, `COPILOT_PROVIDER_API_KEY=`(빈 값), `COPILOT_PROVIDER_WIRE_API=responses`, `COPILOT_MODEL`, `COPILOT_OFFLINE=true`, `COPILOT_PROVIDER_MAX_PROMPT_TOKENS=61440`.
- `apps/editor/server/assistant-host.ts`: Codex 전송 전의 "계정 없음이면 거절" 검사를 스위치가 켜졌을 때만 건너뛴다(로컬 프로바이더는 `account: null`, `requiresOpenaiAuth: false`를 돌려준다).
- `scripts/spike-ollama/run.mjs`: 빌드된 CLI의 `daemon run`으로 격리 Host(임시 데이터·비서 작업 폴더·설정)를 띄우고, 기존 HTTP 대화 route로 한국어 과제 세 개를 보낸 뒤 파일과 `litzio check`로 판정한다. 승인 카드에는 답하지 않는다.

## 실행 방법

```bash
pnpm install --frozen-lockfile
pnpm --filter @litzio/cli build
# 64k 컨텍스트 파생 모델 (요청별 num_ctx는 /v1 경로에서 줄 수 없다)
printf 'FROM qwen3.5:4b\nPARAMETER num_ctx 65536\n' > Modelfile
ollama create spike-qwen35-4b-64k -f Modelfile
LITZIO_SPIKE_OLLAMA_MODEL=spike-qwen35-4b-64k pnpm exec tsx scripts/spike-ollama/run.mjs codex full-access
LITZIO_SPIKE_OLLAMA_MODEL=spike-qwen35-4b-64k pnpm exec tsx scripts/spike-ollama/run.mjs copilot opened-folders
```

단계 2·3의 단독 확인은 저장소 밖의 임시 스크립트로 `codex app-server`와 `copilot --acp`를 직접 띄워 했다(같은 실행 인자·환경 변수). 요청 내용 확인에는 Ollama 앞에 요청 본문을 기록하는 임시 중계기를 두었다.

환경: Ollama 0.40.16, codex-cli 0.171.0, GitHub Copilot CLI 1.0.114, VRAM 8GB GPU.

## 결과

### 1. 컨텍스트 (qwen3.5:4b, 요청별 `num_ctx`)

| 컨텍스트 | PROCESSOR | 모델 적재 크기 | GPU 메모리 사용(다른 앱 포함) | 생성 속도 |
| --- | --- | --- | --- | ---: |
| 4096 (기본) | 100% GPU | 3.1 GB | 4,758 MiB | - |
| 16,384 | 100% GPU | 3.7 GB | 5,240 MiB | 122.4 tok/s |
| 32,768 | 100% GPU | 4.1 GB | 5,678 MiB | 121.1 tok/s |
| 65,536 | 100% GPU | 5.2 GB | 6,734 MiB | 122.8 tok/s |

- 64k에서 약 16,800 토큰 입력의 prefill은 3.3초(약 5,080 tok/s), 이어진 생성은 111 tok/s였다.
- 이후 단계는 `PARAMETER num_ctx 65536`을 둔 파생 모델로 했다. OpenAI 호환 `/v1` 경로에는 요청별 컨텍스트 옵션이 없으므로 파생 모델 또는 서버 환경 변수(`OLLAMA_CONTEXT_LENGTH`, 서버 재시작 필요)가 필요하다. 서버는 재시작하지 않았다.

### 2. Codex 단독 (`codex app-server` + 로컬 프로바이더)

| 항목 | 결과 | 판정 |
| --- | --- | --- |
| 초기화 | 됨 | - |
| `model/list` | 로컬 모델이 없고 번들 OpenAI 카탈로그만 돌려준다 | Codex 동작. 목록은 Host가 따로 만들어야 한다 |
| `account/read` | `account: null`, `requiresOpenaiAuth: false` | 로그인 불필요 |
| `account/rateLimits/read` | 기존 ChatGPT 로그인이 있으면 그 계정의 한도를 돌려준다. 빈 임시 Codex 홈에서는 인증 필요 오류 | 로컬 모델에는 무의미한 값 |
| 사용자 홈 설정 그대로 첫 턴 | 실패. 요청 178,774 토큰(본문 788 KB, 도구 정의 717 KB)이 64k를 넘어 5회 재연결 뒤 턴 실패 | 연결은 정상. 사용자 계정의 ChatGPT 앱 커넥터 도구 정의와 메모리 지시문이 원인 |
| `--disable apps --disable memories` | 요청 84 KB·약 8,000 토큰, 턴 성공 | 이 두 개만 끄면 64k에 들어간다 |
| 빈 임시 Codex 홈(로그인 없음) | 대화·셸 성공 | 로그인 없이 동작. 사용자 로그인 상태는 바꾸지 않았다 |
| 내장 프로바이더 이름 `ollama` | `-c model_provider="ollama"`만으로도 동작 | - |
| 모델 메타데이터 | "metadata not found, fallback" 경고. 컨텍스트 창을 258,400으로 가정 | `model_context_window`를 실제 값으로 줘야 사용량·압축이 맞다 |
| 읽기 전용(`readOnly`) | 셸 읽기 성공, 파일 쓰기는 샌드박스가 거절. 파일 변경 없음 | 권한 모드는 모델과 무관하게 동작 |
| 열린 폴더(`workspaceWrite`) | 셸로 파일에 줄 추가 성공. 모델이 "라인"을 "라선"으로 잘못 씀 | 동작. 오타는 모델 |
| 전체 접근(`dangerFullAccess`) | 셸·파일 수정 성공 | 동작 |

제한 샌드박스의 PowerShell 프로필 ConstrainedLanguage 오류 출력은 클라우드 모델에서도 나는 기존 현상이며(비서 계약 4번) 로컬 모델과 무관하다.

### 3. Copilot 단독 (`copilot --acp` + 환경 변수)

| 항목 | 결과 | 판정 |
| --- | --- | --- |
| 초기화·세션 | 됨. 세션 모델 목록은 `auto`와 로컬 모델, 현재 모델은 로컬 모델 | 모델 목록이 자동으로 나온다 |
| 모드·설정 | Agent·Plan·Autopilot, `allow_all` 설정 있음 | 기존 리치오 매핑 그대로 쓸 수 있다 |
| 컨텍스트 표시 | 기본 128,000으로 보고. `COPILOT_PROVIDER_MAX_PROMPT_TOKENS`를 주면 그 값 | 한도 변수 필요 |
| 대화 한 턴 | 성공(약 14,700 토큰). 한국어 질문에 영어로 답함 | 언어는 모델 |
| `COPILOT_OFFLINE=true` | 도구 18개, 약 13,400 토큰 | GitHub MCP·웹 도구가 빠진다 |
| 오프라인 아님 | 도구 25개(GitHub MCP·웹 가져오기·코드 검색 포함), 약 14,700 토큰 | 둘 다 동작 |
| 빈 임시 Copilot 홈(로그인 없음) | 오프라인·온라인 모두 대화·셸 성공 | GitHub 로그인 없이 동작 |
| `allow_all=off` 편집 | 승인 요청(allow_once/allow_always/reject_once). 거절하면 수정 안 됨, 허용하면 수정 | 동작 |
| `allow_all=on` 편집 | 승인 요청 없이 수정 | 동작 |
| `allow_all=off` 셸 | 이번 시험의 읽기 명령은 승인 요청 없이 실행 | 쓰기 셸 명령의 단독 승인은 관찰하지 못함 |

Copilot 클라우드 모델 호출은 하지 않았다.

### 4. 리치오 비서 경유 (격리 Host, 한국어 과제 세 개)

과제: ① 문서 내용 질문(B 라인 이상 내용 답하기), ② 기존 문서의 작은 수정 뒤 `litzio check`, ③ 새 문서 만들기 뒤 `litzio check`. 합성 문서 한 장.

| 경로 | 권한 | ① 질문 | ② 수정 | ③ 새 문서 |
| --- | --- | --- | --- | --- |
| Codex | 전체 접근 | 통과 13.5초 | 통과 22.6초(셸로 파일 다시 쓰기 + `litzio check`) | 통과 41.1초(`create_document` 입력 형식 8회 오류 뒤 성공) |
| Copilot | 전체 접근 | **실패** 14.1초("이상 없음"으로 답함) | 통과 22.4초(Copilot 편집 + `litzio check`) | 통과 27.4초 |
| Codex | 열린 폴더 | 통과 10.4초(답이 어수선함) | 셸 쓰기 승인 카드에서 멈춤 | 통과 21.5초 |
| Copilot | 열린 폴더 | 통과 20.1초(도구 이름 오류 뒤 셸로 읽음) | 파일 수정됨, `litzio check` 셸 승인 카드에서 멈춤 | 문서 생성됨, `litzio check` 셸 승인 카드에서 멈춤 |

실패 지점 판정:

- 연결: 두 경로 모두 문제 없음. 모델 목록·진단·전송·턴 완료·승인 카드·리치오 Host 도구(Codex dynamic tools, Copilot HTTP MCP)가 모두 동작했다.
- Copilot ① 실패: 중계기 기록에서 `read_document` 결과(“B 라인 | 이상: 컨베이어 소음”)가 모델 입력에 그대로 들어간 것을 확인했다. **모델 판단**.
- Codex ③의 8회 오류: 도구 스키마가 모델 요청에 온전히 들어 있었고, 모델이 허용되지 않은 필드(`language`)·없는 명령(`insert-paragraph`)·잘못된 블록 형식을 보냈다. **도구 호출 형식(모델 쪽)**.
- Copilot 열린 폴더의 도구 이름 오류: 모델이 `litzio_host-read_document` 대신 지시문에 적힌 이름 `read_document`를 불렀다. **모델 + 지시문과 MCP 도구 이름의 차이**.
- 승인 카드에서 멈춘 것은 제한 권한의 정상 동작이며 실행기가 승인에 답하지 않기 때문이다.

연결 문제와 모델 약점을 모두 가를 수 있었으므로 `qwen3.5:9b`는 내려받지 않았다.

## 검증하지 않은 것과 한계

- 작은 합성 문서 한 장, 과제 세 개, 과제당 1회다. 긴 문서·여러 파일·긴 대화·자동 압축은 보지 않았다.
- VRAM 8GB GPU의 4B 모델 하나만 봤다. 다른 모델·GPU·CPU 실행, 64k를 넘는 컨텍스트는 보지 않았다.
- 화면(브라우저·Desktop)은 보지 않았다. 모델 선택·사용량·오류 표시가 화면에 어떻게 보이는지는 미확인이다.
- 추론 강도가 Ollama 모델에서 실제로 무엇을 바꾸는지 확인하지 않았다(Codex는 `low`, Copilot은 `medium`만 썼다).
- Codex 앱 커넥터 도구가 클라우드 모델에서는 어떻게 줄어드는지(지연 로딩 여부)는 확인하지 않았다.
- Copilot `auto` 모델을 오프라인에서 골랐을 때의 동작은 보지 않았다.
- 대화 재개·Host 재시작 뒤 이어 가기, 이미지 첨부, 질문 카드(`request_litzio_user_input`)는 보지 않았다.
- 원격 Host(다른 PC의 Ollama 주소)는 보지 않았다.

## 현재 결정과 어긋나는 점

- [ADR-0014](../../docs/adr/0014-main-agent-app-server.md) 결정 2(기존 Codex 로그인·설정을 재사용): 스파이크는 홈 설정 파일을 건드리지 않지만, 실행 인자로 사용자 설정의 앱 커넥터·메모리 기능을 끄고 모델 프로바이더를 바꾼다. 로그인 없는 동작 확인에는 단독 시험에서만 빈 임시 Codex 홈을 썼다(리치오 경유 시험은 기존 홈 사용).
- [비서 계약](../../docs/design/main-agent-v1.md)의 Host 동작(“Codex는 계정이 없으면 전송 거절”)을 스위치가 켜졌을 때 건너뛴다.
- 비서 계약의 설정 항목(공급자·현재 카탈로그 모델·추론 강도·기본 언어·권한)에 없는 주소·컨텍스트 값을 환경 변수로 넣었다.

## 추천 결론

두 연결을 그대로 두고 모델만 Ollama로 바꾸는 방식은 **동작한다**. 결론은 소유자가 정한다. 정식 구현에 필요한 최소 변경 추천:

1. **주소·모델 이름의 소유자: Host.** 공급자 프로세스와 Ollama 요청이 모두 대상 Host에서 일어나고 `localhost`도 Host 기준이다. 주소는 대상 Host의 비서 설정에 두고(앱·대화가 아님), 프로세스 실행 인자·환경이라 바뀌면 그 공급자 프로세스를 다시 띄운다. 모델 이름은 기존 대화별 모델 선택에 합친다(Codex는 턴마다 모델을 보내고, Copilot은 세션 설정으로 바꾼다).
2. **선택 화면:** 공급자(Codex·Copilot) 선택은 그대로 두고, 공급자 안에 "모델 출처: 계정 / 로컬 Ollama"와 주소 칸 하나를 더한다. 모델 목록은 로컬일 때 Ollama의 모델 목록에서 채운다.
3. **뜻이 달라지거나 없는 항목:**
   - 모델 목록: Codex는 Host가 Ollama에서 받아 대체해야 한다. Copilot은 세션 목록에 로컬 모델이 나오지만 `auto`는 GitHub 라우팅이라 로컬 모드에서는 숨기는 것이 맞아 보인다(미확인).
   - 컨텍스트: Ollama의 `/v1`에는 요청별 컨텍스트가 없다. 모델별 `num_ctx`(파생 모델) 또는 Ollama 서버 설정이 필요하고, 그 값을 Codex `model_context_window`·Copilot `COPILOT_PROVIDER_MAX_PROMPT_TOKENS`로 넘겨야 사용량 표시가 맞는다.
   - Codex 요청 크기: 사용자 계정의 앱 커넥터·메모리가 켜져 있으면 로컬 컨텍스트를 넘는다. 로컬 모드에서는 `--disable apps --disable memories`를 실행 인자로 주는 것이 최소다(ADR-0014 결정 2와 맞춰 소유자 확인 필요).
   - 로그인 검사: Codex 전송 전 계정 필수 검사를 `account/read`의 `requiresOpenaiAuth`로 판정하도록 바꾼다.
   - 사용량: Codex 계정 한도 표시는 로컬 모델에 무의미하다(로그인이 있으면 ChatGPT 계정 한도가 계속 보인다). 로컬 모드에서는 숨기고 컨텍스트 사용량만 둔다.
   - 권한 모드: 공급자 쪽 샌드박스·승인은 모델과 무관하게 그대로 동작했다. 바꿀 것 없음.
   - 추론 강도: 로컬 모델에서의 뜻은 미확인이다. 정식 구현 전에 확인하거나 로컬 모드에서는 숨긴다.
4. **먼저 할 쪽: Copilot.** 환경 변수만으로 붙고, 모델 목록이 세션에 자동으로 나오며, 로그인 검사·계정 사용량·카탈로그 대체가 필요 없고, 컨텍스트 한도 변수와 오프라인 모드가 있다. Codex는 위의 목록 대체·로그인 검사·사용량·기능 끄기 네 가지가 더 필요하다. 다만 이번 4B 시험의 과제 통과는 Codex 쪽이 조금 나았고, 이는 과제당 1회라 차이로 보기 어렵다.

## 범위 밖 발견

- 비서 지시문은 도구를 `read_document`·`create_document`로 부르지만 Copilot MCP에서는 `litzio_host-` 접두사가 붙는다. 작은 모델은 지시문의 이름을 그대로 불러 실패했다.
- 사용자 계정의 앱 커넥터 도구 정의가 Codex 요청에 약 70만 바이트로 실린다(로컬 모델의 fallback 메타데이터에서 관찰). 클라우드 모델에서의 처리는 확인하지 않았다.
