# 스파이크: Rust로 만든 얇은 CLI가 CLI 호출 비용을 의미 있게 줄이는가

- 날짜: 2026-11-27 (KST)
- 브랜치: `spike/rust-cli-client` (기준 `origin/master` 223eec40)
- 태그: `spike/2026-11-27-rust-cli-client`
- 결론: **미정** (소유자 결정 필요)

## 질문

1. 설치판과 같은 실행 방식에서 CLI 한 번 호출 비용은 얼마인가? 기동, 번들 로드, Host 왕복으로 나눈다.
2. 비서는 보통 작업 한 턴에서 CLI를 몇 번 부르는가?
3. Host 호출만 하는 Rust 단일 실행 파일은 그 비용을 얼마나 줄이는가? 호출 수 × 절감으로 보면 의미가 있는가?

## 만든 것

| 파일 | 내용 |
| --- | --- |
| `src/main.rs` | Rust 시제품 `litzio-rs.exe`. `plugins list`, `operation invoke`, `local-write-statistics`만 처리한다. Node CLI(`packages/cli/src/plugins.ts`, `cli.ts`)와 같은 인수 검사, `/daemon/health` 프로토콜 확인, 요청, 출력 형식, 종료 코드를 따른다. 쓰기 계열 명령이 잡는 app-reset 가드(`apps/editor/server/reset-guard.ts`)도 같은 파일 형식으로 구현했다. 문서를 읽거나 해석하지 않는다. |
| `bench/bench.mjs` | 실행 경로 5종 × 명령 7종의 시간을 20회씩 교차 순서로 잰다(앞 2회는 버림). Host 왕복만 따로 재는 in-process 측정도 한다. |
| `bench/cold.mjs` | Host를 다시 띄운 직후의 첫 호출을 잰다. |
| `bench/mem.ps1` | 프로세스 하나의 최대 working set·private bytes를 잰다(자식 프로세스 제외). |
| `bench/make-shims.ts` | 실제 `assistantCliEnvironment()`로 비서용 shim을 만들고, Desktop CLI 통합 shim(`CLI_SHIM`)과 같은 줄의 `.cmd`를 절대 경로로 만든다. PATH·레지스트리는 건드리지 않는다. |
| `bench/assistant-count.mjs` | 격리 Host에 비서 턴을 보내고 실제 CLI 실행 횟수를 명령별로 센다. |
| `bench/stop-host.mjs` | Host를 `/daemon/stop` 계약으로 정상 종료한다. |
| `results/warm.json`, `results/cold.json` | 측정 원자료(숫자만). |

### 선택한 crate

| crate | 이유 |
| --- | --- |
| `ureq` 2 (`default-features = false`) | 동기 HTTP/1.1 클라이언트. async 런타임(tokio)이 필요 없고, TLS를 끄면 로컬 Host용으로 가장 작다. |
| `serde_json` (`preserve_order`) | Host 응답의 키 순서를 유지해 `JSON.stringify({ target, ...value })`와 같은 바이트를 낸다. |

프로세스 시작 시각은 crate 없이 `kernel32`의 `GetProcessTimes`를 직접 선언해 읽는다. `ureq`가 `url`·`idna`·ICU를 끌고 와 `Cargo.lock`에는 49개 패키지가 있다. 실행 파일은 630,784바이트다(`opt-level = "s"`, LTO, strip).

## 실행 방법

전제: 이 worktree에서 `pnpm install`, Electron 바이너리 내려받기(`node node_modules/.pnpm/electron@*/node_modules/electron/install.js`), `pnpm --filter @litzio/cli build`.

