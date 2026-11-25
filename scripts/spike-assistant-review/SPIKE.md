# 변환 문서의 비서 검수 측정

공개 합성 PDF를 변환한 뒤 비서가 원본과 대조해 오류를 찾고, 고친 결과가 정답에 더 가까워지는지 측정한다. 제품 코드 변경은 없다. 기준 Host는 실험 시작 때의 master `e73663c3b6cba418dee385c9eb30deb9791d40c0`, 플러그인 작업 사본의 출처는 `7f162d0e513ed085976b6a77c12e9fe4fab7c8b8`다. 원본 LSR 1.1은 13쪽 공개 CC0 합성 표본이다.

## 실행

Windows PowerShell에서 저장소 루트 기준으로 실행한다. 원본 플러그인 저장소는 읽기만 하고 `document-import` 폴더를 `tmp/assistant-review/plugin`에 새로 복사한다. 플러그인 잠금 파일에 따라 작업 사본에 의존성을 설치하고 `node_modules/@litzio/plugin-sdk`에서 이 checkout의 `packages/plugin-sdk`에 junction을 만든다. 확대할 쪽 이미지를 사전에 제공하는 조건은 실행하지 않았다. 세 모델 모두 PDF를 읽었다.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @litzio/cli build
npm ci --prefix tmp/assistant-review/plugin --no-audit --no-fund
New-Item -ItemType Directory -Force tmp/assistant-review/plugin/node_modules/@litzio
New-Item -ItemType Junction -Path tmp/assistant-review/plugin/node_modules/@litzio/plugin-sdk -Target (Resolve-Path packages/plugin-sdk)
pnpm exec tsx scripts/spike-assistant-review/convert.mjs
node scripts/spike-assistant-review/score.mjs
```

변환에는 플러그인의 원본 로드·제외 제안·변환·작성·원본 대응 코드를 사용한다. 그림은 화면과 같은 PDF.js 배율과 crop을 Node 캔버스에 적용하고 공식 CLI `create --input`으로 저장한다. 브라우저 캔버스와 Node 이미지 바이너리의 일치는 비교하지 않았다. 원본 SHA-256은 `63cda884de96dfd0357843a534895f1beb7a10b24f3244398d930817a32b82ea`, 문서 revision은 `cec42786f767dde29fcce6c1e63b7692c775dfa459b30d7f23ba9ff59e973a82`다.

`pnpm exec tsx scripts/spike-assistant-review/run.mjs <회차>`는 유료 Codex 대화를 시작한다. Sol medium, Terra high, Astra medium의 회차 이름은 각각 `sol-1`부터 `sol-3`, `terra-1`부터 `terra-3`, `astra-1`부터 `astra-3`이다. 회차마다 고정 변환본 사본과 Host, 대화를 따로 만든다. 첫 요청에는 원본과 활성 문서 경로만 주고 오류 목록을 요청한다. 완료되면 발견한 차이를 반영하라는 요청을 보내며 각 턴 제한은 15분이다. 승인을 기다리는 턴에 답하지 않는다. 원본 파일과 변환 대응 파일은 포함되며 정답 JSON과 채점 결과는 작업 폴더에 넣지 않는다.

```powershell
# 실제 대화 완료 뒤 회차별 실행
node scripts/spike-assistant-review/score.mjs <회차>
pnpm exec tsx scripts/spike-assistant-review/integrity.mjs <회차...>
pnpm exec tsx scripts/spike-assistant-review/browser.mjs
node scripts/spike-assistant-review/report.mjs
```

브라우저 실행기는 검증 사본을 읽기 위해 별도 HTTP Host를 띄우고 기존 `pnpm browser:test` Windows persistent profile에서 모든 문서를 연다. 원시 대화와 임시 호스트 자료는 로컬에 보관한다. [채점 규칙](rubric.md), [기준 오류](baseline-differences.json), [회차별 결과](results.json), [대표 화면](captures)을 공개 근거로 삼는다.

## 결과와 한계

- 111개 요소에서 변환 직후 80개가 맞았다. Sol은 105·87·87개, Terra는 88·87·104개, Astra는 99·84·86개로 올랐다. 기초 점수가 가장 크게 오른 Sol-1도 기존 정답인 두 쪽주 표현을 바꿨다.
- 14개 오류 묶음 중 Sol은 매회 13개, Terra와 Astra는 매회 12개를 찾았다. 원본에 호출이 없는 쪽주를 참조 누락으로 분류한 지적 1건과 의미가 확실치 않은 지적 1건이 있었다.
- 아홉 건 모두 `check` 유효, 원본 PDF 및 여섯 원래 그림 파일의 해시 유지, 누락된 인식 대상 이미지와 끊긴 내부 링크 0건을 확인했다. 플러그인 원본 대응은 저장본과 다른 revision을 기록하고 있어 아홉 건 모두 `stale`이었다.
- Terra-1·2의 화면에서 번호가 중복됐고 Astra-3의 새 그림 선언 세 곳은 코드 블록으로 렌더링됐다. 세 사례의 문서는 유효성 검사를 통과했다.
- 전체 접근 조건에서 일부 대화가 작업 폴더 밖의 기존 로컬 기록과 소스를 조회했다. 특히 Sol-2·3은 같은 표 2의 과거 작업 기록을 열었다. Host와 입력 폴더는 독립이었지만 공급자 홈은 공유했다. 결과에 다른 문서 유형·권한 모드·PC로 일반화할 근거가 없으며 모델과 환경의 영향을 완전히 분리할 수 없다.

## 현재 결정과 어긋나는 점

없음. ADR-0021의 활성 경로 전달과 기존 문서 직접 수정 경로를 사용했다. 공용 작업을 추가하거나 제품 기능을 바꾸지 않았다.

## 추천

미정. 사람이 대조 화면에서 고른 차이만 비서에게 넘기고 적용 전에 변경 범위를 확인하는 흐름을 우선 검증할 것을 추천한다. 누락을 잘 지적했어도 반영 때 정상 표와 주석을 바꿨고, 저장 이후 원본 대응이 끊겼다. 담당자가 편집 범위 승인과 대응 복구를 갖춘 흐름에서 재현성을 확인하면 채택을 결정할 수 있다.
