# Ollama 소형 모델의 과제 범위

## 목적

리치오의 `gemma4:e4b` 비서가 대화, 읽기, 그림, 문서 작성·수정, 셸, 이어 하는 작업 중 어느 과제를 반복해서 완수하는지 확인한다.

## 실행

제품 기준은 `715df90e246548b49f4b3a0f2f5195e76c8617e8`이다. 이 기준의 HTTP Host 소스, 비서 지시문·도구, Copilot ACP 실행 경로를 사용한다. 사후 판정에는 동일 기준에서 빌드한 CLI를 사용한다. 로컬 Ollama에 `gemma4:e4b`가 이미 있어야 한다. 추론 강도는 `medium`, 권한은 전체 접근이다.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @litzio/cli build
$evidence = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ("litzio-range-" + [guid]::NewGuid()))
./scripts/spike-ollama-small-model-range/run.ps1 -Evidence $evidence.FullName -CopilotDirectory $copilotDirectory
./scripts/spike-ollama-small-model-range/run.ps1 -Evidence $evidence.FullName -CopilotDirectory $copilotDirectory -Group extended
```

`$copilotDirectory`는 설치된 Copilot CLI 1.0.115 실행 파일 또는 shim이 있는 폴더다. 예비 실행 중 설치본이 자동 갱신됐다. 본 측정에는 1.0.115를 사용했고, 초반 세 실행 이후에는 같은 실행 파일을 복사한 뒤 `--no-auto-update --disable-client-telemetry` 옵션을 전달하는 shim으로 고정했다. 기록된 그림 fixture는 Python Pillow로 재생성할 수 있다.

[이전 수식 스파이크](https://github.com/litzio/litzio/tree/spike/2026-11-25-ollama-formula-mission/scripts/spike-formula-mission)의 Host 실행기, 기록 프록시와 판정 방식을 재사용한다. 실행 하나마다 Host, 프록시, 사용자 홈·AppData·TEMP, 문서 사본, 대화를 분리한다. 8b는 같은 대화에서 두 번째 메시지를 보내며 두 턴을 합쳐 5분으로 제한한다. 답변이 필요한 질문이나 승인이 대기 중이면 답하지 않고 중단해 기록한다. 활성 문서는 정상 Host 전달 경로를 쓰고, 열린 폴더의 경로는 폴더 과제 메시지에 적는다. 붙인 이미지(3a)는 화면과 같은 Host 업로드 작업과 파일 참조를 통해 보낸다.

## 판정

- 응답은 고정 정답과 비교하고, 동치 LaTeX·문맥에 따른 정오·부정 표현 등은 원문을 읽어 확정한다.
- 문서는 공식 `check`의 유효성·쓰기 가능 여부와 예상 구조·내용을 확인한다. 기존 문서는 예상 수정본과 Core canonical 결과를 대조하거나 남아야 할 블록을 직접 비교한다.
- 원본의 변경 여부와 새로 생긴 파일을 검사한다. 8b는 첫 턴과 두 번째 턴의 결과를 따로 저장해 정답 목록의 유지와 항목 추가를 확인한다.
- 페이로드의 모델 요청 수, 응답으로 받은 입력 토큰 합, Host 턴 종료까지의 시간, 도구 순서를 저장한다. 중단 시 사용량이 도착하지 않은 요청은 토큰 합에서 빠진다.
- `result.json`, 모델 요청·응답 본문, 합성 문서 사본은 측정 위치에 보관한다. 공개 요약에서 실제 경로와 계정 정보는 제외한다.
- `pnpm exec tsx scripts/spike-ollama-small-model-range/review.mjs <evidence> progress`로 집계를 보고, `trace`로 판정 근거를 읽을 수 있다. `publish <annotations.json>`은 실패 실행의 분류와 완료 주장 여부를 확인한 뒤 기록 표를 만든다.

## 결과와 한계

본 실행은 25과제 각 5회, 총 125회였다. 성공은 86회였고, 모델 요청은 517회였다. 승인 대기와 5분 제한 중단은 0회였다. 1~3단계의 모든 과제, 활성 문서 요약본 작성, 작은 CSV 합계 답변이 각각 5/5였다. 글머리표가 있는 문서를 만들고 이어서 한 항목을 추가하는 두 턴의 전체 완수는 0/5였다.

실패 분류는 이전 수식 스파이크의 분류를 따른다. 한 실행에 복수 분류가 가능하다. 완료 주장 수는 저장 및 수정 완료를 알린 답변 가운데 실제 산출물이 내용, 유효성 또는 입력 보존 기준에 미달한 실행의 수다.

예비 실행 5회는 본 집계에서 제외했다. 자동 갱신 전 CLI 실행 1회, 폴더 경로가 빠진 과제 2회, 폰트가 뺄셈 기호를 상자로 그린 이미지 1회, 글머리표를 명시하기 전 목록 과제 1회다. Host의 추론 설정은 medium이었다. 본 측정 CLI의 Responses 본문에는 reasoning.effort가 없었다. 7c-1에서 공급자 셸이 수행한 Python 패키지 변경을 복구했다. 그 뒤에는 해당 실행들에 기본 Python 환경으로의 설치를 거절하는 pip 설정을 전달했다.

한 PC에서 짧은 합성 자료를 측정했다. 문서 판정은 Host의 저장 결과와 공식 CLI를 사용했고, 브라우저나 Desktop 화면은 실행하지 않았다. 공유 Ollama의 다른 요청과 경합했는지는 연속 관측하지 않았다.

## 현재 결정과 어긋나는 점

없음. 측정 기준의 리치오 엔진, 도구, 지시문을 그대로 사용했다. #1967의 변경은 측정 기준 뒤에 병합됐다.

## 추천 결론

미정. 경로가 확실한 짧은 읽기·요약·간단한 그림 확인부터 권한다. 문서 수정과 여러 단계의 저장은 파일 자체의 내용과 구조를 확인할 사람이 있는 경우에 쓴다. 결과를 제품 안내로 채택할지는 소유자 결정이 필요하다.

## 실행별 결과
완료 125/125 · 턴 관측 합 51.4분
| 계단 | 과제 | 성공 | 등급 | 시간 중앙값(초) | 입력 토큰 중앙값 |
| --- | --- | ---: | --- | ---: | ---: |
| 1 | 1a 일반 질문 | 5/5 | 안정 | 11.0 | 21,078 |
| 1 | 1b 붙여 준 글 요약 | 5/5 | 안정 | 12.0 | 21,141 |
| 2 | 2a 활성 문서 요약 | 5/5 | 안정 | 13.5 | 42,606 |
| 2 | 2b 활성 문서 표 값 조회 | 5/5 | 안정 | 13.0 | 42,652 |
| 2 | 2c 폴더에서 낱말 검색 | 5/5 | 안정 | 15.1 | 65,616 |
| 2 | 2d 폴더 파일 목록 | 5/5 | 안정 | 13.5 | 42,909 |
| 3 | 3a 붙인 수식 그림 판독 | 5/5 | 안정 | 13.0 | 21,380 |
| 3 | 3b 그림 파일 내용 확인 | 5/5 | 안정 | 12.5 | 42,587 |
| 3 | 3c 표 그림에서 값 조회 | 5/5 | 안정 | 16.1 | 43,003 |
| 4 | 4a 제목과 두 문단 작성 | 1/5 | 안 됨 | 20.1 | 65,427 |
| 4 | 4b 제목·목록·표 작성 | 3/5 | 흔들림 | 22.7 | 66,131 |
| 4 | 4c 활성 문서 요약본 작성 | 5/5 | 안정 | 16.0 | 65,047 |
| 5 | 5a 활성 문서 오타 수정 | 4/5 | 대체로 됨 | 27.2 | 155,355 |
| 5 | 5b 문서 제목 변경 | 3/5 | 흔들림 | 27.7 | 134,719 |
| 5 | 5c 끝에 문단 추가 | 2/5 | 흔들림 | 40.1 | 167,480 |
| 5 | 5d 한 문서 용어 변경 | 3/5 | 흔들림 | 27.3 | 135,140 |
| 5 | 5e 세 문서 용어 변경 | 3/5 | 흔들림 | 28.3 | 115,867 |
| 6 | 6a 표에 행 추가 | 2/5 | 흔들림 | 38.5 | 113,516 |
| 6 | 6b 문단 하나 삭제 | 3/5 | 흔들림 | 40.9 | 190,339 |
| 6 | 6c 블록 수식 삽입 | 0/5 | 안 됨 | 48.1 | 167,430 |
| 7 | 7a 파일 하나 이동 | 4/5 | 대체로 됨 | 22.4 | 88,501 |
| 7 | 7b CSV 합계 답하기 | 5/5 | 안정 | 22.2 | 110,786 |
| 7 | 7c CSV 집계 표 문서 작성 | 0/5 | 안 됨 | 35.4 | 181,122 |
| 8 | 8a 두 문서 비교본 작성 | 3/5 | 흔들림 | 20.9 | 89,115 |
| 8 | 8b 같은 대화에서 목록 수정 | 0/5 | 안 됨 | 45.6 | 183,970 |

수동 판정 1회, 완료 주장과 결과 불일치 11회(4b-3, 5c-2, 6c-1, 6c-2, 6c-3, 7a-1, 7c-1, 7c-2, 7c-4, 8b-1, 8b-2).
1 대상 미발견 1 · 2 이미지 열기 생략 0 · 3 판독 오류 4 · 4 리치오 도구·CLI 미호출 5 · 5 잘못된 도구 21 · 6 도구 인자 오류 27 · 7 오류 후 복구 실패·반복 31 · 8 직접 쓰기에서 의미 훼손 8 · 9 일부만 실행 9 · 10 그 밖 9

| 실행 | 성공 | 초 | 모델 요청 | 입력 토큰 합 | 도구 순서 | 실패 분류 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 1a-1 | 성공 | 10.97 | 1 | 21081 | 없음 | — |
| 1a-2 | 성공 | 11.44 | 1 | 21078 | 없음 | — |
| 1a-3 | 성공 | 10.96 | 1 | 21078 | 없음 | — |
| 1a-4 | 성공 | 11.46 | 1 | 21074 | 없음 | — |
| 1a-5 | 성공 | 10.97 | 1 | 21082 | 없음 | — |
| 1b-1 | 성공 | 13.24 | 1 | 21141 | 없음 | — |
| 1b-2 | 성공 | 11.65 | 1 | 21137 | 없음 | — |
| 1b-3 | 성공 | 11.96 | 1 | 21140 | 없음 | — |
| 1b-4 | 성공 | 11.97 | 1 | 21144 | 없음 | — |
| 1b-5 | 성공 | 11.95 | 1 | 21143 | 없음 | — |
| 2a-1 | 성공 | 14.52 | 2 | 42693 | read_document | — |
| 2a-2 | 성공 | 15.82 | 2 | 42558 | read_document | — |
| 2a-3 | 성공 | 13.01 | 2 | 42606 | read_document | — |
| 2a-4 | 성공 | 11.99 | 2 | 42628 | read_document | — |
| 2a-5 | 성공 | 13.50 | 2 | 42603 | read_document | — |
| 2b-1 | 성공 | 13.51 | 2 | 42652 | read_document | — |
| 2b-2 | 성공 | 13.01 | 2 | 42697 | read_document | — |
| 2b-3 | 성공 | 13.51 | 2 | 42601 | read_document | — |
| 2b-4 | 성공 | 12.48 | 2 | 42570 | read_document | — |
| 2b-5 | 성공 | 13.04 | 2 | 42665 | read_document | — |
| 2c-1 | 성공 | 15.31 | 3 | 65616 | list_documents → read_document ×3 | — |
| 2c-2 | 성공 | 14.72 | 3 | 65728 | list_documents → read_document ×3 | — |
| 2c-3 | 성공 | 13.49 | 3 | 65510 | list_documents → read_document ×3 | — |
| 2c-4 | 성공 | 16.02 | 3 | 65979 | list_documents → read_document ×3 | — |
| 2c-5 | 성공 | 15.06 | 3 | 65615 | list_documents → read_document ×3 | — |
| 2d-1 | 성공 | 13.47 | 2 | 42901 | list_documents | — |
| 2d-2 | 성공 | 13.27 | 2 | 42909 | list_documents | — |
| 2d-3 | 성공 | 12.47 | 2 | 42923 | list_documents | — |
| 2d-4 | 성공 | 13.72 | 2 | 42876 | list_documents | — |
| 2d-5 | 성공 | 13.58 | 2 | 42915 | list_documents | — |
| 3a-1 | 성공 | 17.77 | 1 | 21369 | 없음 | — |
| 3a-2 | 성공 | 12.97 | 1 | 21380 | 없음 | — |
| 3a-3 | 성공 | 12.99 | 1 | 21384 | 없음 | — |
| 3a-4 | 성공 | 13.98 | 1 | 21379 | 없음 | — |
| 3a-5 | 성공 | 12.96 | 1 | 21386 | 없음 | — |
| 3b-1 | 성공 | 15.53 | 2 | 43015 | view | — |
| 3b-2 | 성공 | 12.48 | 2 | 42587 | view | — |
| 3b-3 | 성공 | 13.98 | 2 | 42848 | view | — |
| 3b-4 | 성공 | 11.97 | 2 | 42552 | view | — |
| 3b-5 | 성공 | 11.94 | 2 | 42576 | view | — |
| 3c-1 | 성공 | 28.82 | 3 | 67120 | request_litzio_user_input → view | — |
| 3c-2 | 성공 | 16.13 | 2 | 43003 | view | — |
| 3c-3 | 성공 | 20.08 | 3 | 67308 | skill → view | — |
| 3c-4 | 성공 | 13.54 | 2 | 42829 | view | — |
| 3c-5 | 성공 | 15.11 | 2 | 42866 | view | — |
| 4a-1 | 실패 | 20.06 | 3 | 65427 | create_document ×2 | 6, 7 |
| 4a-2 | 실패 | 30.82 | 4 | 90268 | create_document ×3 | 6, 7 |
| 4a-3 | 성공 | 14.50 | 2 | 43251 | create_document | — |
| 4a-4 | 실패 | 31.82 | 5 | 113591 | create_document ×2 → list_documents → create_document | 6, 7 |
| 4a-5 | 실패 | 13.82 | 1 | 21207 | 없음 | 4, 10 |
| 4b-1 | 성공 | 23.42 | 2 | 44470 | create_document | — |
| 4b-2 | 성공 | 19.18 | 3 | 66131 | create_document ×2 | — |
| 4b-3 | 실패 | 25.65 | 3 | 67807 | create_document ×2 | 9 |
| 4b-4 | 성공 | 22.66 | 3 | 67265 | create_document ×2 | — |
| 4b-5 | 실패 | 18.68 | 1 | 21214 | 없음 | 4, 10 |
| 4c-1 | 성공 | 15.05 | 3 | 64946 | read_document → create_document | — |
| 4c-2 | 성공 | 17.08 | 3 | 65214 | read_document → create_document | — |
| 4c-3 | 성공 | 14.63 | 3 | 64801 | read_document → create_document | — |
| 4c-4 | 성공 | 16.01 | 4 | 86867 | read_document → create_document ×2 | — |
| 4c-5 | 성공 | 17.11 | 3 | 65047 | read_document → create_document | — |
| 5a-1 | 성공 | 18.10 | 3 | 65311 | PowerShell `Get-Content` → view | — |
| 5a-2 | 성공 | 27.19 | 7 | 157996 | read_document → create_document ×3 → edit → read_document | — |
| 5a-3 | 실패 | 18.59 | 2 | 43319 | invoke_plugin_operation | 5, 7 |
| 5a-4 | 성공 | 28.76 | 7 | 159927 | create_document → PowerShell `Get-Content` ×3 → edit → PowerShell `Get-Content` | — |
| 5a-5 | 성공 | 37.12 | 7 | 155355 | create_document ×2 → task ×2 → PowerShell `Get-Content` | — |
| 5b-1 | 실패 | 17.56 | 1 | 21107 | 없음 | 4, 10 |
| 5b-2 | 성공 | 24.23 | 6 | 135278 | invoke_plugin_operation → manage_plugins → view → edit → view | — |
| 5b-3 | 성공 | 34.81 | 8 | 185638 | create_document ×2 → read_document → create_document ×2 → PowerShell `Get-Content` → read_document | — |
| 5b-4 | 실패 | 36.92 | 5 | 112546 | create_document ×4 | 5, 6, 7 |
| 5b-5 | 성공 | 27.70 | 6 | 134719 | create_document ×2 → view → PowerShell `Get-Content` → view | — |
| 5c-1 | 실패 | 34.31 | 6 | 136487 | create_document ×5 | 5, 6, 7 |
| 5c-2 | 실패 | 29.21 | 6 | 136995 | read_document → create_document ×2 → PowerShell `Add-Content` → read_document | 5, 6, 7, 8 |
| 5c-3 | 실패 | 49.51 | 8 | 190358 | create_document ×4 → read_document → edit → create_document | 5, 6, 7 |
| 5c-4 | 성공 | 42.94 | 7 | 167480 | create_document ×2 → read_document → create_document → PowerShell `Add-Content` → read_document | — |
| 5c-5 | 성공 | 40.11 | 8 | 186995 | create_document ×4 → view → PowerShell `Set-Content` → view | — |
| 5d-1 | 실패 | 39.84 | 7 | 163177 | create_document ×3 → read_document → create_document ×2 | 5, 6, 7 |
| 5d-2 | 실패 | 31.38 | 6 | 136094 | create_document ×3 → PowerShell `Get-Content` ×2 | 5, 6, 7, 10 |
| 5d-3 | 성공 | 26.77 | 6 | 135140 | read_document → create_document ×2 → PowerShell `Get-Content` → read_document | — |
| 5d-4 | 성공 | 27.27 | 5 | 112196 | create_document ×2 → PowerShell `Get-Content` → view | — |
| 5d-5 | 성공 | 24.98 | 5 | 111201 | create_document ×2 → PowerShell `Get-Content` → PowerShell `Set-Content` | — |
| 5e-1 | 성공 | 25.26 | 5 | 115867 | list_documents → manage_plugins ×3 → PowerShell `Get-Content` → view | — |
| 5e-2 | 성공 | 50.03 | 10 | 255031 | list_documents → read_document ×3 → create_document ×12 → PowerShell `Get-Content` ×4 → read_document | — |
| 5e-3 | 성공 | 28.32 | 6 | 139582 | list_documents → edit ×3 → view ×3 → edit ×3 → view | — |
| 5e-4 | 실패 | 36.84 | 5 | 115855 | list_documents → create_document ×9 | 3, 5, 6, 7 |
| 5e-5 | 실패 | 18.65 | 3 | 66175 | list_documents → invoke_plugin_operation ×3 | 3, 5, 7 |
| 6a-1 | 실패 | 43.35 | 5 | 113516 | read_document → create_document ×3 | 5, 6, 7 |
| 6a-2 | 성공 | 39.42 | 8 | 186764 | read_document → create_document ×4 → edit → read_document | — |
| 6a-3 | 실패 | 32.29 | 4 | 89857 | create_document ×3 | 5, 6, 7 |
| 6a-4 | 성공 | 38.48 | 6 | 139283 | create_document ×2 → read_document → edit → read_document | — |
| 6a-5 | 실패 | 16.19 | 3 | 64849 | invoke_plugin_operation ×2 | 5, 7 |
| 6b-1 | 실패 | 45.54 | 9 | 212448 | read_document → create_document ×7 | 5, 6, 7 |
| 6b-2 | 성공 | 32.81 | 8 | 185540 | read_document → manage_plugins → create_document ×3 → PowerShell `Get-Content` → read_document | — |
| 6b-3 | 성공 | 40.89 | 8 | 191733 | read_document → create_document ×3 → create → edit → view | — |
| 6b-4 | 성공 | 39.73 | 6 | 140177 | read_document → manage_plugins ×3 → edit | — |
| 6b-5 | 실패 | 43.51 | 8 | 190339 | read_document → create_document ×3 → PowerShell `Get-Content` ×2 → view | 5, 6, 7, 10 |
| 6c-1 | 실패 | 38.05 | 7 | 162554 | read_document → create_document ×3 → PowerShell `Add-Content` → read_document | 5, 6, 7, 8 |
| 6c-2 | 실패 | 28.46 | 6 | 136292 | create_document ×2 → view → PowerShell `Set-Content` → view | 5, 6, 7, 8 |
| 6c-3 | 실패 | 48.06 | 8 | 191780 | read_document → create_document ×4 → view → edit | 5, 6, 7, 8 |
| 6c-4 | 실패 | 56.64 | 7 | 167430 | create_document ×3 → PowerShell `apply-batch` ×3 | 5, 6, 7 |
| 6c-5 | 실패 | 54.52 | 10 | 241450 | create_document ×8 → read_document | 5, 6, 7 |
| 7a-1 | 실패 | 23.61 | 4 | 88899 | PowerShell `Move-Item` → PowerShell `Get-ChildItem` ×2 | 1, 9 |
| 7a-2 | 성공 | 21.64 | 4 | 88201 | PowerShell `Get-ChildItem` → PowerShell `Move-Item` → PowerShell `Get-ChildItem` ×2 | — |
| 7a-3 | 성공 | 22.35 | 4 | 88501 | PowerShell `Get-ChildItem` → PowerShell `Move-Item` → PowerShell `Get-ChildItem` | — |
| 7a-4 | 성공 | 18.14 | 3 | 65068 | PowerShell → PowerShell `Move-Item` | — |
| 7a-5 | 성공 | 24.29 | 5 | 110930 | PowerShell `Get-ChildItem` ×2 → PowerShell `Move-Item` → PowerShell `Get-ChildItem` | — |
| 7b-1 | 성공 | 13.48 | 2 | 42595 | view | — |
| 7b-2 | 성공 | 18.64 | 4 | 87265 | PowerShell `Import-Csv` → view → PowerShell `Import-Csv` | — |
| 7b-3 | 성공 | 26.83 | 7 | 202712 | skill → PowerShell `Import-Csv` → read_powershell → PowerShell `Import-Csv` ×3 | — |
| 7b-4 | 성공 | 22.16 | 4 | 110786 | skill → view → PowerShell `Import-Csv` | — |
| 7b-5 | 성공 | 24.80 | 5 | 143145 | skill → PowerShell `python` → view → PowerShell `python` | — |
| 7c-1 | 실패 | 71.34 | 10 | 241194 | PowerShell `Get-ChildItem` → PowerShell `Set-Content` → PowerShell `Get-Content` → PowerShell `Set-Content` → PowerShell `python` → create_document ×3 → PowerShell `Set-Content` | 6, 7, 8, 10 |
| 7c-2 | 실패 | 35.39 | 7 | 160167 | view → PowerShell `Import-Csv` → create_document ×3 → create | 3, 6, 7, 8 |
| 7c-3 | 실패 | 29.92 | 3 | 66290 | PowerShell `Get-ChildItem` → create | 4, 9, 10 |
| 7c-4 | 실패 | 57.20 | 13 | 316552 | view → PowerShell `python` → PowerShell `Set-Content` → PowerShell `python` ×2 → create_document ×7 | 3, 6, 10 |
| 7c-5 | 실패 | 29.33 | 8 | 181122 | view → create → PowerShell `Python` → read_powershell → PowerShell `Python` → view ×2 | 4, 6, 7, 9 |
| 8a-1 | 성공 | 19.11 | 3 | 66176 | read_document ×2 → create_document | — |
| 8a-2 | 실패 | 27.68 | 5 | 112902 | read_document ×2 → create_document ×3 | 6, 7, 9 |
| 8a-3 | 실패 | 18.06 | 2 | 43183 | read_document ×2 | 9, 10 |
| 8a-4 | 성공 | 30.09 | 5 | 114178 | read_document ×2 → create_document ×3 | — |
| 8a-5 | 성공 | 20.86 | 4 | 89115 | read_document ×2 → create_document ×2 | — |
| 8b-1 | 실패 | 41.15 | 9 | 206016 | create_document ×3 → PowerShell `Set-Content` → view → PowerShell `Add-Content` → view | 6, 7, 8 |
| 8b-2 | 실패 | 42.84 | 8 | 183970 | create_document ×3 → PowerShell `Set-Content` → PowerShell `Add-Content` → view | 6, 7, 8 |
| 8b-3 | 실패 | 45.62 | 8 | 182213 | create_document ×5 → read_document | 5, 7, 9 |
| 8b-4 | 실패 | 48.63 | 8 | 182678 | create_document ×4 → read_document → create_document | 5, 7, 9 |
| 8b-5 | 실패 | 52.55 | 9 | 213088 | create_document ×2 → read_document → create_document ×2 → edit → read_document | 6, 7, 9 |