```sh
# 1) Rust 시제품 (이 PC에는 MSVC 링커가 없어 이미 설치된 GNU 툴체인을 썼다)
cd spikes/rust-cli && cargo +stable-x86_64-pc-windows-gnu build --release

# 2) 격리 Host: Electron-as-Node로 설치판 daemon과 같은 방식, 모든 데이터 폴더는 임시 폴더
ELECTRON_RUN_AS_NODE=1 LITZIO_DATA_DIR=<tmp>/host-data LITZIO_RESET_DIR=<tmp>/reset-guard \
LITZIO_DAEMON_DIR=<tmp>/daemon-dir LITZIO_ASSISTANT_CWD=<tmp>/assistant \
  <electron.exe> --disable-warning=DEP0040 packages/cli/dist/cli.mjs daemon run --root <tmp>/docs --port 38917
#    샘플 플러그인: plugins scaffold --id sample-greet --template greet, plugins install sample-greet

# 3) shim과 설정 파일(config: electron, node, cli, rust, host, doc, greet, dataDir, resetDir, daemonDir, assistantDir, 두 shim 경로)
pnpm exec tsx spikes/rust-cli/bench/make-shims.ts <tmp>/shims <electron.exe> packages/cli/dist/cli.mjs

# 4) 측정
node spikes/rust-cli/bench/bench.mjs <config.json> 20 <out.json>
node spikes/rust-cli/bench/cold.mjs <config.json> 8 <out.json>     # 2)의 Host를 먼저 멈춘 뒤
pwsh -File spikes/rust-cli/bench/mem.ps1 -Runs 5 -Exe <exe> -Arguments '<args>'
node spikes/rust-cli/bench/assistant-count.mjs http://127.0.0.1:38917 <docs> full-access "<요청>" <out.json>
node spikes/rust-cli/bench/stop-host.mjs http://127.0.0.1:38917
```

실행 경로 다섯 가지:

| 이름 | 실제 실행 | 쓰는 곳 |
| --- | --- | --- |
| node | `node cli.mjs` | 기준선(npm 배포판) |
| electron | `ELECTRON_RUN_AS_NODE=1 electron.exe cli.mjs` | 설치판의 핵심 실행 |
| desktop-shim | `cmd /c litzio.cmd` → Electron → `cli.mjs` | Desktop의 "CLI 통합"으로 PATH에 넣은 명령 |
| assistant-shim | `cmd /c litzio.cmd` → Electron `cli.cjs` → `spawnSync` Electron `cli.mjs` | 비서가 부르는 Host 전용 shim(`assistant-cli.ts`) |
| rust | `litzio-rs.exe` | 이번 시제품 |

환경: Windows 11, Electron 45.4.1, Node 24.22.3, rustc 1.100.0(GNU 툴체인). 합성 문서 1개(생산 라인 검사 주간 보고, 제목 4개·표 1개·목록 1개).

## 결과

### 1. 호출당 시간 (warm, 20회, ms, 중앙값 / p95)

| 명령 | node | electron | desktop-shim | assistant-shim | rust |
| --- | --- | --- | --- | --- | --- |
| `plugins list --host` | 808 / 1070 | 708 / 892 | 743 / 875 | **820** / 1025 | **32** / 61 |
| `operation invoke --host` | 824 / 1433 | 708 / 1006 | 749 / 940 | **832** / 957 | **33** / 42 |
| `local-write-statistics --host` | 277 / 386 | 204 / 255 | 238 / 264 | **298** / 402 | **25** / 33 |
| `inspect` (로컬 Core, 읽기) | 300 / 360 | 218 / 243 | 254 / 336 | 314 / 370 | 해당 없음 |
| `check` (로컬 Core, 읽기) | 302 / 403 | 223 / 275 | 266 / 315 | 328 / 629 | 해당 없음 |
| `update-title --dry-run` (로컬 쓰기) | 811 / 898 | 711 / 808 | 766 / 838 | 844 / 1211 | 해당 없음 |
| `--version` | 277 / 352 | 191 / 221 | 229 / 286 | 295 / 475 | 해당 없음 |

### 2. 비용 분해 (electron 경로, warm 중앙값)

| 구간 | ms | 근거 |
| --- | --- | --- |
| `cmd.exe` 시작(.cmd shim) | 32 | `cmd /c exit 0` |
| Electron-as-Node 기동 | 47 | `electron -e 0` (맨 Node는 59) |
| 번들 로드 | 약 144 | `--version` 191 − 기동 47 |
| **app-reset 가드: PowerShell + WMI로 자기 프로세스 시작 시각 조회** | **약 490~505** | `plugins list` 708 − `local-write-statistics` 204, `update-title --dry-run` 711 − `check` 223 |
| Host 왕복(새 연결, 이미 떠 있는 프로세스에서) | 1.4~9 | `local-write-statistics` 1.4, `plugins list` 4.4, `operation invoke` 9.0 |
| 비서 shim의 두 번째 Electron 기동 + `cli.cjs` | 약 60~83 | assistant-shim − desktop-shim |
| Host 재시작 직후 첫 요청(cold Host) | 약 +85~95 | rust 첫 호출 114~121 vs 32, desktop-shim 첫 호출 821~839 vs 735~752 (8회 재시작) |

