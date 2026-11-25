# 비서의 변환 문서 검수와 낮은 추론 강도

같은 원본을 대조하고 고치는 두 턴에서 추론 강도를 낮추면 오류 발견 수, 수정 범위, 기존 정답 손상, 시간·토큰이 어떻게 달라지는지 확인했다.

## 실행

[앞 스파이크 실행 안내](https://github.com/litzio/litzio/blob/1a434500d66fac045d2d5406b2a062c309d6b094/scripts/spike-assistant-review/SPIKE.md)와 같은 원본과 플러그인 커밋, CLI 빌드, 변환, 채점기를 사용한다. 원본 SHA-256은 `63cda884de96dfd0357843a534895f1beb7a10b24f3244398d930817a32b82ea`이고 문서 revision은 `cec42786f767dde29fcce6c1e63b7692c775dfa459b30d7f23ba9ff59e973a82`다. 기준 오류 14묶음과 111개 채점 요소가 같고 기준 점수는 80개다.

```powershell
# 카탈로그만 조회한다.
pnpm exec tsx scripts/spike-assistant-review/run.mjs sol-low-1 --preflight
# 다음 명령은 유료 대화 한 개(두 턴)를 시작한다.
pnpm exec tsx scripts/spike-assistant-review/run.mjs sol-low-1
node scripts/spike-assistant-review/score.mjs sol-low-1
pnpm exec tsx scripts/spike-assistant-review/integrity.mjs sol-low-1
pnpm exec tsx scripts/spike-assistant-review/browser.mjs sol-low-1
```

모델별로 `sol-low-1`부터 `sol-low-3`, `terra-low-1`부터 `terra-low-3`, `astra-low-1`부터 `astra-low-3`을 쓴다. 각 대화에는 새 Host와 새 사본을 사용한다. 두 요청문, 전체 접근, 턴당 15분, 미응답 승인 조건은 이전과 같다. 모델 간 실행은 겹쳤다. 같은 모델의 회차는 순차 실행했고, Sol 2의 반영을 기다리는 동안 Sol 3을 시작했다. 채점에 필요한 자료는 검사자 작업 위치에 보관했다.

`session-usage.mjs`는 대화 ID에 대응하는 로컬 Codex 세션 파일의 두 턴 실행 설정과 사용량을 요약한다. `blocks.mjs`는 전후 Markdown과 해당 회차의 점수 JSON을 받아 CLI `inspect`의 최상위 블록 차이를 센다. 원시 대화, 세션 파일, 사본, 스크린샷은 로컬 증거다.

## 결과와 한계

세 모델 모두 none·minimal을 보고하지 않았다. low 9개 대화의 18개 턴이 끝났고 실제 effort는 모두 low였다. Sol은 13·12·13, Terra는 12·11·12, Astra는 12·12·12묶음을 찾았다. 기존 정답 손상은 앞 조건의 7/9회에서 5/9회로 줄었고, 완전히 맞춘 회차는 0회였다. Terra는 변경 블록 중앙값이 25개에서 20개로 줄고 세 회차 모두 기존 정답을 지켰으나 수식을 구조화하지 못했다. Sol의 지적 중앙값은 85초에서 69초였지만 반영은 143초에서 177초였고 한 회차에 523초가 걸렸다.

[회차별 수치](results.json)에는 공식 검사와 실제 화면, 원본 열람과 수정 방식, 폴더 밖 조회의 관찰 범위를 함께 기록했다. 이 측정은 Windows 한 PC, 공개 합성 PDF 한 개, 조건당 세 회다. 전체 접근에서 유지되는 공급자 환경과 회차 간 도구 선택이 결과에 영향을 줄 수 있다. 토큰은 Codex가 기록한 사용량이며 과금액과 내부 재시도 횟수는 확인할 수 없다.

## 현재 결정과 어긋나는 점

없음. [범용 비서 ADR](../../docs/adr/0021-general-agent-assistant.md)의 전체 접근과 활성 문서 경로 전달을 사용했다.

## 추천

미정. Sol low로 지적하고 사람이 선택한 비수식 수정은 Terra low로 반영을 시험할 후보로 둔다. 수식 회귀와 기존 정답 손상을 함께 확인하고, 다른 표본 및 선택 블록만 수정하는 조건에서 재현성을 확인한 뒤 채택 여부를 판단한다.
