# 2026-11-24 Ollama 공급자의 Codex 엔진 연결과 음성 전달

- Status: Historical
- Date: 2026-11-24 (KST)
- 결론: **폐기**
- Scope: 가짜 서버와 실제 Ollama의 `gemma4:e4b`를 사용한 스파이크 기록. [스파이크 정책](README.md)을 따른다.

## 목적

리치오가 이미 연결한 Codex app-server를 Ollama 공급자에 재사용할 수 있는지 확인했다. 로그인 없는 연결, 음성 전달, 첫 요청 분량, 질문·문서·권한을 확인 대상으로 삼았다.

## 무엇을 만들었나

기존 Host의 Codex 연결과 대화 동작을 쓰는 실행기, 요청 기록과 도구 호출 응답을 제공하는 가짜 Ollama, pi 스파이크와 같은 방식의 분량 측정기를 만들었다. 첫 요청 측정에 리치오 지시문·스킬 두 개와 Codex 경로의 Host dynamic tools를 사용했다. 전송 자체를 보려고 계정 진단 아래에서 합성 모델 목록 하나로 시작했다.

## 결과·관찰

**① 연결은 된다.** 임시 `CODEX_HOME`의 사용자 정의 Responses 공급자 또는 `model_provider="ollama"`와 `CODEX_OSS_BASE_URL`로 로그인 없이 `POST /v1/responses` 턴을 마쳤다. `app-server` 앞의 `--oss --local-provider ollama`는 실제 실행에서 공급자를 `openai`로 유지했고, 뒤에 붙이면 인자 오류였다. 두 프로세스가 같은 임시 홈에서도 각 공급자로 초기화됐지만 계정용 프로세스에서 Ollama 스레드가 조회됐다. 각자 다른 임시 홈에서도 동시 실행을 확인했다. 사용자의 계정 로그인·설정·세션을 격리하려면 로컬 프로세스에 별도 홈이 필요하다. 계정은 로그인하지 않았다.