가장 큰 단일 비용은 Rust와 무관한 **가드**다. `cli.ts` 진입점은 읽기 전용(`check`, `inspect`, `compare`, `local-write-statistics`)이 아닌 모든 명령에서 `ResetGuard().actor("cli")`를 잡는다. 이때 `daemon-state.ts`의 `processStart(process.pid)`가 Windows PowerShell 5.1을 띄워 `Get-CimInstance Win32_Process`로 자기 프로세스의 `CreationDate`를 읽는다. 그래서 `plugins`·`operation`과 모든 문서 쓰기 명령은 호출마다 약 0.5초를 더 쓰고, 그 PowerShell 프로세스는 최대 working set이 약 81MB다. 인수가 틀려 Host에 닿지 않는 호출(아래 과제 3의 `plugins inspect`)도 이 비용을 낸다.

Rust 시제품은 같은 값을 `GetProcessTimes`로 읽는다. 같은 PID에서 WMI 값과 정확히 일치했다(639313754637649730). 그래서 가드를 포함하고도 25~33ms가 나온다.

### 3. 메모리와 크기

| 대상 | 최대 working set (MB) | 최대 private (MB) |
| --- | --- | --- |
| `electron -e 0` | 49.2 | 19.3 |
| electron `cli.mjs plugins list` | 89.6 | 59.2 |
| electron `cli.mjs inspect` | 83.4 | 55.2 |
| node `cli.mjs plugins list` | 103.5 | 92.0 |
| 가드가 띄우는 PowerShell WMI 조회 | 80.7 | 65.1 |
| **rust `plugins list`** | **5.2** | **0.8** |

비서 shim은 Electron을 두 번 띄우므로 위 electron 값에 감싸는 쪽 Electron(약 49MB)이 더해진다. 감싸는 쪽은 직접 재지 않고 `-e 0` 값으로 추정했다. 크기는 Rust 실행 파일이 0.6MB다. CLI 번들 폴더는 Editor 빌드와 npm 압축본을 포함해 약 31MB이고, Electron 런타임(358MB)은 앱과 공유하므로 CLI만의 추가분이 아니다.

### 4. 비서가 한 턴에 부르는 CLI 수

Codex `gpt-6-luna` low, 권한 `full-access`(Host 기본값), 격리 Host, 합성 문서. 과제마다 1회만 실행했다.

| 과제 | 턴 시간 | 셸 명령 | CLI 실행 | 내역 |
| --- | --- | --- | --- | --- |
| T1 문서를 읽고 불량률이 가장 높은 공정 요약 | 8초 | 0 | **0** | Host 도구 `read_document` 1회 |
| T2 목록에 항목 추가 후 검사 | 22초 | 2 | **1** | `check` 1 (편집은 PowerShell로 파일을 직접 고침) |
| T3 플러그인 작업 호출, 결과를 문단에 덧붙이고 검사 | 50초 | 9 | **11** | Host 3(`plugins list`, 잘못된 `plugins inspect`, `operation invoke`), 로컬 쓰기 1(`replace-text`), 로컬 읽기 3(`inspect` 2, `check` 1), 도움말 4(`--help`, `operation --help`, `replace-text --help`, `check --help`) |

비서 지시문(`apps/editor/server/assistant/AGENTS.md`, `litzio-guide/SKILL.md`)은 기존 문서를 공급자 패치로 고치고 `litzio check`로 검사하라고 안내한다. 쓰기 CLI는 전체 접근에서만 쓰라고 하고, Host 호출은 플러그인 쪽(`plugins …`, `operation invoke`)만 안내한다. 측정에서도 문서 작업의 CLI 호출은 대부분 로컬 Core 명령이었다.

같은 턴에서 Codex는 셸 명령마다 PowerShell 7을 새로 띄운다. `pwsh -Command "exit 0"`은 이 PC에서 672~689ms였다(프로필 로드 포함). T3의 셸 9회만으로 약 6초다. 이 비용은 리치오 CLI 밖에 있다.

### 5. 총 절감 추정 (T3, assistant-shim warm 중앙값 기준)

