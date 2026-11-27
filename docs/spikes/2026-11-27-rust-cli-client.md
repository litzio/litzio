# 2026-11-27 Rust로 만든 얇은 CLI의 호출 비용 절감

- Status: Historical
- Date: 2026-11-27 (브랜치 마지막 커밋일, KST)
- Last verified: 2026-11-27, Windows 11, Electron 45.4.1(`ELECTRON_RUN_AS_NODE`), Node 24.22.3, rustc 1.100.0(GNU 툴체인).

## 목적

설치판 CLI는 Electron 실행 파일을 Node처럼 띄운다. 비서가 CLI를 자주 부르므로 다음을 확인한다.

1. 설치판과 같은 실행 방식에서 CLI 한 번의 비용을 기동, 번들 로드, Host 왕복으로 나누면 얼마인가?
2. 비서는 작업 한 턴에서 CLI를 몇 번 부르는가?
3. Host 호출만 하는 Rust 단일 실행 파일이 그 비용을 얼마나 줄이며, 호출 수 × 절감으로 의미가 있는가?

## 무엇을 만들었나

- Rust 시제품 `litzio-rs.exe`(0.6MB): `plugins list`, `operation invoke`, `local-write-statistics`만 처리한다. Node CLI와 같은 인수 검사, Host 프로토콜 확인, 출력, 종료 코드, app-reset 가드 파일 형식을 따른다. 의존성은 `ureq`(TLS 끔)와 `serde_json`이며, 전이 의존성까지 49개 패키지다. 문서는 다루지 않는다.
- 측정 도구: 실행 경로 다섯 가지(맨 Node, Electron-as-Node, Desktop CLI 통합 shim, 비서 shim, Rust)의 warm 20회와 Host 재시작 직후 측정, 프로세스별 최대 메모리 측정, 비서 턴의 CLI 실행 횟수 집계.
- 격리 Host는 Electron-as-Node로 띄웠다. 데이터·daemon·reset-guard·비서 작업 폴더를 모두 임시 폴더로 돌렸고, 합성 문서 하나와 SDK 예제 플러그인 하나를 썼다.

## 결과·관찰

### 호출당 시간 (warm 중앙값 / p95, ms)

| 명령 | Desktop shim | 비서 shim | Rust |
| --- | --- | --- | --- |
| `plugins list --host` | 743 / 875 | 820 / 1025 | 32 / 61 |
| `operation invoke --host` | 749 / 940 | 832 / 957 | 33 / 42 |
| `local-write-statistics --host` | 238 / 264 | 298 / 402 | 25 / 33 |
| `inspect` (로컬 Core) | 254 / 336 | 314 / 370 | 해당 없음 |
| `check` (로컬 Core) | 266 / 315 | 328 / 629 | 해당 없음 |
| `update-title --dry-run` (로컬 쓰기) | 766 / 838 | 844 / 1211 | 해당 없음 |

### 비용 분해 (Electron 경로)

| 구간 | ms |
| --- | --- |
| `.cmd` shim의 `cmd.exe` | 약 32 |
| Electron-as-Node 기동 | 약 47 |
| 번들 로드 | 약 144 |
| app-reset 가드의 PowerShell + WMI 조회 (읽기 전용이 아닌 명령만) | 약 490~505 |
| Host 왕복 | 1.4~9 |
| 비서 shim의 두 번째 Electron 기동 | 약 60~83 |
| Host 재시작 직후 첫 요청 | 약 +85~95 |

가장 큰 비용은 Rust와 무관하다. CLI 진입점은 `check`·`inspect`·`compare`·`local-write-statistics`를 뺀 모든 명령에서 app-reset 가드를 잡는다. 이때 자기 프로세스 시작 시각을 얻으려고 Windows PowerShell을 띄워 WMI를 조회한다. 그래서 `plugins`·`operation`과 모든 문서 쓰기 명령은 호출마다 약 0.5초를 더 쓰고, 그 PowerShell은 최대 working set이 약 81MB다. Rust는 같은 값을 `GetProcessTimes`로 읽었고 WMI 값과 일치했다.

최대 working set은 Electron `cli.mjs` 실행이 약 84~90MB, 맨 Node가 약 104MB, Rust가 약 5MB였다.

### 비서의 CLI 호출 수

Codex `gpt-6-luna` low, 전체 접근, 과제마다 1회 실행했다.

