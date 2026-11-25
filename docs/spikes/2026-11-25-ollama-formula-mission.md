# Ollama 비서의 PDF 수식 교체

- Status: Historical
- Scope: Windows의 공개 LSR 표본 1벌, 로컬 Ollama의 `gemma4:e4b`, Copilot CLI 1.0.114.

## 목적

PDF 가져오기가 그림으로 보존한 수식을 비서가 실제 수식 블록으로 바꿀 때 어디에서 막히는지 확인한다. 모델의 그림 판독, 비서 경로의 이미지 전달, 정답 LaTeX를 알고 하는 편집을 각각 측정한다.

## 무엇을 만들었나

- 공개 `LSR-1.1-standards.pdf`를 격리 HTTP Host의 PDF 가져오기 화면에서 변환했다. persistent profile을 사용했고 쪽 제외 제안대로 1쪽을 제외했다. Markdown, `assets/`, `.pdf-source.json`을 기준 사본으로 보관했다.
- [앞선 pi 측정 실행기](2026-11-24-ollama-pi-audio.md)의 Host 실행기와 Ollama 요청 프록시를 수식 과제에 맞췄다. 각 비서 턴은 전체 접근, 추론 강도 `medium`, 새 Host·문서 사본·대화로 실행했다. 턴 제한은 10분이며 승인 요청에는 답하지 않았다.
- B는 51번 블록의 이미지 경로와 정답 LaTeX를 주었다. C는 활성 문서에서 수식 그림 전체의 교체를 요청했다. A는 PNG를 Ollama `/api/chat`에 한 장씩 보냈다.

| 원본 물리 쪽 | Markdown 줄 / CLI 블록 | 그림 | 표본 정답 LaTeX | 원본 번호 |
| ---: | --- | --- | --- | ---: |
| 8 | 148 / 51 | `figure-001.png` | `J=\sum_{k=2}^{7}\frac{a_k^2}{1+k^2}` | 1 |
| 8 | 153 / 52 | `figure-002.png` | `R=\frac{\sqrt{A_{rms}^{2}-A_{0}^{2}}}{A_{base}}\times100\%` | 2 |
| 11 | 227 / 74 | `figure-005.png` | `\Theta=\sqrt[3]{\sum_{j=2}^{9}b_j^{3}}` | 3 |