| 시나리오 | T3의 CLI 시간 | 줄어드는 시간 | 턴 50초 대비 |
| --- | --- | --- | --- |
| 현재 | 약 5.5초 (Host 3 × 약 0.82 + 쓰기 0.84 + 읽기 0.96 + 도움말 4 × 약 0.29) | — | 11% |
| A. Host 호출 3개만 Rust로 | 약 3.1초 | **약 2.4초** | 4.8% |
| B. Rust 없이 TS만: 가드에서 PowerShell 제거(4회 × 약 0.49) + 비서 shim을 Electron 한 번으로(11회 × 약 0.07) | 약 2.7초 | **약 2.7초** | 5.4% |
| B 다음에 A를 더함: Host 호출 약 0.23초가 약 0.03초로 | 약 2.1초 | B에 더해 약 0.6초 | +1.2% |

T1은 CLI 호출이 없고, T2는 로컬 `check` 1회(약 0.33초/22초)라 Rust Host 클라이언트로 줄일 것이 없다. B는 T2에도 약 0.07초가 적용된다. 도움말 호출에서 번들 전체를 읽는 비용(약 144ms)을 늦은 로딩으로 줄이는 방안은 재지 않았다.

명령 수로 보면 CLI 최상위 명령 70개 가운데 62개가 로컬 Core 문서 명령이다(`check`, `inspect`, `compare`, `create`, `format`, `apply-batch`, `replace-text`, `insert-*` 16개, `update-*` 24개, `move-*` 5개, `remove-*` 7개, `split-paragraph`, `merge-paragraph`, `convert-block`). 나머지 8개 가운데 Host만 부르는 것은 `plugins`, `operation`, `local-write-statistics`이고, `assistant`는 동작별로 섞여 있다(`import-image`·`settings`·`configure`는 로컬). `folder-trash`는 `--host`를 고를 수 있고, `templates`·`app-reset`·`daemon`은 로컬 파일이나 프로세스를 다룬다. Rust 시제품이 맡을 수 있는 범위는 이 소수뿐이다.

### 6. 출력 일치

같은 Host에서 Node CLI와 Rust의 stdout·stderr·종료 코드를 비교했다(`requestId`만 정규화). 다음 경우가 모두 같았다: `plugins list`(끝 `/` 있는 origin 포함), 정상 `operation invoke`, 입력 schema 오류(`--json` 있음·없음), 없는 operation, `local-write-statistics`, `--host` 없음, 닫힌 포트, 가드의 `exclusive.json`이 있을 때의 거부.

## 검증하지 않은 것과 한계

- NSIS로 설치한 실제 앱이 아니다. 저장소의 Electron 바이너리와 `packages/cli/dist` 번들로 같은 실행 구조를 재현했고, Desktop shim은 junction 대신 절대 경로를 썼다. 서명된 설치 경로, Defender·SmartScreen의 첫 실행 검사는 재현하지 않았다.
- OS 수준의 cold(재부팅 직후, 파일 캐시 비움)는 재지 못했다. 관리자 권한 없이 캐시를 비울 수 없다. 이 기록의 cold는 Host 재시작 직후다.
- PC 한 대, warm 20회, cold 8회다. 비서는 모델 하나(luna low)로 과제 3개를 1회씩만 돌렸다. 다른 모델·과제에서는 호출 수가 달라질 수 있다(T3의 도움말 4회와 잘못된 명령 1회는 작은 모델의 탐색 습관일 수 있다). 턴 시간은 2초 간격 조회라 ±2초 오차가 있다.
- Rust 시제품은 http만 지원하고(https 없음) 명령 3개만 처리한다. 없는 `plugins` 동작의 usage 문구는 Node와 다르다. 가드 파일 이름에 UUID 대신 시작 시각과 나노초 시각을 쓴다.
- 이 PC에 MSVC 링커가 없어(Git Bash의 coreutils `link.exe`가 먼저 잡힘, VS Build Tools 없음) 이미 설치된 GNU 툴체인으로 빌드했다. MSVC 빌드의 크기·시간은 재지 않았다.
- 비서는 사용자의 기존 Codex 환경(로그인·기억)을 그대로 쓴다. 측정 중 Codex가 그 기억 파일을 검색한 명령도 셸 명령 수에 포함됐다.
- 관찰(재지 않음): 이 PC의 공유 reset-guard 폴더에는 오래된 actor 파일이 1,400개 넘게 남아 있었다. `exclusive()`가 살아 있는 PID마다 같은 PowerShell 조회를 하므로 app-reset이 느려질 수 있다.

