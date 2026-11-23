# 2026-11-23 비서의 두 연결 뒤 모델을 Ollama 로컬 모델로 바꾸기

- Status: Historical
- Date: 2026-11-23 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 로컬 모델 지원을 제품에 넣을지와, 넣는다면 Codex 로컬 모드에서 사용자 설정의 앱 커넥터·메모리를 실행 인자로 끄는 것을 받아들일지를 소유자가 정해야 결론이 난다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

리치오 비서가 지금 쓰는 두 연결(Codex app-server, Copilot `--acp`)을 그대로 둔 채, 그 뒤의 모델만 같은 PC의 Ollama 로컬 모델로 바꾸면 비서가 동작하는지, 동작한다면 정식 구현의 최소 변경은 무엇인지 확인한다. 리치오가 Ollama를 직접 부르는 새 공급자는 범위 밖이다.

모든 결과는 작은 합성 문서, VRAM 8GB GPU 한 대, `qwen3.5:4b` 한 모델(64k 컨텍스트 파생 모델)로만 본 것이다. 모델 품질 평가가 아니다.

## 무엇을 만들었나

- 환경 변수 `LITZIO_SPIKE_OLLAMA_MODEL` 하나로 두 연결을 Ollama로 돌리는 스위치. Codex는 `codex app-server` 실행 인자(`-c` 로컬 Responses 프로바이더, `model_context_window`, `--disable apps --disable memories`)만, Copilot은 프로세스 환경 변수(`COPILOT_PROVIDER_*`, `COPILOT_MODEL`, `COPILOT_OFFLINE=true`)만 더한다. 사용자 홈의 Codex·Copilot 설정 파일은 바꾸지 않았다.
- Codex 모델 목록을 로컬 모델 하나로 바꾸고, Codex 전송 전 계정 필수 검사를 스위치가 켜졌을 때 건너뛰었다.
- 빌드된 CLI의 `daemon run`으로 격리 Host를 띄워 한국어 과제 세 개(문서 질문, 기존 문서 수정 뒤 `litzio check`, 새 문서 만들기 뒤 `litzio check`)를 보내는 실행기. 테스트는 추가하지 않았다.

## 결과·관찰

**컨텍스트.** 요청별 `num_ctx`로 16k·32k·64k 모두 100% GPU에 들어갔다(64k에서 모델 적재 5.2 GB). 생성 속도는 약 121~123 tok/s로 컨텍스트와 무관했다. 64k에서 약 16,800 토큰 입력의 prefill은 3.3초였다. Ollama의 OpenAI 호환 `/v1` 경로에는 요청별 컨텍스트가 없어 `PARAMETER num_ctx`를 둔 파생 모델을 썼다.

**Codex 단독.**

- 로컬 프로바이더 설정은 실행 인자만으로 된다. 내장 이름 `-c model_provider="ollama"`만으로도 동작했다.
- `model/list`는 로컬 모델을 주지 않고 번들 OpenAI 카탈로그를 돌려준다. `account/read`는 `account: null`, `requiresOpenaiAuth: false`. 빈 임시 Codex 홈(로그인 없음)에서도 대화·셸이 됐다. 기존 ChatGPT 로그인이 있으면 계정 한도 조회는 그 계정 값을 계속 돌려준다.
- 사용자 홈 설정 그대로는 첫 턴이 실패했다. 요청이 178,774 토큰(도구 정의 717 KB, 대부분 사용자 계정의 ChatGPT 앱 커넥터)이고 메모리 지시문 50 KB가 더해져 64k를 넘었다. `--disable apps --disable memories`만으로 약 8,000 토큰이 되어 성공했다.
- 모델 메타데이터가 없어 컨텍스트 창을 258,400으로 가정한다. `model_context_window`를 실제 값으로 줘야 한다.
- 세 권한 모드(`readOnly`·`workspaceWrite`·`dangerFullAccess`)의 샌드박스는 모델과 무관하게 동작했다. 읽기 전용은 쓰기를 거절했고, 나머지 둘은 셸로 파일 수정에 성공했다.

**Copilot 단독.**

- 환경 변수만으로 붙는다. 세션 모델 목록에 `auto`와 로컬 모델이 나오고 현재 모델은 로컬 모델이다. Agent·Plan 모드와 `allow_all` 설정이 그대로 있다.
- 컨텍스트 한도는 기본 128,000으로 보고하며 `COPILOT_PROVIDER_MAX_PROMPT_TOKENS`로 맞춘다.
- 빈 임시 Copilot 홈(로그인 없음)에서 `COPILOT_OFFLINE=true`와 아닐 때 모두 동작했다. 오프라인이면 GitHub MCP·웹 도구가 빠져 도구가 25개에서 18개로 준다.
- `allow_all=off` 편집은 승인 요청을 보내고, 거절하면 수정하지 않았다. `allow_all=on`은 요청 없이 수정했다. 읽기 셸 명령은 승인 요청 없이 실행됐고 쓰기 셸의 단독 승인은 관찰하지 못했다.

**리치오 비서 경유 (과제당 1회).**

