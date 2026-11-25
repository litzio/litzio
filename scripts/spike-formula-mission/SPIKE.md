# Ollama 비서의 PDF 수식 교체 실험

## 목적

PDF 가져오기가 수식 영역을 그림으로 저장한 뒤 Ollama 비서가 그 그림들을 수식 블록으로 교체할 수 있는지 확인한다. 모델의 그림 판독, Copilot CLI의 이미지 전달, 이미 LaTeX를 아는 상태에서의 문서 편집을 각각 확인한다.

## 실행

Windows에서 `pnpm install --frozen-lockfile`과 `pnpm --filter @litzio/cli build`를 실행한다. PDF 가져오기 플러그인의 master 작업 트리에 해당 플러그인의 고정 의존성이 준비되어 있어야 한다. 플러그인 저장소와 이미 설치된 Copilot CLI 1.0.114의 실행 파일 또는 shim 디렉터리를 인자로 지정한다.

```powershell
./scripts/spike-formula-mission/prepare.ps1 -PluginRepository $pluginRepository
$work = 'tmp/formula-mission'
node scripts/spike-formula-mission/ollama-direct.mjs "$work/baseline" "$work/A.json"
pnpm exec tsx scripts/spike-formula-mission/task-driver.ts probe "$work/baseline" "$work/probe" $copilotCliDirectory
foreach ($repeat in 1..3) {
  foreach ($task in 'B','C') {
    pnpm exec tsx scripts/spike-formula-mission/task-driver.ts $task "$work/baseline" "$work/$task-$repeat" $copilotCliDirectory
    if ($LASTEXITCODE) { throw "Measurement failed to run." }
  }
}
./scripts/spike-formula-mission/run-hint.ps1 -CopilotCliDirectory $copilotCliDirectory
pnpm exec tsx scripts/spike-formula-mission/rescore.ts $work
```

Copilot CLI의 HOME, USERPROFILE, COPILOT_HOME, AppData는 매번 격리한다. 기존 설치형 Litzio와 daemon은 사용하지 않는다. 각 B·C·힌트 반복은 별도의 Host, 문서 사본, 프록시, 대화를 사용한다. `probe`는 사용자가 그림 경로를 직접 준 보조 실험이다. `ollama-direct.mjs`와 Host 실행기, 기록 프록시는 [2026-11-24 pi 실험 코드](https://github.com/litzio/litzio/tree/spike/2026-11-24-ollama-pi-audio-tasks/scripts/spike-pi-audio)에서 가져왔다. 결과와 원문 요청·응답·대화는 `tmp/formula-mission/`에 보관한다.

기준 변환은 persistent browser profile 및 격리 HTTP Host에서 PDF 가져오기 화면으로 한 번 완료했다. 뺄 쪽 제안대로 1쪽을 제외했고, `formula-as-image` 표시와 공개 정답 자료의 쪽 및 영역을 연결했다. 모델은 로컬 `gemma4:e4b` 하나를 사용한다. B·C는 전체 접근과 추론 강도 `medium`이며, 각 턴을 최대 10분 관찰한다. 승인 요청에는 답하지 않는다.

## 판정

- A는 원문을 보존하고 코드 펜스에서 수식 후보를 추출한다. 공백과 바깥 수식 구분자를 뺀 정답 일치, 그리고 동치 표기의 사람 판독을 각각 기록한다.
- B는 첫 번째 그림의 경로와 정답 LaTeX를 제공한다. C는 같은 문서를 활성 문서로 주고 그림 수식을 모두 바꾸도록 요청한다.
- B·C는 공식 CLI `check`의 유효성·쓰기 가능 여부, 원래 자리 수식 블록의 LaTeX와 표시 번호, 대상 그림 블록 제거, 캡션, 다른 블록의 Core canonical 원문과 `inspect` 읽기 모델을 비교한다. 수식 `(1)`–`(3)`은 원본 PNG 안에 있으며 대상에 들어 있던 문서 캡션은 세 곳 모두 빈 값이다. 고정 번호는 별도로 기록한다.
- 판정기는 직접 수행한 CLI 대조군에서 한 그림과 세 그림의 교체를 각각 통과시켰다. 각 그림에 대해 `remove-block`, `insert-equation`, `update-enumerator`를 같은 `apply-batch` 배열에서 실행하고 기준 revision으로 한 번에 저장했다.

## 결과와 검증 범위

- A는 LaTeX 소스가 공백·구분자를 제외하고 1/9 일치했다. 사람은 글꼴·번호·첨자 표기 차이를 감안해 수학적 내용 6/9를 일치로 봤다. 세 번째 식에서 세제곱근과 합의 상한을 세 번 모두 다르게 읽었다.
- 보조 턴의 Copilot `view`는 그림을 열었지만 직후 Ollama 요청에 이미지가 없었다. 모델은 `/api/show`에서 `vision`을 보고했다.
- B 기본 0/3, C 전체 0/3이었다. 정답을 준 B에서는 기존 파일에 새 문서 도구를 호출했고, C는 그림 세 개를 찾고 PNG를 열지 않았다. 한 실행에서는 그림을 임시 문구로 바꾸면서 이웃 문단의 구조까지 바꿨다.
- 기존 파일용 CLI 배치를 지시문에 추가한 B는 1/3이었다. 성공한 턴은 기존 그림을 같은 위치의 수식으로 바꾸고 `check`를 실행했다. 표시 번호 1은 자동 번호였다. 다른 두 턴은 `inspect`를 플러그인 작업으로 호출했고 CLI를 쓰지 않았다.
- `/api/ps`의 컨텍스트는 65,536이었다. 비서 요청에서 관측된 최대 입력은 기본 33,987, 추가 38,918이었다. 질문 대기에서 중단한 두 요청은 사용량을 받지 못했다.

현재 제품 결정과 어긋나는 점은 없다. 제품의 엔진·공식 쓰기 경로를 유지했고, 임시 지시문은 비교 측정 뒤 복원했다. PDF 가져오기 화면에서 원본 연결을 다시 여는 동작, 다른 문서·모델, 기존 수식이 여러 개일 때의 자동 번호는 확인하지 않았다. 결론은 미정이다. 먼저 동일 PNG를 `view`로 열었을 때 Ollama 요청에 실제 이미지 파트가 도착하는지 수락 시험으로 확인하는 것을 권한다.
