# 비서 완수 측정과 PowerShell 제한 언어 모드 조사

- Status: Historical
- Last verified: 2026-11-14 — 격리 production Host의 실제 AI, 공급자 직접 실행, 저장 파일·검사 결과 대조. 안내 수정 뒤 AI 재측정은 하지 않음.
- Scope: [#1565](https://github.com/litzio/litzio/issues/1565)의 남은 환경 조사와 합성 수락 과제. 현재 authority는 [ADR-0021](../adr/0021-general-agent-assistant.md)과 [비서 계약](../design/main-agent-v1.md).
- 기준: fetch 직후 `research/1565-assistant-completion`과 `origin/master`가 같은 `970fe245d69b`임을 확인. 해당 소스의 production CLI/Editor 빌드, Codex CLI 0.167.0, 일반 설치 PowerShell 7.6. 이 기록은 제품 전체의 수락 판정이 아니다.

## 한 쪽 요약

Codex **gpt-6.1-terra / high, 열린 폴더에서 13/13 완수**했다. 각 과제를 새 자료·대화로 한 번씩 실행했고 사용자 턴은 각 1회, 재시도·승인 응답은 0회다. 합계 373.2초, 중앙값 30.8초, 범위 5.6~43.8초다. 기존 문서의 제목·표·용어·그림·수식·활성 경로 수정과 파일 변환·집계·이동을 확인했다. 13번의 완수는 화면 대행 미지원 안내이며 파일 작업 성공과 구별한다.

PowerShell 쓰기 거절의 직접 원인은 **Codex app-server의 제한 실행에서 나타나는 ConstrainedLanguage와 .NET 파일 API 선택의 조합**이다. 리치오 밖의 같은 app-server에서도 재현했고, CLI shim 주입 전후 결과가 같았다. 열린 쓰기 범위에서는 cmdlet·Node로 쓰기가 가능했다. PC의 정책 변경이나 전체 접근 전환이 필요한 실패로 해석해서는 안 된다. 단, 공급자 내부의 제한 토큰·Windows 정책 상호작용 중 어느 구현이 언어 모드를 정하는지까지 확정하지 않았다.

별도 **Copilot Auto 0/1**은 79.0초 뒤 폴더 지침을 읽는 셸의 실행 승인 대기에서 중단했다. 승인에 답하지 않는 측정 조건이므로 Copilot 편집 불능의 증거는 아니다. 수정 전이어서 변경 보기·되돌리기는 확인하지 못했다.

| 완수를 막은 분류 | Codex 13과제 | Copilot 1과제 |
| --- | ---: | ---: |
| 도구·기능 없음 | 0 | 0 |
| 권한·환경 | 0 | 1 (실행 승인 대기) |
| 지침이 틀리거나 빠짐 | 0 | 0 |
| 리치오의 결함 | 0 | 0 |
| 모델의 절차 선택 | 0 | 0 |

완수 중 복구된 환경 오류는 Codex 과제 2·8의 2건이다. .NET 제한 오류 뒤 Python으로 전환했다. 이들은 위 미완수 집계와 별개다. 제한 모드 복구 안내 한 항목과 수락 실행기의 명시적 격리 경로 세 항목만 수정했다. 다른 개선 후보는 아래 목록으로 남긴다.

## 실행 범위와 측정 방법

[수락 안내](../test/README.md#비서-수락-시험-수동-측정), [13과제](../../scripts/assistant-acceptance/tasks.mjs), [실행기](../../scripts/assistant-acceptance/run.mjs)를 사용했다. Host의 대화 HTTP API로 전송·조회·중단했으며 실제 채팅 UI 자동 입력 시험은 아니다. 화면에서는 `pnpm browser:test`와 checkout별 재사용 Chrome profile로 설정 → 비서 → 작업 폴더가 해당 격리 폴더임을 확인했다. 화면 확인용 임시 시나리오는 원상 복구했다. 기존 회귀 시나리오의 오류 기대값과 충돌한 사전 확인 2회는 AI 호출 없이 종료했으며 기대값을 완화하지 않았다.

Host마다 아래 다섯 항목을 모두 자기 임시 하위로 지정했다. 기존 설치본·daemon·사용자 자료는 사용하지 않았다. 공급자 홈·인증·설정과 PC 정책은 변경하지 않았다. 기존 공급자 환경을 유지했으며 읽힌 전역 기억의 내용은 이 문서에 옮기지 않는다.

- `LITZIO_DATA_DIR`
- `LITZIO_ASSISTANT_CWD`
- `LITZIO_ASSISTANT_SETTINGS_FILE`
- `LITZIO_DAEMON_DIR`
- `LITZIO_PLUGINS_SETTINGS_FILE`

실제 AI는 합계 **21회**다: Terra 수락 13회, Luna Host 권한 비교 3회, Luna 직접 CLI 비교 3회, Copilot Auto 1회, 절차 오류로 제외한 Luna 1회. 제외한 1회는 실험기 줄바꿈 차이로 화면 확인 삽입이 누락돼 먼저 실행됐다. 다섯 경로는 격리돼 있었고 Host 종료를 확인했다. 본 측정에 합산하지 않으며 호출 예산에는 포함한다. 추가 AI 재시도는 없다. 직접 app-server `command/exec` 비교는 모델을 호출하지 않았다.

판정은 저장된 출력·원본 보존 조건·`litzio check`와 과제 predicate를 함께 대조했다. 과제 9는 비서 작업 폴더의 `aggregate_sales.py` 작성·실행까지 확인했다. 폴더별 inventory에만 나타나지 않는 이 스크립트는 의도된 산출물이다. 과제 12는 `focus.md`만 교정하고 `other.md`는 원문을 유지했다. 과제 13은 도구 0회로 사용자가 직접 탭을 닫아야 한다고 안내했다.

## 일 1: 환경 비교

### 실제 Host, Luna low 각 1회

같은 합성 활성 문서에 “제목을 수정 제목으로 바꾸고, LanguageMode·Lockdown 값을 출력한 뒤 .NET 쓰기를 먼저 시도하고 실패하면 다른 허용 편집으로 완수”를 요청했다. 이는 환경 진단을 유도한 요청이며 자연스러운 수락 과제와 구분한다.

| 권한 | 초 | 관측 | 편집 결과 |
| --- | ---: | --- | --- |
| 열린 폴더 | 31.6 | 모델이 read-only라고 잘못 설명하고 셸 진단 생략. read_document → 공급자 파일 편집 → read_document | 제목 변경됨, 다른 파일 보존. 셸 환경은 이 호출로 판정 불가 |
| 전체 접근 | 27.7 | FullLanguage, Lockdown 빈 값, .NET WriteAllText 실행 성공 | 제목을 바꾸었으나 frontmatter·기존 본문까지 없애 단일 제목으로 덮어씀. 문서 검사 실패, 내용 보존 완수 아님 |
| 읽기 전용 | 19.9 | ConstrainedLanguage, .NET 호출 거절. 이어 저장본 조회 | 원본 유지, 예상된 편집 제한 |

열린 폴더 호출의 문장: “PowerShell 환경 진단 및 직접 쓰기는 read-only 권한에서 금지되어 있어 시도하지 않습니다.” 이 첫 설명 전 도구 호출은 없었고 이후 `read_document`를 호출했다. 실제 공급자 패치는 성공했다. 권한을 바꾼 사실은 없으며 이 모순은 모델 설명·초기 컨텍스트 조사 후보로 남긴다.

아래 명령·오류에서 `<pwsh>`는 실행 파일, `<run>`은 실험 루트의 치환이다. 로컬 경로만 치환했고 공급자 문자열의 따옴표·인코딩 손상은 보존한다. 읽기 전용 Host의 실제 셸 호출:

```text
"<pwsh>" -Command '$ExecutionContext.SessionState.LanguageMode; $env:__PSLockdownPolicy; [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath '"'focus.md'), '# 수정 제목' + [Environment]::NewLine)"
```

오류의 핵심 원문:

```text
ConstrainedLanguage
InvalidOperation:
     | �޼��带 ȣ���� �� �����ϴ�. �޼��� ȣ���� �� ��� ����� �ھ� ���Ŀ����� �����˴ϴ�.
```

모델은 이후 “현재는 read-only 권한이라 제공된 문서 도구로도 제목을 바꿀 수 없으며”라고 답했다. 직전 호출은 성공한 `read_document`이고 원문 조회 결과였다. 이는 열린 폴더의 실패 설명과 달리 실제 읽기 전용 요청이다.

### 리치오 밖의 동일 공급자 비교

같은 Codex executable·기존 공급자 환경으로 직접 `codex exec`를 세 권한에서 Luna low 각 1회 실행했다. 별도로 app-server를 직접 시작해 같은 `command/exec`와 아래 명령을 세 권한에서 실행했다. app-server 비교는 환경 주입 없음과 리치오 `assistantCliEnvironment`의 CLI shim·환경 주입 있음 두 경우다. 두 경우 모두 자기 합성 폴더를 cwd·쓰기 root로 사용했다.

```powershell
$ExecutionContext.SessionState.LanguageMode
'Lockdown='+$env:__PSLockdownPolicy
[System.IO.File]::WriteAllText('dotnet.txt','probe')
Set-Content -LiteralPath cmdlet.txt -Value probe
node -e "require('fs').writeFileSync('node.txt','probe')"
```

| 공급자 경로 | 권한 | LanguageMode | .NET / cmdlet / Node |
| --- | --- | --- | --- |
| 직접 CLI, 실제 AI | workspace-write | FullLanguage | 성공 / 성공 / 성공 |
| 직접 CLI, 실제 AI | read-only | ConstrainedLanguage | 거절 / Access denied / EPERM |
| 직접 CLI, 실제 AI | danger-full-access | FullLanguage | 성공 / 성공 / 성공 |
| 직접 app-server, 주입 없음 | workspaceWrite | ConstrainedLanguage | 거절 / 성공 / 성공 |
| 직접 app-server, 주입 있음 | workspaceWrite | ConstrainedLanguage | 거절 / 성공 / 성공 |
| 직접 app-server, 주입 없음·있음 | readOnly (각각) | ConstrainedLanguage | 거절 / Access denied / EPERM |
| 직접 app-server, 주입 없음·있음 | dangerFullAccess (각각) | FullLanguage | 성공 / 성공 / 성공 |

모든 경우 Lockdown 환경변수는 빈 값이었다. 실제 파일 존재로 각 쓰기를 확인했다. 직접 app-server의 깨지지 않은 오류 원문:

```text
InvalidOperation: 메서드를 호출할 수 없습니다. 메서드 호출은 이 언어 모드의 코어 형식에서만 지원됩니다.
```

`workspaceWrite`에서는 .NET 오류가 있어도 뒤 명령이 성공해 프로세스 exitCode가 0이었다. 같은 현상이 수락 과제 2·8의 도구 status=completed에서도 나타났다. 상태만으로 명령 안의 모든 단계가 성공했다고 판정하지 않았다.

직접 일반 셸은 FullLanguage였으며 AppLocker 서비스는 중지 상태, 실행 정책은 LocalMachine RemoteSigned·나머지 scope Undefined였다. CodeIntegrity 정책 파일은 존재했다. 파일 존재나 서비스 상태만으로 WDAC·AppLocker의 영향을 완전히 배제하지 않는다. 정책 변경 없이도 공급자 제한 실행 여부·방식에 따라 결과가 달라진다는 것은 관측했다. Store PowerShell의 프로세스 시작 실패와 달리 이번에는 셸 시작 후 메서드가 거절됐다.

**판정:** (가) 공급자 제한 실행 경로와 연관됨을 재현, (나) 전역 Lockdown 환경변수·실행 정책만으로 설명되지 않음, Windows 정책과 제한 실행의 상호작용은 미확정, (다) 리치오 CLI shim·환경 구성은 원인으로 재현되지 않음, (라) .NET API 선택은 우회 가능한 직접 실패 요인이다. 직접 CLI와 app-server가 같은 쓰기 권한 이름에서도 다른 언어 모드를 보인 이유는 미확정이다. 샌드박스 자체를 제거하거나 사용자 정책을 바꾸는 수정은 하지 않았다.

## 일 2: 수락 과제별 결과

모두 Codex gpt-6.1-terra high, 열린 폴더, 사용자 턴 1회다. 호출 수는 고유 tool 항목의 **Host·기타 / 공급자 편집 / 셸**이다. 공급자 orchestration wrapper는 중복 합산하지 않는다. 시간은 전송부터 턴 종료 관측까지이며 1초 polling 오차가 있다. Host 시작·화면 사전 확인·사후 검사는 제외한다.

| 번호 | 과제 | 결과 | 사용자 턴 | 호출 수 H/E/S | 초 |
| --- | --- | --- | ---: | --- | ---: |
| 1 | 기존 표·제목 수정 | 완수 | 1 | 2/1/2 | 31.3 |
| 2 | 용어 일괄 변경 | 완수 | 1 | 0/0/5 | 31.7 |
| 3 | 회의록 생성 | 완수 | 1 | 1/0/2 | 22.5 |
| 4 | XLSX 집계 | 완수 | 1 | 2/0/4 | 31.5 |
| 5 | PPTX 추출 | 완수 | 1 | 1/0/4 | 35.8 |
| 6 | PDF 요구사항 추출 | 완수 | 1 | 1/0/3 | 30.8 |
| 7 | Git diff 보고 | 완수 | 1 | 1/0/2 | 22.5 |
| 8 | 주제 파일 이동 | 완수 | 1 | 1/0/5 | 43.8 |
| 9 | CSV 스크립트 실행 | 완수 | 1 | 1/1/5 | 29.7 |
| 10 | 그림·캡션 삽입 | 완수 | 1 | 2/1/5 | 32.3 |
| 11 | 수식 삽입·이스케이프 | 완수 | 1 | 2/1/4 | 28.0 |
| 12 | 활성 문서 경로로 수정 | 완수 | 1 | 2/1/3 | 27.7 |
| 13 | 화면 대행 미지원 안내 | 완수 | 1 | 0/0/0 | 5.6 |

합계 16/5/44, 65호출이다. Terra 13과제에서는 “도구가 없다·권한이 없다”는 이유로 멈춘 답변이 없었다. 과제 2는 .NET ReadAllText·WriteAllText 실패 뒤 Python으로 세 파일을 교체하고 검사했다. 과제 8은 UTF8Encoding 생성·ReadAllText 실패 뒤 Python으로 내용을 읽고 Move-Item으로 이동했다. 두 과제 모두 같은 사용자 턴에서 복구했으므로 추가 시도로 세지 않는다.

### 시간과 반복

과제 8이 43.8초로 가장 길었다. 공급자 JSONL의 호출·결과 timestamp 대조에서 6개 wrapper 실행은 각각 약 0.4~1.5초, 합계 약 5.4초였다. .NET 실패 후 Python 읽기를 더한 1회 복구가 있었지만 수십 초짜리 단일 셸 작업은 없었다. 나머지 약 38초는 호출 사이의 생성·전달·관측을 포함하며 리치오 대기와 모델 생성으로 정확히 분리하지 못했다. 과제 2도 실패 방식에서 다른 방식으로 전환하는 호출이 추가됐다. 둘 다 새 안내가 겨냥하는 불필요한 실패 비용이다. 이전 사본 방식이나 이전 버전과 같은 조건의 속도 비교는 없다.

### Copilot Auto 1회

열린 폴더, high 요청, Auto로 “현황.md의 제목을 납품 현황으로 바꾸고 변경 보기·되돌리기에서 확인할 수 있게 해 달라”고 보냈다. Auto 내부 모델은 식별하지 않았다. 사용자 턴 1회, Host·기타 2 / 편집 0 / 셸 1(승인 대기라 실행 전), 79.0초다. 직전 호출은 성공한 `litzio_host-read_document`였다. 이어 다음 PowerShell 호출이 실행 승인으로 전달됐다. `<folder>`만 실험 경로의 치환이며 명령 본문은 그대로다.

```powershell
$root = '<folder>'; Get-ChildItem -Force $root | Select-Object Name,Length; Get-ChildItem -Force $root -Filter AGENTS.md -Recurse | ForEach-Object { Write-Output "--- $($_.FullName)"; Get-Content -Raw -Encoding UTF8 $_.FullName }
```

승인 카드의 `Allow once / Always allow / Deny / Reject`에는 답하지 않고 중단했다. 원본은 보존됐고 변경 항목은 0개다. 변경 비교 요청은 `This change is unavailable in this Host session.`으로 거절됐고 따라서 undo는 실행하지 않았다. 이는 변경 전의 정상 결과이며 복구 기능 결함 판정이 아니다. 실제 사용자가 한 번 허용한 뒤 완수할지는 이번 예산에서 확인하지 않는다.

## 리치오가 고칠 것과 남긴 후보

| 순서 | 항목 | 근거 | 이번 처리 |
| --- | --- | --- | --- |
| 1 | 제한 언어 모드에서 .NET 거절을 전체 쓰기 권한 부족으로 오인하지 않는 안내 | 직접 app-server 비교, 과제 2·8 | 기존 공급자 패치 우선 안내에 cmdlet·Node 대안 한 항목 추가. 권한 확대 없음 |
| 2 | 수락 실행기의 다섯 격리 경로 명시 | 실행기 정적 대조 | 기존 두 항목에 settings·daemon·plugins settings 세 항목 추가 |
| 3 | Codex의 초기 thread read-only와 turn별 권한 override가 모델 설명에 주는 영향 | 열린 폴더 Luna의 잘못된 read-only 설명·실제 패치 성공 | 후보만 기록. 초기 thread·resume는 read-only, turn은 workspaceWrite인 코드와 대조했지만 인과 미확정 |
| 4 | 실행 결과의 내부 오류·비영 exit와 도구 완료 상태의 차이를 더 쉽게 이해할 수 있는지 | 과제 2·8, 직접 command/exec | 후보만 기록. 공급자 종료 코드와 오류 표시 소유권 조사 필요 |
| 5 | Copilot의 열린 폴더 읽기 셸 승인 대기가 정상 사용자 절차에서 완수되는지 | Auto 1회 | 후보만 기록. 공급자 승인 정책을 약화하지 않음 |

사용자는 쓰기 권한이 있는 폴더에서 .NET 메서드 거절을 만났다면 공급자 파일 편집 또는 UTF-8 cmdlet·Node 편집으로 계속하도록 요청할 수 있다. 읽기 전용이나 실제 Access denied는 다른 문제이므로 사용자가 의도한 권한을 선택해야 한다. 이 안내 수정 뒤 실제 AI를 다시 호출하지 않았으므로 실패 빈도·속도가 개선됐다고 주장하지 않는다.

## 확인하지 못한 것과 검증

- 과제당 한 표본·합성 자료다. 판단 품질·실제 업무 수락·대형 자료·장기 다중 턴·재시작 뒤 복구·설치본·Desktop·외부 업무 시스템은 평가하지 않았다.
- 기존 master의 생산 빌드를 측정했다. 이번 안내 수정의 행동 변화, 직접 CLI/app-server 언어 모드 차이의 내부 원인, Windows 정책 기여도와 열린 폴더 Luna의 잘못된 권한 설명은 미확정이다.
- Codex의 패치 변경 항목은 관측했으나 이번 수락 과제에서 실제 UI 변경 보기·되돌리기 클릭은 하지 않았다. Copilot은 승인 대기 때문에 편집·되돌리기 모두 미확인이다.
- 로컬 확인: production CLI/Editor 빌드, 공급자 연결 회귀 27/27, 설정 화면 작업 폴더 사전 확인, 13과제 출력·검사·원본 보존 대조. 안내 문자열만 고정하는 새 테스트는 추가하지 않았다.
- 직접 시작한 격리 Host는 PID 확인 후 stop·exit와 `closedAt`을 확인했다. 직접 공급자 비교는 종료를 기다렸고 app-server는 finally에서 닫았다. 브라우저는 runner가 연 persistent context를 닫았다. 원시 결과·공급자 로그는 로컬 정보를 포함하므로 공개 첨부하지 않는다.