| 과제 | 턴 시간 | CLI 실행 | 내역 |
| --- | --- | --- | --- |
| 문서 읽고 요약 | 8초 | 0 | Host 도구 `read_document` 사용 |
| 목록에 항목 추가 후 검사 | 22초 | 1 | `check` |
| 플러그인 작업 호출 결과를 문단에 덧붙이고 검사 | 50초 | 11 | Host 3, 로컬 쓰기 1, 로컬 읽기 3, 도움말 4 |

CLI 최상위 명령 70개 가운데 62개가 로컬 Core 문서 명령이라 Rust Host 클라이언트가 맡을 수 없다. Codex는 셸 명령마다 PowerShell 7을 새로 띄우며, 그 기동은 명령당 약 0.7초였다. 이 비용은 리치오 CLI 밖에 있다.

### 총 절감 추정 (세 번째 과제)

| 시나리오 | 줄어드는 시간 | 턴 50초 대비 |
| --- | --- | --- |
| Host 호출 3개를 Rust로 | 약 2.4초 | 4.8% |
| Rust 없이 TS만 고침: 가드의 PowerShell 제거, 비서 shim을 Electron 한 번으로 | 약 2.7초 | 5.4% |
| TS를 고친 뒤 Rust를 더함 | 추가 약 0.6초 | +1.2% |

### 검증하지 않은 것

- NSIS 설치판이 아니라 같은 실행 구조를 재현했다. 서명된 설치 경로와 Defender 첫 실행 검사는 재현하지 않았다.
- OS 수준 cold(재부팅 직후)는 재지 못했다. cold는 Host 재시작 직후만 쟀다.
- PC 한 대에서 쟀다. 비서는 모델 하나로 과제 3개를 1회씩 돌렸다. 호출 수는 모델·과제에 따라 달라질 수 있다.
- 이 PC에 MSVC 링커가 없어 이미 설치된 GNU 툴체인으로 빌드했다. Rust 시제품은 http만 지원한다.

## 현재 결정과 어긋나는 점

- [AGENTS.md](../../AGENTS.md)와 [ADR-0015](../adr/0015-shared-host-operations.md)는 CLI를 Host 공용 작업과 Core operation을 부르는 얇은 인터페이스 하나로 두고, 새 기능마다 CLI 명령을 함께 제공하게 한다. Rust 클라이언트는 문서 의미를 재구현하지 않는다. 하지만 같은 명령의 인수 문법, 출력·오류 규칙, app-reset 가드 프로토콜을 두 언어에 둔다.
- ADR·계약 문서는 바꾸지 않았다.

## 결론/후속

미정. 소유자가 다음 두 TypeScript 개선을 이슈로 진행할지 정해야 결론이 난다. 에이전트의 추천은 Rust CLI를 지금 들이지 않는 것이다.

1. app-reset 가드가 호출마다 PowerShell + WMI를 띄우는 비용을 없앤다. 방법은 따로 정한다.
2. 비서 shim이 Electron을 두 번 띄우는 구조를 한 번으로 줄인다.

두 개선만으로 Rust보다 더 줄고 로컬 쓰기 명령에도 적용된다. 그 뒤 Rust가 더 줄일 수 있는 것은 Host 호출 1회당 약 0.2초다. Rust를 들이면 빌드 도구(MSVC·rustup)와 CI job, 플랫폼별 빌드와 패키징, 추가 실행 파일 서명, Rust 의존성의 라이선스·보안 추적이 필요하다. 두 CLI의 명령·출력 의미도 계속 맞춰야 한다. 다시 볼 조건: 두 개선 뒤에도 Host 호출이 턴마다 많이 반복되는 실제 업무 흐름이 확인될 때.

## 코드 위치

- 태그 [`spike/2026-11-27-rust-cli-client`](https://github.com/litzio/litzio/tree/spike/2026-11-27-rust-cli-client)
- 브랜치 [`spike/rust-cli-client`](https://github.com/litzio/litzio/tree/spike/rust-cli-client)
- 마지막 커밋 [`f9e4bd2884ae152001bc063af75cc00e5b23dcb8`](https://github.com/litzio/litzio/commit/f9e4bd2884ae152001bc063af75cc00e5b23dcb8)
- 자세한 실행 방법과 원자료: 스파이크 브랜치의 `spikes/rust-cli/SPIKE.md`, `spikes/rust-cli/results/`

## 스크린샷

없음.