세 그림 모두 `:alt: 수식 영역`이고 캡션은 비어 있었다. `(1)`, `(2)`, `(3)`은 각각 PNG 안에만 있었다. 정답은 표본의 `standards.json`에서 가져왔다. [PDF 가져오기 정답 자료 안내](https://github.com/litzio/plugins/blob/99937f68bbae4e39aa4e215a775db85157c7cfb9/plugins/pdf-import/test/fixtures/README.md)

## 결과·관찰

### 그림 전달과 모델의 판독

`/api/show`는 `vision`을 보고했다. 보조 턴에서 그림 경로를 직접 주었고 Copilot CLI의 `view`가 호출됐다. 도구 결과에는 `Viewed image file successfully.`와 함께 `an image attachment was omitted from this request because image input is unavailable for the current model`이 들어갔다. 직후 `/v1/responses` 본문에는 이미지 파트가 0개였다. 현재 엔진의 파일 보기 경로에서 확인한 결과다.

A는 실행 9번 중 공백·바깥 수식 구분자를 뺀 소스 일치가 1번이었다. 첨자 중괄호와 글꼴 명령, 번호 표기 차이를 감안한 수학적 내용은 6번 일치했다. 원문과 사람이 본 차이를 아래에 남겼다.

| 그림 / 회차 | 코드 펜스의 첫 수식 | 판독 |
| --- | --- | --- |
| 1 / 1 | `J = \sum_{k=2}^{7} \frac{a_k^2}{1 + k^2}` | 일치 |
| 1 / 2 | `\mathcal{J} = \sum_{k=2}^{7} \frac{a_k^2}{1 + k^2} \tag{1}` | `J` 글꼴과 번호 표기 차이 |
| 1 / 3 | `\mathcal{J} = \sum_{k=2}^{7} \frac{a_k^2}{1 + k^2}` | `J` 글꼴 차이 |
| 2 / 1 | `R = \frac{\sqrt{A^2_{\text{rms}} - A^2_0}}{A_{\text{base}}} \times 100\%` | 첨자 글꼴·순서·중괄호 차이 |
| 2 / 2 | `R = \frac{\sqrt{A_{\text{rms}}^2 - A_0^2}}{A_{\text{base}}} \times 100\%` | 첨자 글꼴·중괄호 차이 |
| 2 / 3 | `R = \frac{\sqrt{A_{rms}^2 - A_0^2}}{A_{base}} \times 100\%` | `0` 첨자 중괄호만 다름 |
| 3 / 1 | `\theta = \sqrt{\sum_{j=2}^{3} b_j^3}` | 대소문자, 세제곱근, 합의 상한 오류 |
| 3 / 2 | `\theta = \sqrt{\sum_{j=2}^{3} b_j^3}` | 대소문자, 세제곱근, 합의 상한 오류 |
| 3 / 3 | `\Theta = \sqrt{\sum_{j=2}^{3} b_j^3}` | 세제곱근, 합의 상한 오류 |

### 사람의 CLI 대조군

`litzio inspect <file> --format json`에서 경로와 revision을 얻었다. 각 그림을 같은 인덱스의 `remove-block` → `insert-equation` → `update-enumerator`로 바꾸는 JSON 배열을 만들고 `litzio apply-batch <file> --operations <json-file> --if-revision <revision> --format json`을 한 번 실행했다. 한 그림과 세 그림 각각의 대조군에서 `check`가 유효·쓰기 가능했고, 같은 위치에 LaTeX와 고정 번호가 생겼다. 다른 블록의 canonical 원문과 읽기 모델은 같았다.

비서 계약은 기존 문서에 공급자 패치 후 `litzio check`를 안내한다. 전체 접근에서 쓰기 CLI도 허용한다. `litzio-guide`에는 `inspect`와 `apply-batch`의 텍스트 부분 수정 예가 있다. `create_document`는 빈 문서에만 연산을 적용하는 새 문서 도구다. `import_document_image`는 이미지 파일을 복사하며, 판독에는 공급자의 `view`가 쓰인다. 현재 CLI에는 그림 하나를 수식으로 교체하는 전용 명령이 없고, 위 배치는 파일을 한 번만 저장한다. [비서 구현 계약](../design/main-agent-v1.md) · [비서 지시문](../../apps/editor/server/assistant/AGENTS.md) · [앱 사용 안내](../../apps/editor/server/assistant/litzio-guide/SKILL.md)


### 비서 편집 결과

| 과제 | 성공 / 실행 | 관찰 |
| --- | ---: | --- |
| B · 정답을 받은 교체 | 0 / 3 | 세 번 모두 새 문서 생성 도구부터 시도. 실제 수식 블록 0개 |
| C · 전체 미션 | 0 / 3 | 세 번 모두 대상 3개를 찾았고 PNG를 연 실행은 0번 |
| B · CLI 경로를 명시한 뒤 | 1 / 3 | 공식 배치 쓰기 1번. 나머지 두 번은 CLI 명령을 플러그인 작업으로 호출 |

B·C의 9개 실행 모두 사후 `check`는 유효했다. 성공한 B 추가 실행은 수식 LaTeX, 원래 자리, 표시 번호 1, 대상 밖 내용 보존을 통과했다. 1은 자동 번호였다. 기준 사본에는 다른 수식이 없었으므로 해당 결과만으로 고정 번호나 여러 기존 수식의 번호 유지까지 확인할 수는 없다.

| 실행 | 초 | 모델 요청 | 관측 입력 토큰 합 | 도구·명령 순서 |
| --- | ---: | ---: | ---: | --- |
| A 1-1 / 1-2 / 1-3 | 26.60 / 16.14 / 3.41 | 각각 1 | 각각 114 | 도구 없음 |
| A 2-1 / 2-2 / 2-3 | 3.41 / 4.78 / 3.52 | 각각 1 | 각각 104 | 도구 없음 |
| A 3-1 / 3-2 / 3-3 | 4.55 / 1.40 / 3.21 | 각각 1 | 각각 114 | 도구 없음 |
| 그림 전달 보조 | 15.76 | 2 | 42,872 | `view`(PNG) |
| B-1 | 53.01 | 9 | 243,210 | `read_document` → `create_document` ×6 → `edit` |
| B-2 | 68.95 | 9 | 257,191 | `read_document` → `create_document` ×4 → `edit` → `view`(Markdown) → `create_document` |
| B-3 | 44.72 | 7 | 190,064 | `read_document` → `create_document` ×3 → PowerShell `Get-Content` → `Set-Content` |
| C-1 | 36.31 | 4 | 98,758 | `read_document` → `edit` ×6 |
| C-2 | 39.08 | 4 | 102,268 | `read_document` → `manage_plugins` ×3 → PowerShell `Set-Content` |
| C-3 | 26.17 | 4 | 71,894 | `read_document` → `invoke_plugin_operation` → `request_litzio_user_input` |
| B 추가 1 | 53.97 | 9 | 279,709 | CLI `inspect` → `Get-Content` → `grep` → `view`(텍스트) → `create`(연산 JSON) → CLI `apply-batch` ×2 → CLI `check` |
| B 추가 2 | 15.94 | 2 | 43,460 | `invoke_plugin_operation` |
| B 추가 3 | 21.74 | 4 | 66,075 | `invoke_plugin_operation` → `list_documents` → `request_litzio_user_input` |

C-3과 B 추가 3은 질문 대기에서 중단했다. 각 마지막 요청은 사용량을 받기 전에 취소되어 합계에서 빠졌다. 승인 대기는 없었다. Ollama 0.40.16에서 `/api/show`의 모델 한도는 131,072였고 `/api/ps`의 적재 컨텍스트는 65,536이었다. 비서의 본문에는 `num_ctx`가 없었다. 기본 B·C 첫 요청은 36개 도구와 21,124–21,221 입력 토큰, 단일 요청의 최대 입력은 기본 33,987, 추가 38,918이었다. 컨텍스트 한도 오류와 입력 잘림을 가리키는 응답은 관찰하지 않았다. 취소한 두 요청의 입력 길이는 확인하지 못했다.

### 실패 분류

한 실행에 여러 분류를 붙였다. A의 3번은 수식 값·연산자가 달라진 경우다. 표기만 다른 다섯 건은 A 원문 표에 남겼다.

| 분류 | A | 기본 B·C | B 추가 | 대표 근거 |
| --- | ---: | ---: | ---: | --- |
| 1 · 대상 미발견 | — | 0 | 0 | C는 세 실행 모두 그림 경로를 식별 |
| 2 · 이미지 열기 생략 | — | 3 | 0 | C-1은 PNG를 열지 않고 `수식 1` 등의 문구로 패치를 시도 |
| 3 · 판독 오류 | 3 | 0 | 0 | A의 3번 그림에서 세제곱근을 제곱근으로, 합의 상한 9를 3으로 읽음 |
| 4 · 리치오 도구·CLI 미호출 | — | 0 | 0 | 기본 B·C는 모두 리치오 `read_document`를 호출 |
| 5 · 잘못된 도구 | — | 5 | 2 | B는 기존 파일에 `create_document`, C-2는 `manage_plugins remove-block`, B 추가 2·3은 `invoke_plugin_operation inspect` 호출 |
| 6 · 도구 인자 오류 | — | 2 | 0 | B-2와 C-1은 `edit`에서 기존 블록의 닫는 펜스를 다르게 넘김. `No match found: old_str not found …; no changes made` |
| 7 · 오류 후 복구 실패·반복 | — | 4 | 2 | B-1의 `create_document` 6회. B 추가 2·3은 플러그인의 `Service unavailable. Try again later.` 뒤 CLI로 전환하지 못함 |
| 8 · 직접 쓰기에서 의미 훼손 | — | 2 | 0 | B-1은 LaTeX를 일반 문단으로 저장. C-2는 빈 줄도 없애 이웃 문단과 임시 문구가 합쳐짐 |
| 9 · 일부만 실행 | — | 1 | 0 | C-2는 그림 세 개를 제거하고 임시 문구만 남김 |
| 10 · 그 밖 | — | 2 | 1 | B-3은 줄바꿈이 다른 문자열을 PowerShell로 교체하려다 그림을 그대로 둠. C-3과 B 추가 3은 질문 대기에서 중단 |

실행별 근거는 B-1 `5·7·8`, B-2 `5·6·7`, B-3 `5·7·10`, C-1 `2·6·7`, C-2 `2·5·8·9`, C-3 `2·5·10`, B 추가 2 `5·7`, B 추가 3 `5·7·10`이다. B-1의 새 문서 연산에는 `unknown option: --content`, `missing --at` 및 `removeBlock index out of range: 158`이 나왔다. B 추가 1은 revision을 처음 옮겨 적을 때 `--if-revision must be 64 lowercase hexadecimal characters`를 받았지만 재시도에서 바로잡았다.

### 임시 지시문 전후

후보는 기존 파일용 CLI 순서의 누락과, 새 문서 도구 설명에 나오는 편집 연산을 기존 파일에도 쓸 수 있다고 오인하는 문제였다. 임시 문단 하나로 `create_document`의 범위를 명시하고, `inspect`에서 그림 `path[0]`·revision을 찾아 `remove-block`과 `insert-equation`을 같은 `apply-batch`에 넣는 순서를 추가했다. 세 요청에 문단이 실제로 전달됐고, 측정 뒤 원래 지시문을 복원했다. B는 0/3에서 1/3으로 바뀌었다. 나머지 두 번은 CLI의 `inspect`를 플러그인 작업 이름으로 넘겼다. 추가 1이 OS 임시 폴더에 연산 JSON을 생성했다. 추가 3부터는 임시 파일 충돌을 피하도록 프로세스 TEMP/TMP도 실행별로 분리했다.

## 현재 결정과 어긋나는 점

없음. 제품의 공급자·엔진·공식 쓰기 경로는 그대로 사용했다. 임시 안내는 비교 측정에만 적용했다. PDF 원본 연결의 재열기·정합성은 이번 측정에서 확인하지 않았다.

## 결론/후속

**미정.** 그림 보기 도구에서 이미지가 누락됐고 모델 직접 판독에서도 세 번째 그림이 세 번 틀렸다. 정답을 받은 편집에도 별도의 도구 선택 문제가 있었다. 다음에는 동일 PNG의 `view` 결과가 실제 Ollama 요청의 이미지 파트로 도착하는 작은 수락 시험을 만들고, 이 경로부터 확인하는 것을 권한다. 이 PC의 `gemma4:e4b`와 공개 문서 한 벌로 측정했고, 그림별 A와 B·C·추가 비교는 각각 세 번 실행했다. 이 범위 밖의 결과는 확인하지 않았다.

## 코드 위치

- 태그·브랜치 `spike/2026-11-25-ollama-formula-mission`, 마지막 커밋 `4f40ae33681100adff93f90ebb20ab7d2e5c9215`. 실행 및 판정 방법은 [SPIKE.md](https://github.com/litzio/litzio/blob/4f40ae33681100adff93f90ebb20ab7d2e5c9215/scripts/spike-formula-mission/SPIKE.md)에 있다.

## 스크린샷

없음.