| 경로 | 권한 | 문서 질문 | 기존 문서 수정 | 새 문서 |
| --- | --- | --- | --- | --- |
| Codex | 전체 접근 | 통과 | 통과 | 통과(도구 입력 형식 8회 오류 뒤) |
| Copilot | 전체 접근 | 실패(모델 판단) | 통과 | 통과 |
| Codex | 열린 폴더 | 통과 | 셸 쓰기 승인 카드에서 멈춤 | 통과 |
| Copilot | 열린 폴더 | 통과 | 파일 수정 뒤 `litzio check` 승인 카드에서 멈춤 | 생성 뒤 `litzio check` 승인 카드에서 멈춤 |

- 연결 문제는 없었다. 모델 목록·진단·전송·턴 완료·승인 카드·리치오 Host 도구(Codex dynamic tools, Copilot HTTP MCP)가 모두 동작했다. 승인 카드에서 멈춘 것은 제한 권한의 정상 동작이며 실행기가 승인에 답하지 않기 때문이다.
- 실패는 모두 모델 쪽으로 가를 수 있었다. Copilot 문서 질문은 도구 결과(“B 라인 | 이상: 컨베이어 소음”)가 모델 입력에 그대로 들어갔는데 “이상 없음”으로 답했다. Codex 새 문서의 오류는 스키마가 온전히 전달됐는데 모델이 허용되지 않은 필드·없는 명령을 보냈다. 그래서 `qwen3.5:9b`로 다시 가르지 않았다.
- 작은 모델은 지시문의 도구 이름(`read_document`)을 그대로 불러, Copilot MCP 이름(`litzio_host-read_document`)과 달라 실패한 적이 있다.

**검증하지 않은 것.** 긴 문서·여러 파일·긴 대화·자동 압축, 다른 모델·GPU, 화면(브라우저·Desktop) 표시, 추론 강도가 로컬 모델에서 갖는 뜻, 오프라인 Copilot에서 `auto` 선택, 대화 재개·이미지 첨부·질문 카드, 원격 Host의 Ollama 주소.

**최소 변경 추천(작업자).**

1. 주소·모델 이름은 Host가 소유한다. 공급자 프로세스와 Ollama 요청이 모두 대상 Host에서 일어난다. 주소는 대상 Host의 비서 설정에 두고 바뀌면 그 공급자 프로세스를 다시 띄운다. 모델 이름은 기존 대화별 모델 선택에 합친다.
2. 공급자 선택은 그대로 두고 공급자 안에 "모델 출처: 계정 / 로컬 Ollama"와 주소 칸을 더한다. 로컬이면 모델 목록을 Ollama에서 채운다.
3. 달라지는 항목: Codex 모델 목록 대체, 컨텍스트 값 전달(Codex `model_context_window`, Copilot 최대 입력 토큰), Codex 로컬 모드의 앱 커넥터·메모리 끄기, Codex 계정 필수 검사를 `requiresOpenaiAuth`로 판정, 계정 사용량 숨김, Copilot `auto` 숨김(미확인), 추론 강도는 확인 전까지 숨김. 권한 모드는 바꿀 것 없음.
4. 먼저 할 쪽은 Copilot을 추천한다. 환경 변수만으로 붙고 모델 목록이 자동으로 나오며 로그인 검사·계정 사용량·카탈로그 대체가 필요 없다. Codex는 네 가지가 더 필요하다.

## 현재 결정과 어긋나는 점

- [ADR-0014](../adr/0014-main-agent-app-server.md) 결정 2(기존 Codex 로그인·설정 재사용): 홈 설정 파일은 그대로 쓰지만, 실행 인자로 사용자 설정의 앱 커넥터·메모리를 끄고 모델 프로바이더를 바꿨다. 로그인 없는 동작 확인에는 단독 시험에서만 빈 임시 Codex 홈을 썼다.
- [비서 계약](../design/main-agent-v1.md)의 “Codex는 계정이 없으면 전송 거절”을 스위치가 켜졌을 때 건너뛴다. 계약의 설정 항목에 없는 주소·컨텍스트 값을 환경 변수로 넣었다.

## 결론/후속

- 결론: **미정**.
- 무엇이 정해져야 하나: 로컬 모델 지원을 제품에 넣을지와, 넣는다면 Codex 로컬 모드에서 사용자 설정의 앱 커넥터·메모리를 실행 인자로 끄는 것을 받아들일지.
- 관련 문서: [ADR-0014](../adr/0014-main-agent-app-server.md), [ADR-0021](../adr/0021-general-agent-assistant.md), [비서 계약](../design/main-agent-v1.md), [2026-10-28 Codex app-server 스파이크](2026-10-28-codex-ai.md)

## 코드 위치

- 태그: [`spike/2026-11-23-ollama-local-model`](https://github.com/litzio/litzio/tree/spike/2026-11-23-ollama-local-model)
- 브랜치: [`spike/ollama-local-model`](https://github.com/litzio/litzio/tree/spike/ollama-local-model) (master 대비 커밋 1개)
- 마지막 커밋: [`6f60b69c`](https://github.com/litzio/litzio/commit/6f60b69c3478a7d7117a9c269aad8393f0884add)
- 원본 기록: [`scripts/spike-ollama/SPIKE.md`](https://github.com/litzio/litzio/blob/spike/2026-11-23-ollama-local-model/scripts/spike-ollama/SPIKE.md)

## 스크린샷

없다. 화면은 보지 않았다.