**② 음성은 현재 조합에서 안 된다.** 기본 모델 정보에서는 Codex가 음성을 생략했다. `model_catalog_json`의 `input_modalities`에 `audio`를 넣으면 `localAudio`와 `audio` data URL의 WAV 바이트가 `input_audio.audio_url`로 그대로 전달됐다. `audio`의 HTTP URL은 처리 실패로 생략됐고 서버에 WAV GET가 오지 않았다. Ollama 0.40.16의 Responses 파서는 `input_audio`를 거절한다. Chat Completions는 음성을 받지만 Codex 0.172.0의 `wire_api`는 `responses`만 받는다. 주소 접두사를 `/api`로 바꾼 시험도 `/api/responses`로 갔다. [Ollama Responses 파서](https://github.com/ollama/ollama/blob/v0.40.16/openai/responses.go#L104-L171), [Ollama Chat Completions 파서](https://github.com/ollama/ollama/blob/v0.40.16/openai/openai.go#L631-L644), [Codex wire API 소스](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/model-provider-info/src/lib.rs#L104-L114)

**③ 입력 분량은 측정했다.** `안녕?`, 전체 접근, 리치오 지시문·스킬·Host 도구를 포함한 첫 요청이다. 도구 수는 첫 요청에서 모델이 보는 값이며, pi는 Host 도구를 나중에 불러온다. Copilot CLI·pi 수치는 [직전 pi 스파이크](2026-11-24-ollama-pi-audio.md)를 따른다.

| 항목 | Copilot CLI 1.0.114 | pi 1.6.0 + pi-acp 0.1.8 | Codex 0.172.0 |
| --- | ---: | ---: | ---: |
| 요청 본문 | 82,047자 | 12,180자 | 55,363자 |
| 도구 | 36개 | 5개 | 18개 |
| 도구 정의 | 52,422자 | 3,626자 | 28,114자 |
| 시스템·개발자 지시문 | 27,833자 | 7,573자 | 20,386자 |
| 리치오 지시문 | 1회 | 1회 | 1회 |
| 요청하지 않은 추론 값 | `effort: medium`, `summary: auto`, `reasoning.encrypted_content` | 없음 | `summary: auto`, `reasoning.encrypted_content` |
| `gemma4:e4b` 실제 입력 토큰 | 18,685 | 3,991 | 미측정 |
| `qwen3.5:4b` 실제 입력 토큰 | 19,110 | 4,072 | 미측정 |

Codex 측정의 `effort: medium`은 실행기가 선택해 Host가 넘긴 값이다. Host는 `summary: auto`를 붙였고 Codex는 `include: ["reasoning.encrypted_content"]`를 더했다. Windows에서는 임시 홈 환경 변수에도 사용자 홈 스킬 10개가 요청에 섞였다. 임시 설정에서 발견한 경로를 개별적으로 제외한 뒤 위 값을 얻었고, 리치오 스킬 두 개는 남았다.

**④ 리치오 도구와 권한은 가짜 모델에서 된다.** 질문 호출 뒤 대기 중인 카드와 `accepted:true`가 남았다. `read_document`는 열린 폴더 문서의 본문을 돌려줬다. `create_document`는 읽기 전용에서 거절하고 전체 접근에서 파일을 만들었다. 읽기 전용에서 승인 필요 셸 쓰기를 요청하니 승인 카드가 왔고, 거절하면 파일이 생기지 않았다.

**가짜 서버 단계의 범위.** 첫 격리 실행에서 발견한 외부 연결 시도는 로컬 프록시가 차단했다. 관련 플래그를 끈 뒤 이 단계의 모델 요청은 전부 가짜 서버로 갔다.

### 실모델 단계

Codex app-server 0.172.0, Ollama 0.40.16의 `gemma4:e4b`, 전체 접근으로 시험했다. `/api/show`의 `audio`를 확인했다. Codex의 `안녕?` 요청을 재생해 **입력 12,839토큰, 출력 196토큰, 캐시 0**을 얻었다. 활성 문서가 없는 새 실행기의 사전 확인 요청은 입력 12,787토큰이었다. 비교용 Copilot CLI는 18,685, pi는 3,991 입력 토큰이었다.

같은 Google FLEURS 한국어 `ko_kr` test id 1883 WAV를 두 주소에 보냈다. `/v1/responses`의 `input_audio.audio_url`은 **HTTP 400**과 `unknown content type: input_audio`로 끝났다. `/v1/chat/completions`의 `input_audio.data`는 **HTTP 200**, 정답 대비 글자 오류 **0/53**이었다. 문장부호·공백을 제외하는 pi 스파이크 정규화를 썼다. [Google FLEURS (CC BY 4.0)](https://huggingface.co/datasets/google/fleurs)

[pi 둘째 실험](https://github.com/litzio/litzio/blob/spike/2026-11-24-ollama-pi-audio-tasks/scripts/spike-pi-audio/SPIKE.md#둘째-실험-실제-작업을-끝낼-때까지의-비용과-성공률-2026-11-24)의 과제 글과 판정 코드를 그대로 사용했다. 새 격리 Host에 daemon health 응답과 실행 폴더 전체의 허용 범위를 적용했다. 가짜 서버 사전 확인에서 개인 스킬 10개를 경로별로 제외했고 리치오 스킬 두 개를 확인했다. Codex만 문서와 플러그인 과제를 각각 세 번 돌렸고, Copilot CLI와 pi는 기록의 숫자를 사용했다. Codex는 `medium`을 보냈으며 66번의 모델 응답 모두에 생각 출력이 있었다.

각 칸은 **성공 횟수 / 누적 입력 중앙값(성공한 실행) / 모델 호출 중앙값 / 시간 중앙값** 순이다. 호출과 시간은 전체 실행 기준이다.

| 과제 | Copilot CLI | pi | Codex |
| --- | --- | --- | --- |
| 문서 수정 | 3/3 · 36,093 · 2회 · 11.6초 | 3/3 · 12,667 · 3회 · 9.1초 | 0/3 · — · 5회 · 16.5초 |
| 문서 후속 | 0/3 · — · 2회 · 5.3초 | 0/3 · — · 3회 · 9.7초 | 0/3 · — · 2회 · 10.2초 |
| 플러그인 제작 | 1/3 · 219,218 · 8회 · 43.7초 | 0/3 · — · 11회 · 51.6초 | 1/3 · 209,337 · 12회 · 54.8초 |
| 플러그인 후속 | 1/3 · 88,842 · 2회 · 6.4초 | 0/3 · — · 3회 · 12.7초 | 0/3 · — · 3회 · 13.2초 |

문서 수정 실패는 목표 줄 외 변경 두 번과 미수정 한 번이었다. 문서 후속은 글로 되물은 두 번과 뒤쪽 원문을 보존하지 못한 한 번이었다. 플러그인 본 과제는 제작·설치 경로 오류 한 번과 산출물 스키마 검증 실패 한 번이었다. 후속은 소스 쓰기 실패, 재설치 검증 실패, 지원되지 않는 편집 도구 호출이 한 번씩이었다. 설치에 성공한 한 번은 활성·실행 기준을 충족했지만 설치 사본에 요청한 첫 버튼 문구 `누르기`가 없었다. 제외하거나 다시 돌린 과제 실행은 없다.

**사전 기준 판정은 접을 근거가 있다.** Codex는 문서 수정 성공이 Copilot CLI보다 적었고(0 대 3), 성공한 플러그인 제작의 누적 입력은 Copilot CLI의 **95.5%**로 기준인 70%를 넘었다. 문서 수정은 Codex 성공 표본이 없어 성공끼리 토큰을 비교할 수 없다.

**검증 범위.** 한 모델·한 PC에서 과제당 세 번, 음성 표본 한 개를 확인했다. 모델에 따른 차이, 생각 강도 단계의 의미, 실제 화면 버튼 작동, 로그인된 계정과의 동시 추론과 재시작 뒤 대화 재개는 미확인이다.

## 현재 결정과 어긋나는 점

- [비서 계약](../design/main-agent-v1.md)의 Ollama 엔진은 Copilot CLI다. 스파이크는 Codex를 직접 시작해 기존 계정 진단 아래에서 합성 모델 목록을 주입했다.
- [ADR-0014](../adr/0014-main-agent-app-server.md)가 정한 계정용 Codex 홈 재사용과 달리, 스파이크는 로컬 실행을 임시 홈으로 격리했다.

## 결론/후속

**폐기**. Ollama 공급자의 실행 엔진은 Copilot CLI를 유지한다. Codex는 문서 수정에 세 번 모두 실패했고(0/3), 플러그인 제작의 누적 입력은 Copilot CLI의 95.5%여서 미리 정한 기준에 미치지 못했다. Ollama의 `/v1/responses`는 `input_audio`를 거절했다. 음성은 지금 도입하지 않는다.

### 나중에 꺼내 쓸 것

음성이 필요해지면 실행 엔진을 유지하고 Host가 Ollama의 `/v1/chat/completions`에 음성 파일을 직접 보낼 수 있다. `input_audio`의 `data`에는 base64로 인코딩한 데이터를, `format`에는 `wav`를 넣는다. 실모델 단계에서 이 요청으로 `gemma4:e4b`가 한국어 FLEURS 표본 하나를 글자 오류 없이 받아썼다. Host가 전사문을 비서에게 도구 결과로 돌려주는 도구는 구현하지 않았고, 비서가 이를 골라 쓰는지도 확인하지 않았다.

Ollama의 `/v1/responses`가 음성 입력을 지원하면 Codex 경로에서는 모델 카탈로그에 `audio`를 추가하는 설정만으로 음성을 전달할 수 있다. Copilot CLI가 ACP에서 `audio`를 지원하게 될 때도 음성 전달을 다시 검토한다. pi 재검토 조건은 [pi 스파이크의 후속 기록](2026-11-24-ollama-pi-audio.md#나중에-꺼내-쓸-것)에 있다.

## 코드 위치

- 태그 [`spike/2026-11-24-ollama-codex-audio`](https://github.com/litzio/litzio/tree/spike/2026-11-24-ollama-codex-audio)
- 브랜치 [`spike/ollama-codex-audio`](https://github.com/litzio/litzio/tree/spike/ollama-codex-audio)
- 실모델 단계 태그 [`spike/2026-11-24-ollama-codex-audio-tasks`](https://github.com/litzio/litzio/tree/spike/2026-11-24-ollama-codex-audio-tasks)
- 마지막 커밋 [`9583945d`](https://github.com/litzio/litzio/commit/9583945d73fe8e0cd0c0a8c006893a1efee1a96b)
- 원본 기록 [`scripts/spike-codex-audio/SPIKE.md`](https://github.com/litzio/litzio/blob/spike/2026-11-24-ollama-codex-audio-tasks/scripts/spike-codex-audio/SPIKE.md)

## 스크린샷

없음.
