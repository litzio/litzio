# Ollama 공급자의 Codex 엔진 연결과 음성 전달

- 날짜 2026-11-24 KST
- 브랜치 `spike/ollama-codex-audio`
- 기준 master `582663ce`
- 결론 **미정**

## 확인하려던 질문

Codex app-server 0.172.0을 Ollama 공급자의 엔진으로 쓸 수 있는가. 로그인 없는 연결과 음성 전달, 첫 요청 분량, 리치오 도구와 권한 처리를 가짜 서버로 확인했다.

## 만든 것

- `probe.ts`는 기존 `CodexAppServer`, `ProviderConnections`, `AssistantConversations`, 플러그인 서비스와 실제 도구 정의를 쓴다. 사용자 데이터 없이 임시 설정과 합성 WAV·문서를 만들고, 설정별 app-server를 시작해 종료한다.
- `fake-ollama.mjs`는 pi 스파이크의 Responses SSE를 재사용해 요청을 기록하고 질문·문서·승인 호출에 답한다. 외부 주소를 향한 HTTP 프록시 요청은 기록하고 차단한다.
- `measure.py`는 pi 스파이크와 같은 방식으로 요청 본문·도구·지시문의 분량을 센다. 본문은 JSON 재직렬화 기준이며 수신한 원문 글자 수도 별도로 표시한다.

## 실행 방법

Windows PowerShell에서 다음을 실행한다. 계정 키는 필요 없다. 두 번째 실행에 쓰는 외부 파일은 태그에 고정된 공개 Codex 모델 메타데이터이며 임시 폴더에만 저장한다. 실행기는 모델과 음성 요청을 모두 임의의 loopback 포트로 보낸다.

```powershell
pnpm install --frozen-lockfile
pnpm exec tsx scripts/spike-codex-audio/probe.ts --smoke
$catalog = Join-Path ([IO.Path]::GetTempPath()) 'litzio-spike-codex-models-0172.json'
Invoke-WebRequest 'https://raw.githubusercontent.com/openai/codex/rust-v0.172.0/codex-rs/models-manager/models.json' -OutFile $catalog
pnpm exec tsx scripts/spike-codex-audio/probe.ts --catalog $catalog
python scripts/spike-codex-audio/measure.py '<workspace 출력의 logPath>' 2
```

## 결과

### 연결은 된다

