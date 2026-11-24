# 2026-11-24 Ollama 공급자의 실행 엔진을 pi(ACP 어댑터)로 바꾸기

- Status: Historical
- Date: 2026-11-24 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — Ollama 공급자의 엔진을 Copilot CLI에서 pi로 바꿀지와, 바꾼다면 제한 권한을 어떤 방식으로 지킬지를 소유자가 정해야 결론이 난다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

Ollama 공급자의 실행 엔진을 Copilot CLI(`copilot --acp`) 대신 pi SDK 기반 ACP 에이전트(`@earendil-works/pi-coding-agent` 1.6.0 + `@openma/pi-acp` 0.1.8)로 바꿀 수 있는지 확인한다. 질문은 넷이다. ① ACP `audio` 블록의 WAV가 Ollama 요청까지 바이트 그대로 가는가, ② "안녕?" 첫 요청의 입력 분량이 지금의 절반(약 9,500토큰) 이하가 되는가, ③ 리치오 Host MCP 도구·권한 요청·취소·재개가 맞물리는가, ④ 붙이는 데 드는 코드·의존성·Windows 실행·번들의 경계는 어디인가. 실행 엔진이 모델의 능력(지금은 음성)을 넘기지 못하는 일과 입력 분량이 같은 뿌리라는 판단에서 시작했다.

결과는 VRAM 8 GB GPU 한 대, `gemma4:e4b`·`qwen3.5:4b`, 가짜 Ollama 서버와 작은 합성 문서로 본 것이다. 모델 품질 평가가 아니다.

## 무엇을 만들었나

- Host의 Ollama 연결이 환경 변수 하나로 `copilot --acp` 대신 띄우는 래퍼(51줄). Host가 이미 넣는 Ollama 주소·모델 변수로 임시 폴더에 pi 설정을 쓰고 pi-acp를 실행한다. 화면·대화 계층은 고치지 않았고 Host는 1줄만 바꿨다.
- pi 확장 둘: 음성을 Ollama `/v1/chat/completions`의 `input_audio`로 싣는 확장(51줄, `input`·`before_provider_request` 공개 훅)과 쓰기·편집·셸 전에 승인을 묻는 확장(10줄).
- 어댑터 패치 2곳(5줄): `promptCapabilities.audio`를 켜고 `audio` 블록을 거절 대신 pi로 넘긴다.
- 요청 본문을 기록하는 가짜 Ollama, 리치오 ACP SDK로 붙는 클라이언트, 실제 리치오 HTTP Host를 격리 폴더로 띄워 시나리오를 보내는 실행기, 분량·토큰 측정기, FLEURS 비교 실행기. 테스트는 추가하지 않았다.

## 결과·관찰

**① 음성 — 조건부(된다).** 수정하지 않은 어댑터는 `audio` 블록을 거절한다(`audio:false`, 변환 시 예외. 코드로 확인). 어댑터 5줄 패치 + 확장으로 합성 WAV 두 개가 가짜 Ollama에 SHA-256까지 같은 바이트로 도착했다. 패치 없이 ACP `resource_link`(WAV 경로)를 보내고 같은 확장이 파일을 읽어 넣는 경로도 같은 바이트로 도착했다. pi 본체는 고치지 않았다. 음성 표식(로컬 경로)이 대화 기록에 남아 다음 요청마다 음성을 다시 싣는다.

**② 입력 분량 — 된다.** 같은 조건(리치오 지시문·스킬·Host MCP 포함, 전체 접근)의 첫 요청:

| 항목 | 지금(Copilot CLI 1.0.114) | pi |
| --- | --- | --- |
| 요청 본문 | 82,047자 | 12,180자 |
| 모델에 보이는 도구 | 36개 | 5개(Host 도구는 `tool_search`로 불러온 뒤 추가) |
| 도구 정의 | 52,422자 | 3,626자 |
| 지시문 | 27,833자 | 7,573자(리치오 지시문 6,068자 포함) |
| 리치오 지시문 횟수 | 1 | 1 |
| 요청하지 않은 추론 값 | `reasoning.effort: medium` 등 | 없음 |
| 입력 토큰 `gemma4:e4b` | 18,685 | 3,991 |
| 입력 토큰 `qwen3.5:4b` | 19,110 | 4,072 |

pi 쪽은 두 가지를 바로잡은 값이다: 프로젝트 신뢰를 켜야 리치오 스킬이 들어가고, 켜면 작업 폴더의 상위로 올라가 사용자 홈의 스킬 목록까지 들어가서 비서 폴더에 빈 `.git`을 두어 막았다. 상위 폴더의 `AGENTS.md` 탐색은 막지 않았다.

**③ 리치오로 돌아오는 통로 — 조건부.** 질문 카드는 가짜 서버와 실모델 둘 다(`qwen3.5:4b` 한 번에, `gemma4:e4b`는 셸 시도·형식 오류 2번 뒤) 리치오 대화에 카드가 생기고 결과가 같은 세션으로 돌아왔다. 문서 도구도 가짜 서버로 동작했고 범위 밖 경로는 Host가 거절했다. 취소와 Host 재시작 뒤 재개(`session/load` 재생)도 됐다. 그러나 pi-acp는 자기 도구에 승인 요청을 보내지 않아, 읽기 전용·열린 폴더 권한에서도 폴더 밖 파일까지 승인 없이 썼다. 승인 확장을 넣으면 리치오 승인 카드가 뜨고 허용·거절이 동작하지만 요청에 종류·경로가 없어 "열린 폴더 안 편집 자동 허용"을 쓸 수 없다.