## 현재 결정과 어긋나는 점

- [AGENTS.md](../../AGENTS.md)와 [ADR-0015](../../docs/adr/0015-shared-host-operations.md)는 CLI를 Host 공용 작업과 Core operation을 부르는 얇은 인터페이스 **하나**로 두고, 새 기능마다 CLI 명령을 함께 제공하게 한다. Rust 클라이언트를 들이면 같은 명령의 인수 검사, origin 검사, 출력·종료 코드 규칙, app-reset 가드 프로토콜이 두 언어에 생긴다. 문서 의미는 재구현하지 않지만 인터페이스 의미가 둘로 갈라진다.
- 시제품은 `reset-guard.ts`의 파일 형식과 `processStart`의 값 규칙(.NET ticks, 마이크로초 절삭)을 Rust로 다시 구현했다.
- ADR·계약 문서는 바꾸지 않았다.

## 추천 결론 (결론은 미정)

**추천: Rust CLI는 지금 들이지 않는다.** 먼저 TypeScript 안에서 큰 비용 두 가지를 없애고 다시 잰다.

1. app-reset 가드가 호출마다 PowerShell+WMI를 띄우는 비용(약 0.5초, 메모리 약 81MB)을 없앤다. 방법은 따로 정한다. 예를 들어 Host만 부르는 명령은 Host가 이미 자기 가드를 잡고 있으므로 CLI 가드를 생략하거나, 자기 프로세스 시작 시각을 PowerShell 없이 얻는 방법이 있다.
2. 비서 shim이 Electron을 두 번 띄우는 구조(`cli.cjs` → `spawnSync`)를 한 번으로 줄인다(호출마다 약 70ms).

두 가지만으로 T3에서 Rust보다 더 많이 줄고(약 2.7초 대 2.4초), 로컬 쓰기 명령에도 적용된다. 그 뒤 Rust가 더 줄일 수 있는 것은 Host 호출 1회당 약 0.2초다. 이번 측정에서는 턴당 Host 호출이 0~3회였고, 셸(pwsh) 기동만 해도 명령당 약 0.7초가 든다. 비용 대비 이득이 작다.

Rust를 다시 볼 조건: 위 두 개선 뒤에도 비서 턴에서 Host 호출(`operation invoke` 등)이 턴마다 많이(예: 10회 이상) 반복되는 실제 업무 흐름이 확인될 때.

결론을 내려면 소유자가 위 두 TS 개선을 이슈로 진행할지 정해야 한다.

### 도입 비용 (Rust를 들일 경우)

- 빌드 도구: Windows에서 MSVC Build Tools(또는 GNU 툴체인 공식 채택)와 rustup을 개발 PC와 CI에 둔다. 지금 이 PC에는 MSVC가 없다.
- CI: Rust 빌드·테스트 job과 Node CLI와의 출력 일치(parity) 테스트를 추가한다. 캐시와 시간이 늘어난다.
- 패키징: npm CLI 패키지는 플랫폼 무관이다. Rust 실행 파일은 Windows·macOS·Linux와 아키텍처마다 따로 빌드해야 한다. Desktop의 `resources`와 두 shim(Desktop·비서)의 실행 경로도 바꾼다.
- 서명: 실행 파일이 하나 더 늘어 코드 서명과 SmartScreen·Defender 평판 대상이 된다.
- 의존성: `ureq`가 49개 crate를 끌고 온다. 라이선스 고지(`THIRD_PARTY_LICENSES`), 보안 공지 추적, 갱신 대상이 Rust 생태계까지 넓어진다.
- 의미 중복: 명령 목록, 인수 문법, 도움말 문구, 출력 형식, 오류의 `outcome`·`reason` 규칙, app-reset 가드를 두 곳에서 맞춰야 한다. 새 Host 명령은 두 번 구현하거나, Rust가 모르는 명령을 Node CLI로 넘기는 이중 경로를 둬야 한다. 넘기는 경로는 로컬 명령마다 Rust 기동(약 25ms)을 더한다. ADR-0015의 "CLI 하나" 전제와 부딪힌다.

## 코드 위치

- 태그: `spike/2026-11-27-rust-cli-client`
- 브랜치: `spike/rust-cli-client`
- 폴더: `spikes/rust-cli/`
