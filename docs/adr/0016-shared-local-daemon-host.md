# ADR-0016: 공유 로컬 daemon Host

- Status: Accepted
- Decision date: 2026-11-04
- Last verified: 2026-11-04 — 소유자의 무인증 단계 결정과 #1145 향후 검토를 반영. 구현·검증 범위는 HTTP Host 계약을 따른다.
- Authority: [#1142 소유자 결정](https://github.com/litzio/litzio/issues/1142), [#834 S1 승인 조건](https://github.com/litzio/litzio/discussions/834#discussioncomment-19389153), under [AGENTS.md](../../AGENTS.md).
- Scope: 같은 PC의 Desktop·브라우저가 사용하는 공유 로컬 HTTP Host로의 1단계 전환. 수동 원격 접근은 ③의 추가 승인을 따른다. PR1은 결정 문서만 작성하며 구현 완료를 뜻하지 않는다.
- Amends: [ADR-0004](0004-desktop-host-distribution.md), [ADR-0005](0005-http-host.md), [ADR-0012](0012-plugin-runtime-and-ui-contributions.md), [ADR-0015](0015-shared-host-operations.md)의 아래 명시한 경계. 나머지 결정은 유지한다.

## Context

웹·Desktop Host의 장기 통합 방향과 S1 착수 조건은 #834에서 승인됐다. [S1 결과](https://github.com/litzio/litzio/discussions/834#discussioncomment-19389412)는 서버 먼저·Desktop 먼저 연결, 동시 실행 시 단일 daemon, 인증된 브라우저 접속, 당시 유지·함께 종료 경로와 버전 정책을 dev 환경에서 확인했다. 휴지통·샘플 수명·origin·종료 시 다른 클라이언트 보호는 제품 조정이 필요했다. S1 코드는 그대로 병합하지 않는다. 패키징·설치·업데이트와 실제 AI 호출은 검증되지 않았다.

## Decision

Desktop은 custom protocol의 in-process Host 대신 **같은 PC의 공유 daemon(HTTP Host)** 에 연결한다. 실행 중인 daemon을 찾으면 붙고, 없으면 띄워 붙는다. 동시에 시작해도 daemon은 하나이며 단일 인스턴스 lock으로 경합을 제어한다.

**소유자 최종 승인 (2026-11-04): 현재 단계는 별도 인증 없음.** 인증 방식과 도입 시점은
[#1145 (결정, 향후 검토)](https://github.com/litzio/litzio/issues/1145)에서 나중에 정한다.
이 결정은 앞서 같은 날 승인·구현한 토큰 필수 및 무인증 로컬 포트 전환 금지 결정을 대체한다.
토큰 파일·로그인 링크/bootstrap·인증 쿠키·Bearer 검사·비밀 링크 출력을 PR2에서 제거하며
비활성 구현이나 과거 토큰/쿠키의 정리·호환 경로는 남기지 않는다. 구현 기록은 PR 커밋에 보존한다.
Desktop daemon은 loopback 전용이고 자동 탐색·연결도 같은 PC 범위다. 수동 원격 daemon은 ③을 따른다.

제품 버전과 프로토콜 버전을 분리한다. 프로토콜 불일치는 연결을 거부하고 CLI로 daemon을 다시 시작하라고 안내한다. 제품 버전만 다르면 경고하고 연결은 유지하며 같은 CLI 안내를 제공한다. Desktop은 버전을 자동 교체하지 않으며 재시작 버튼을 제공하지 않는다.

### ① 종료 정책 (2026-11-04 최종 개정)

Desktop이 직접 띄운 인스턴스는 Desktop 종료와 함께 종료한다. spawn 시 연결한 IPC pipe가 끊기면 daemon도 종료하므로 Desktop 비정상 종료에도 고아로 남지 않는다. Desktop은 자기가 spawn한 인스턴스 ID만 소유하며 다른 클라이언트 수나 진행 작업을 추적·판별하지 않는다. CLI `daemon start` 또는 `daemon run`으로 띄운 daemon은 Desktop 종료 뒤에도 유지한다. 항상 유지 설정은 제공하지 않는다. 계속 실행하려면 CLI로 시작한다.

Desktop 메뉴에는 **daemon 종료**를 제공한다. 명시적으로 선택하면 띄운 주체와 무관하게 종료하되 연결된 탭·진행 작업이 끊긴다는 확인 창을 항상 표시한다. 종료 후에는 **연결이 끊겼습니다 / 다시 연결**을 제공한다. 다시 연결은 시작과 같은 로컬 탐색·없으면 spawn 경로이며 자동 재시작은 하지 않는다. **브라우저에서 열기**는 일반 daemon URL을 기본 브라우저로 연다.

탐색 기록·health에는 띄운 주체(`desktop`, `cli-start`, `cli-run`)를 기록한다. CLI status는 표와 `--json`으로 상태·주소·주체·접근 범위(Root 목록/non-loopback)·제품/프로토콜 버전·PID/시작 시각·daemon home·실행 파일·있는 경우 로그 경로를 제공한다. Desktop은 기존 About 설정 표면에 상태·주소·주체·버전을 표시하고 나머지는 펼침으로 제공한다.

명시적 start/다시 연결 때만 stale 기록을 회수한다. OS 프로세스 생성 식별값과 기록을 대조해 종료 또는 PID 재사용이 확인된 세대만 정리한다. 살아 있는데 응답이 없으면 기록을 보존하고 PID·주소와 진단 안내를 제공한다. PID만으로 프로세스를 죽이지 않는다. 이미 실행 중인 start는 PID·주소·주체를 알린다.

### ② OS 휴지통

daemon이 OS 휴지통을 직접 쓴다. 같은 PC의 모든 클라이언트가 동일한 삭제 동작을 얻는다. S1에서 Desktop UI의 휴지통 안내와 HTTP의 영구 삭제가 달랐던 경계를 바로잡는다.

### ③ 로컬 접근 범위

**로컬 daemon은 Root 제한 없음, 현재 단계는 인증 없음(#1145에서 선택), 중앙 서버의 Workspace 제한은 막지 않음**으로 정한다. Desktop의 전체 로컬 접근을 유지하기 위한 결정이다. S1의 폴더별 Root 누적 등록·철회 모델은 채택하지 않는다. Root 제한 없음이 Core의 valid write, revision 확인이나 기존 파일 교체 보호를 없애지는 않는다.

`daemon run --root`는 선택 옵션이다. 생략하면 OS 사용자 권한으로 서버 디스크 전체에
접근하며, non-loopback 바인딩(`--host` + `--public-origin`)에서도 이 모드를 허용한다.
`--root`를 지정하면 기존처럼 지정한 폴더만 접근한다. Host/Origin 검사, 고정 포트와
탐색 기록 규칙은 유지하며 non-loopback은 명시적 `--public-origin`을 요구한다.
Desktop 탐색 대상은 loopback·Root 제한 없음의 로컬 모드뿐이며 수동 원격 daemon은 등록하지 않는다.

**소유자 최종 승인 (2026-11-04):** 인증 없이 같은 PC의 다른 Windows 사용자도 daemon에
접근할 수 있다. non-loopback 바인딩에서는 같은 네트워크에서 해당 포트에 닿는 누구나 접근한다.
시작 시 터미널에 이 위험과, `--root` 생략 시 디스크 전체 및 비서(AI) 실행까지 열린다는
경고를 출력한다. 경고로 알리며 실행을 막지는 않는다. Host/Origin 검사는 사용자 인증이 아니다.
인증 방식·시점, 로컬 인증 여부, HTTPS·계정/권한 체계는 #1145에서 정한다.

PR2는 선택 Root, 로컬 `start/stop/status`, 단일 인스턴스·버전 확인과 OS 휴지통을 구현한다. 사용자/채널별 고정 origin과 로컬 모드만의 탐색 기록, 인증 보류·실패 경계는 [HTTP Host 구현 계약](../design/http-host-v1.md#shared-local-daemon-1142-pr2)을 따른다. Desktop 전환과 플러그인/AI 수명은 계속 PR3/PR4다.

### ④ 샘플 문서 수명

샘플은 사용자 데이터에 한 번 복사하고 앱 버전이 바뀔 때만 새 폴더를 만든다. 매 Desktop 재시작에 샘플 폴더를 교체하던 수명을 공유 daemon과 맞춘다.

### ⑤ Origin과 하위 호환

고정 HTTP origin을 쓴다. 소유자가 기존 사용자 0명을 보증했으므로 이전 `litzio://app` origin 저장소를 이전하지 않는다(하위 호환 없음).

### ⑥ 기간 한정 플러그인 테스트 예외

소유자는 1단계 동안 **느리고 in-process 수명에 묶인 플러그인 테스트만** 일시 제외하도록 승인했다. 제외 전에 CI 시간을 측정한다. 이는 AGENTS.md의 테스트 기준 약화 금지에 대한 기간 한정 예외이며 다른 테스트·문서 유효성·데이터 보존 기준을 완화하지 않는다. PR3의 제외 전 CI 측정·제외 목록과 PR4 복구 대상은 [Desktop 전환 검증](../design/desktop-distribution-v1.md#pr3-plugin-test-exception)에 기록한다.

PR3에서 해당 범위만 일시 제외하고 PR4에서 새 플러그인·AI 수명 계약으로 복구한다. 일시 제외한 테스트 복구와 필수 CI 전체 통과를 1단계 완료 조건으로 삼는다. **예외가 적용되는 기간에는 릴리스하지 않는다.** 복구 전에는 1단계 완료나 릴리스 가능 상태로 보고하지 않는다.

## Boundaries retained

plain-text SSOT, Core의 editor-neutral 문서 의미·valid write와 File commit은 유지한다. Host 공용 작업·CLI 제공은 ADR-0015를 따른다. 기존 handler와 플러그인·AI 실행 경계를 재사용하며 별도 문서 backend나 범용 infrastructure를 만들지 않는다.

화면과 분리된 daemon 수명은 미저장 편집·Undo·selection을 공유 세션으로 옮긴다는 결정이 아니다. 클라이언트 복구와 명시적 Save는 계속 ADR-0007을 따른다. 플러그인 UUID·uncertain·자동 재실행 금지·완료 결과 공개 보호는 유지한다.

## 이행 순서와 완료 조건

| PR | 범위 | 완료 조건 |
| --- | --- | --- |
| PR1 | 이 ADR, ADR-0004·0005·0012·0015와 AGENTS.md 개정·색인 | 승인 결정과 보류 범위를 연결하고 Implemented 문서에는 후속 연결만 둔다. `pnpm docs:check` 통과. 코드 변경 없음. |
| PR2 | daemon `start/stop/status`, `run --root` 선택 옵션, 단일 인스턴스 lock, 인증 보류(#1145), 버전, OS 휴지통 | 위 시작·Host/Origin·무인증 경고·단일 인스턴스·버전 정책과 같은 PC 휴지통 동작을 구현·검증하고 관련 계약을 갱신한다. |
| PR3 | Desktop 전환, custom protocol 제거, OS 기능, 샘플 수명, 고정 origin, 종료 정책·메뉴, 한정 테스트 제외 | Desktop이 공유 daemon만 사용하고 ①~⑤를 충족한다. ⑥의 제외 전 CI 시간과 제외 범위를 기록하고 해당 계약을 갱신한다. |
| PR4 | 플러그인·AI 수명, 테스트 복구 | 새 수명 계약으로 일시 제외한 플러그인 테스트를 복구하고 필수 CI 전체 통과. 관련 계약 갱신과 함께 1단계를 완료한다. |

## Deferred (2단계 이후)

- 업데이트·제거 시 daemon 정지와 Windows 설치물 검증.
- 부팅 자동 시작, 자동 복구, 무중단 업데이트.
- 인증 방식·도입 시점과 HTTPS·계정/사용자 권한 체계(#1145; 현재 단계는 인증 없음).
- 공유 편집 세션(미저장 내용·Undo·history 등의 공유 포함).

## 기존 결정과 구현 문서의 관계

- ADR-0004의 custom protocol·in-process Host·TCP 없음 경계를 대체한다. Electron shell과 배포·사용자 승인·미저장 작업 보호는 유지한다. 업데이트·제거의 daemon 통합 검증은 2단계다.
- ADR-0005의 로컬 공유 daemon에는 Root 필수 경계를 적용하지 않고 위 ③의 선택 Root·무인증 단계 결정을 적용한다. 중앙 서버 접근 제한을 막지 않는다. 현재 전경 실행 계약의 변경은 구현 PR에서 기록한다.
- ADR-0012·0015의 실행 중 Host 자동 탐색·연결과 수명 관리 보류를 위 로컬 범위에서 해제한다. 모든 CLI 명령의 live daemon RPC 전환이나 공유 편집을 결정하지 않는다.
- [HTTP Host](../design/http-host-v1.md), [Desktop distribution](../design/desktop-distribution-v1.md), [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md)는 현재 구현 계약이다. PR2~PR4에서 실제 변경과 함께 갱신하며, 이 ADR의 Accepted 상태는 구현 완료 선언이 아니다.

## Evidence and references

- [#1142](https://github.com/litzio/litzio/issues/1142): ①~⑥, PR1~PR4와 1단계 완료 조건.
- [#834 결정 기록](https://github.com/litzio/litzio/discussions/834#discussioncomment-19389153), [S1 결과](https://github.com/litzio/litzio/discussions/834#discussioncomment-19389412), [S1 상세 문서(비병합 spike)](https://github.com/litzio/litzio/blob/252ff4c5/docs/reviews/s1-desktop-daemon-spike.md).
- Paseo [`getpaseo/paseo@66676d4` pid-lock](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/packages/server/src/server/pid-lock.ts), [daemon manager](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/packages/desktop/src/daemon/daemon-manager.ts): 단일 인스턴스와 제품/프로토콜 버전 분리 참고. 소유 daemon 자동 교체는 채택하지 않는다.
- [VS Code Server connection token](https://github.com/microsoft/vscode/blob/e576c7bbeb39772a1d1ebe472545def0d93e6d8b/src/vs/server/node/serverConnectionToken.ts): 과거 토큰·쿠키 구현의 참고 기록. 현재 인증 없음·향후 #1145 검토 결정은 위 본문을 따른다.