**④ 유지비.** 따라 들어오는 패키지 124개, 설치 약 129 MB(번들 전, pi-ai가 여러 공급자 SDK를 끌고 옴). 설치 스크립트 2개는 저장소 규칙으로 실행되지 않았고 동작에 문제가 없었다. pi는 Node ≥22.19를 요구하고 이 PC의 Node 24에서 자식 프로세스로 동작했다. Electron 안의 실행은 확인하지 않았다. 셸 도구는 기본이 Git Bash라 리치오 CLI 심(`litzio.cmd`)이 `litzio`로 불리지 않았고, pi의 PowerShell 도구로 바꾸면 동작했다. esbuild 단일 파일(16.7 MB)은 실행되지만 확장 로더가 모듈을 찾지 못해 리치오 확장이 빠지고 음성이 조용히 사라졌다. pi는 환경 변수의 다른 공급자 키도 읽어 모델 목록에 올린다. 사전 조사의 어댑터 버전 0.1.9는 없고 최신은 0.1.8이다.

**실모델 음성(`gemma4:e4b`, `/api/show`에 `audio`, 100% GPU).** Google FLEURS(Hugging Face `google/fleurs`, CC-BY 4.0) 표본 8개 — 한국어 `ko_kr` test id 1883·1929·1701·2000, 영어 `en_us` validation id 1548·1620·1510·1578(영어 test는 데이터셋 뷰어가 크기 한도로 거절해 validation을 씀). 16 kHz 32비트 부동소수 WAV를 변환 없이 보냈다. 받아쓰기 글자 오류율(문장부호·공백 제거 뒤 편집 거리):

| 언어 | Ollama 직접(OpenAI 호환) | Ollama 직접(네이티브) | pi 경유 |
| --- | --- | --- | --- |
| 한국어 | 4.5% | 5.1% | 3.4% |
| 영어 | 4.9% | 3.9% | 3.9% |

내용 질문(주제를 맞게 말하면 맞음)은 직접 8/8, pi 8/8이었다. 두 경로 모두 "Javanese"를 "Japanese"로 들었다. 평균 시간은 받아쓰기 직접 0.4초·pi 7.2초(어댑터 시작·지시문·생각 출력 포함)였다.

**검증하지 않은 것.** 화면(브라우저·Desktop) 표시, Electron 안 실행과 패키징, 리치오 화면의 음성 첨부(지금 Host 첨부는 이미지뿐), 실모델의 승인 카드·문서 도구, 긴 대화·압축, 다른 모델·GPU, Git Bash 없는 Windows, 원격 Ollama 주소. Host가 Ollama `/api/chat`을 직접 부르는 대안은 구현하지 않고 비용만 추정했다(테스트 포함 1,000~2,000줄, 범용 에이전트 능력을 리치오가 계속 유지).

**추천(작업자).** pi 경로를 정식 구현 이슈로 이어갈 가치가 있다(확신 중간). 입력이 약 19,000토큰에서 약 4,000토큰으로 줄고, 음성이 pi 본체 수정 없이 모델까지 가며, Host 도구·질문 카드·취소·재개가 맞물렸다. 먼저 제한 권한을 지키는 방법과 Desktop 실행을 확인하는 작은 단계가 필요하다. 채택 범위 추정(엔진 표·실행 환경 격리·권한·음성 첨부·셸·진단과 계약·패키징)은 원본 기록에 있다.

## 현재 결정과 어긋나는 점

- [비서 계약](../design/main-agent-v1.md)의 "GitHub Copilot과 Ollama는 Copilot CLI의 `copilot --acp`" 엔진 표를 환경 변수로 바꿨다. 진단의 Copilot CLI 실행 안내·버전·업데이트는 pi 경로에 맞지 않는다.
- 같은 계약의 Copilot·Ollama 제한 권한(`allow_all=off`와 공급자 승인 요청)에 대응하는 설정이 pi-acp에는 없다. 승인 확장 없이는 제한 권한이 적용되지 않았다.
- 관련: [ADR-0021](../adr/0021-general-agent-assistant.md)(공급자 방식 권한), [2026-11-23 Ollama 로컬 모델 스파이크](2026-11-23-ollama-local-model.md).

## 결론/후속

- 결론: **미정**.
- 무엇이 정해져야 하나: Ollama 공급자의 엔진을 pi로 바꿀지와, 바꾼다면 제한 권한을 승인 확장·어댑터 수정·리치오 쪽 판정 가운데 어느 방식으로 지킬지.

## 코드 위치

- 태그: [`spike/2026-11-24-ollama-pi-audio`](https://github.com/litzio/litzio/tree/spike/2026-11-24-ollama-pi-audio)
- 브랜치: [`spike/ollama-pi-audio`](https://github.com/litzio/litzio/tree/spike/ollama-pi-audio) (master 대비 커밋 1개)
- 마지막 커밋: [`14fed61f`](https://github.com/litzio/litzio/commit/14fed61feade654d8e330a6f7b1cfb4acf6fe3f0)
- 원본 기록: [`scripts/spike-pi-audio/SPIKE.md`](https://github.com/litzio/litzio/blob/spike/2026-11-24-ollama-pi-audio/scripts/spike-pi-audio/SPIKE.md)

## 스크린샷

없다. 화면은 보지 않았다.