- 임시 `CODEX_HOME/config.toml`에서 `model_provider="spike"`, `[model_providers.spike]`의 `base_url="http://127.0.0.1:<port>/v1"`, `wire_api="responses"`, `requires_openai_auth=false`를 줬다. `account/read`의 `account:null`, `requiresOpenaiAuth:false` 상태로 첫 턴을 마쳤다.
- 내장 공급자도 `codex app-server -c 'model_provider="ollama"'`와 `CODEX_OSS_BASE_URL=http://127.0.0.1:<port>/v1`로 같은 결과를 냈다. 기본 포트를 바꾸는 `CODEX_OSS_PORT`는 소스에서 확인했다. 이 환경에서는 `--oss --local-provider ollama app-server`의 공급자가 `openai`였고, `app-server` 뒤에 같은 옵션을 붙이면 인자 오류였다. [Codex 공급자 소스](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/model-provider-info/src/lib.rs)
- 본문은 `model`, `instructions`, `input[]`, `tools[]`, `stream:true` 등을 갖는 Responses 형식이다. 주소 접두사를 `/api`로 바꾸면 `/api/responses`를 보냈다. `wire_api="chat"`와 `"ollama"`는 시작 설정에서 거절됐다. 해당 버전의 wire API 열거값은 `responses` 하나다. [Codex wire API 소스](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/model-provider-info/src/lib.rs#L104-L114)
- 계정용 기본 공급자와 내장 Ollama를 별도 임시 홈에서 동시에 초기화했다. 계정용은 `requiresOpenaiAuth:true`, Ollama용은 `false`였다. 같은 임시 홈에서도 두 프로세스의 설정 오버라이드는 독립적으로 적용됐지만 계정용 프로세스가 `thread/list`로 Ollama 스레드를 읽을 수 있었다. 설정·로그인·세션 분리가 목적이면 Ollama 프로세스에 별도 `CODEX_HOME`을 주는 게 맞다. 계정용 프로세스에는 로그인하지 않았다.
- 첫 격리 시험에서 GitHub·GitHub API·ChatGPT에 대한 HTTPS 연결 시도가 차단 프록시에 잡혔다. 앱·메모리와 함께 플러그인·원격 플러그인·추천 플러그인·시스템 프록시 재시도를 끈 조합으로 다시 실행했다. 첫 요청과 최종 실행에서 모델 요청 목적지는 모두 가짜 서버였다. 운영체제 수준의 네트워크 격리는 검사 범위 밖이다.

### 음성은 현재 조합에서 안 된다

80 ms 모노 PCM WAV(2,604바이트)를 `turn/start`에 넣었다. 가짜 Responses 서버에서 턴을 완료시켜도 음성이 모델에 전달됐다는 뜻은 아니므로 HTTP 본문을 직접 검사했다.

| app-server 입력 | 기본 모델 정보 | `model_catalog_json`에 `input_modalities: ["text","image","audio"]` |
| --- | --- | --- |
| `localAudio` 파일 경로 | 음성 미지원 안내로 대체 | `input_audio.audio_url`의 `data:audio/wav;base64,…` 값이 원본과 일치 |
| `audio` HTTP 주소 | 처리 실패 안내. WAV GET 0회 | 처리 실패 안내. WAV GET 0회 |
| `audio` data URL | 음성 미지원 안내로 대체 | `input_audio.audio_url`의 base64가 원본과 일치 |

이 설정으로 Codex에서 음성 바이트를 꺼낼 수 있다. Ollama 0.40.16의 Responses 입력 파서는 `input_audio`를 알 수 없는 타입으로 거절한다. Chat Completions의 `input_audio.data` 및 네이티브 Chat의 `messages[].images[]`는 음성을 받지만 Codex의 wire API에서 선택할 수 없다. 여기서 멈췄다. [Ollama Responses 파서](https://github.com/ollama/ollama/blob/v0.40.16/openai/responses.go#L104-L171), [Ollama Chat Completions 파서](https://github.com/ollama/ollama/blob/v0.40.16/openai/openai.go#L631-L644)

### 입력 분량은 측정했고 실제 토큰 목표는 미확인

전체 접근으로 `안녕?` 첫 요청을 측정했다. 리치오 지시문과 사용·제작 스킬 두 개, Host 도구 10개를 포함했다. 제품 Codex 경로는 ACP에서 쓰는 HTTP MCP 대신 app-server의 `dynamicTools`를 쓴다. 실행기는 계정 진단을 거치는 HTTP 진입점 아래에서 시작하고 로컬 모형 하나를 카탈로그에 주입했다. 나머지 전송 입력은 `AssistantConversations.send`가 만들었다.

| 항목 | Copilot CLI 1.0.114 | pi 1.6.0 + pi-acp 0.1.8 | Codex 0.172.0 |
| --- | ---: | ---: | ---: |
| 요청 본문 | 82,047자 | 12,180자 | 55,363자 |
| 모델에 보이는 도구 | 36개 | 5개 | 18개 |
| 도구 정의 | 52,422자 | 3,626자 | 28,114자 |
| 시스템·개발자 지시문 | 27,833자 | 7,573자 | 20,386자 |
| 리치오 지시문 횟수 | 1 | 1 | 1 |
| 요청하지 않은 추론 값 | `effort: medium`, `summary: auto`, `include: reasoning.encrypted_content` | 없음 | `summary: auto`, `include: reasoning.encrypted_content` |
| 실제 입력 토큰 `gemma4:e4b`, Host 경유 | 18,685 | 3,991 | 미측정 |
| 실제 입력 토큰 `qwen3.5:4b`, Host 경유 | 19,110 | 4,072 | 미측정 |

Codex Host 전송의 `effort: medium`은 실행기가 선택한 값을 리치오가 넘긴 것이다. `summary: auto`는 Host가 붙이고 `include`는 Codex가 더했다. 기본 모델 정보로 직접 전송하면서 강도와 요약을 생략하면 `effort` 없이 `summary:auto`와 `include`가 남았다. 원문은 54,362자였다. Copilot과 pi 수치는 직전 스파이크에서 가져왔다. [pi 스파이크 원본](https://github.com/litzio/litzio/blob/spike/2026-11-24-ollama-pi-audio/scripts/spike-pi-audio/SPIKE.md)

Windows에서는 임시 `CODEX_HOME`, `HOME`, `USERPROFILE`을 줘도 사용자 홈 스킬 목록이 첫 Host 요청에 들어왔다. 초기 본문은 57,603자였다. `skills/list`에서 찾은 개인 스킬 10개 경로를 임시 설정의 `[[skills.config]]`에 `enabled=false`로 넣고 다시 시작했다. 재측정 본문에는 그 목록이 없었고 리치오 스킬 두 개와 Codex 내장 스킬은 남았다. 이 방식은 매 실행 시 발견한 항목을 제외하는 방식이며 홈 경로 탐색 자체는 한다. [Codex 스킬 탐색 소스](https://github.com/openai/codex/blob/rust-v0.172.0/codex-rs/ext/skills/src/host_roots.rs)

### 리치오로 돌아오는 통로는 가짜 모델에서 된다

| 도구와 권한 | 관찰한 결과 |
| --- | --- |
| 질문 카드 `request_litzio_user_input` | 대화에 대기 중인 카드 기록이 남았다. 동일 턴의 후속 요청에서 도구 결과 `accepted:true`를 받았다. |
| `read_document` 읽기 전용 | 열린 폴더의 합성 문서 본문과 revision이 후속 요청에 실렸다. |
| `create_document` 읽기 전용·전체 접근 | 같은 입력으로 읽기 전용에서는 `forbidden`이고 파일이 없었다. 전체 접근에서는 성공 영수증이 오고 파일이 만들어졌다. |
| `exec_command` 읽기 전용 | 승인 필요 쓰기를 요청하자 Codex 승인 카드가 왔다. 거절 응답 뒤 후속 모델 요청에 거절 결과가 왔고 파일은 없었다. |

## 현재 결정과 어긋나는 점

- [비서 계약](../../docs/design/main-agent-v1.md)은 Ollama를 Copilot CLI로 실행하고, 계정용 Codex는 계정 진단과 Codex 모델 목록을 통과해야 한다. 여기서는 Codex 로컬 엔진을 직접 시작하고, 전송 검사에는 합성 모델 목록을 썼다. 제품 코드는 그대로다.
- [ADR-0014](../../docs/adr/0014-main-agent-app-server.md)의 계정용 Codex 설정·세션 재사용과 달리, 로컬 실험은 별도 임시 홈으로 격리했다.

## 검증하지 않은 것

- 실제 Ollama 모델 호출, 받아쓰기 품질·속도·입력 토큰, 실제 모델이 도구를 고르는 능력.
- 계정이 로그인된 상태의 동시 추론, 앱·브라우저에서의 카드 표시, 질문 답변 뒤 재전송, 재시작 뒤 재개, 설치본.
- 사용자 스킬 탐색 자체의 차단과 다른 Windows 계정·설치에서의 격리 동작.

## 실모델 후속 절차

진행 중인 측정이 끝나고 통합 담당자가 별도로 지시한 뒤, 위 가짜 서버 실행의 `logPath`와 정답을 아는 짧은 음성 WAV 하나를 사용한다. 첫 Host 모델 요청은 모델 이름만 바꾸고, 음성 시험의 두 요청에는 같은 WAV를 넣는다.

```powershell
$ollama = 'http://127.0.0.1:11434'
$model = 'gemma4:e4b'
$capturePath = '<probe.ts 실행의 logPath>'
$speechPath = '<정답을 아는 짧은 WAV의 경로>'
$requests = @(Get-Content -LiteralPath $capturePath | ForEach-Object {
    ConvertFrom-Json -InputObject $_ -AsHashtable
} | Where-Object { $_.method -eq 'POST' -and $_.path -eq '/v1/responses' })
Invoke-RestMethod "$ollama/api/show" -Method Post -ContentType 'application/json' `
    -Body (@{ model = $model } | ConvertTo-Json -Compress) | Select-Object capabilities

# 가짜 서버 스모크 요청 다음이 Host의 “안녕?” 요청이다.
$hello = $requests[1].body
$hello.model = $model
$response = Invoke-WebRequest "$ollama/v1/responses" -Method Post -ContentType 'application/json' `
    -Body ($hello | ConvertTo-Json -Depth 100 -Compress) -TimeoutSec 120 -SkipHttpErrorCheck
$response.StatusCode
if ($response.StatusCode -eq 200) {
    $response.Content -split "`n" | Where-Object { $_ -like 'data: *' } |
        ForEach-Object { $_.Substring(6) } | Where-Object { $_ -ne '[DONE]' } |
        ForEach-Object { ConvertFrom-Json -InputObject $_ } |
        Where-Object type -eq 'response.completed' | ForEach-Object { $_.response.usage }
} else { $response.Content }

$wav64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($speechPath))
$prompt = '음성을 그대로 받아써 줘.'
$responsesAudio = @{
    model = $model; stream = $false
    input = @(@{ type = 'message'; role = 'user'; content = @(
        @{ type = 'input_text'; text = $prompt }
        @{ type = 'input_audio'; audio_url = "data:audio/wav;base64,$wav64" }
    ) })
}
$audioResult = Invoke-WebRequest "$ollama/v1/responses" -Method Post -ContentType 'application/json' `
    -Body ($responsesAudio | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 120 -SkipHttpErrorCheck
$audioResult.StatusCode
$audioResult.Content

$chatAudio = @{
    model = $model; stream = $false
    messages = @(@{ role = 'user'; content = @(
        @{ type = 'text'; text = $prompt }
        @{ type = 'input_audio'; input_audio = @{ data = $wav64; format = 'wav' } }
    ) })
}
$chatResult = Invoke-RestMethod "$ollama/v1/chat/completions" -Method Post -ContentType 'application/json' `
    -Body ($chatAudio | ConvertTo-Json -Depth 20 -Compress) -TimeoutSec 120
$chatResult.choices[0].message.content
```

토큰 비교에는 `response.completed.response.usage.input_tokens`와 캐시 값을 기록한다. 실제 서버가 첫 Host 본문을 거절하면 오류와 함께 토큰 미측정으로 기록한다. 음성은 Responses의 예측 결과인 알 수 없는 입력 타입 오류와 Chat Completions에서 받은 받아쓰기를 나란히 확인한다.

## 추천

음성 요구가 있는 Ollama 공급자의 엔진으로 현재 Codex 구성을 채택하지 않는 편이 좋다. Codex 모델 카탈로그 설정으로 음성을 실을 수 있으나 Ollama가 그 요청 형식을 받아야 끝까지 이어진다. 소유자 결정 전까지 결론은 **미정**이다.
