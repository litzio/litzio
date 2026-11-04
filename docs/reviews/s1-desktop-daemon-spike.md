# S1: Desktop → authenticated shared daemon

- Status: Historical — **병합하지 않는 #834 실험**. 제품 채택·ADR 개정·배포 검증이 아니다.
- Last verified: 2026-11-04, Windows, Node 24.21.0, dev Electron 44.7.0, persistent Chrome.
- Base: `96e6b3ded5780491a4d8d2edd9c3ff381fdb7b9e` (`origin/master` 기준으로 시작).
- Authority: [최신 승인 조건](https://github.com/litzio/litzio/discussions/834#discussioncomment-19389153), [이전 S1 제안](https://github.com/litzio/litzio/discussions/834).
- 현재 제품 규범: [ADR-0004](../adr/0004-desktop-host-distribution.md), [ADR-0005](../adr/0005-http-host.md), [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), [ADR-0015](../adr/0015-shared-host-operations.md), [HTTP Host](../design/http-host-v1.md).

**판정: 같은 PC의 공유 HTTP Host로 연결할 수 있다. 단순한 URL 교체로 제품 통합을 끝낼 수는 없다.** 휴지통 계약, 샘플 Root 수명, origin별 복구, daemon 종료 시 다른 클라이언트의 처리 등이 남는다. Core·문서 형식·공식 저장 연산은 변경하지 않았다. PR·병합·패키징·설치·레지스트리/PATH 변경·실제 유료 AI 호출·새 테스트 추가는 하지 않았다.

## 실험 경로와 재현

Desktop은 `litzio://app`을 유지하고 `s1-proxy.ts`에서 HTTP 요청으로 바꾼다. daemon은 기존 `startHttpHost`와 파일/플러그인 handler를 재사용한다. Desktop의 기존 폴더 선택기는 로컬 이름을 탐색하고, 선택 결과를 인증된 `/s1/roots`로 등록한다. Root는 daemon 수명 동안 누적되며 창의 열린 폴더와 별개다. close-folder는 Root 권한 철회가 아니다.

```powershell
# 빌드만 한다. Electron/NSIS 패키징은 하지 않는다.
pnpm --filter @litzio/desktop build
$env:LITZIO_S1_DIR = Join-Path $env:TEMP 'litzio-s1-example'
# fake만 사용하려면 daemon 시작 전에 설정한다.
$env:LITZIO_S1_FAKE_AGENT = Join-Path $PWD 'apps/editor/test/fixtures/codex-app-server.mjs'
$env:LITZIO_S1_NODE = (Get-Command node).Source

# 서버 먼저: start(분리 실행) 또는 s1-run(전경 실행).
node apps/desktop/build/cli/cli.mjs daemon start
node apps/desktop/build/cli/cli.mjs daemon status

# Desktop 먼저: daemon을 안 띄운 상태에서 같은 명령으로 앱을 연다.
# 서로 다른 Desktop 창에는 서로 다른 임시 user-data-dir을 준다.
$env:LITZIO_S1_EXIT = 'keep' # 또는 stop
pnpm --filter @litzio/desktop exec electron build/app --user-data-dir="$env:LITZIO_S1_DIR\desktop-a"

# CLI에서도 같은 인증된 Root 추가 작업을 제공한다.
node apps/desktop/build/cli/cli.mjs daemon root 'C:\some-existing-folder'
# browser-url 출력은 비밀값이다. 공유/로그에 남기지 않는다.
node apps/desktop/build/cli/cli.mjs daemon browser-url
node apps/desktop/build/cli/cli.mjs daemon stop --confirm
```

S1 명령은 빌드된 `cli.mjs`로 실행했다. 환경 변수 없이 실행하는 기존 `daemon run`은 원래의 고정 Root HTTP Host이며, S1 인증 daemon과 다르다. S1의 전경 진입점은 `daemon s1-run`이다. 기본 포트는 OS 할당이며 `LITZIO_S1_PORT`로 고정할 수 있다. `LITZIO_S1_DIR`은 실제 경로도 OS 임시 폴더 아래여야 한다. 이 실행은 `%TEMP%\litzio-s1-2f544e3db8a5413f995d2e4b2cb5aba8`에 탐색 파일·lock·비밀값·플러그인·설정·AI cwd·Desktop 프로필을 두었다. 디렉터리 ACL은 `BSW-HOME\swBaek:(OI)(CI)(F)`만 확인했다. 공용 `.litzio`나 실행 중 Paseo는 조작하지 않았다.

## 참고한 방식과 Litzio 선택

- **Paseo:** 로컬 클론의 정확한 commit `66676d49e6336a75837abec247871553a7658c35`를 읽기만 했다. [pid-lock.ts](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/packages/server/src/server/pid-lock.ts)는 배타적 생성·PID/시작 시각·boot 정보·재확인으로 소유권과 오래된 lock을 다룬다. [daemon-instance.ts](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/packages/server/src/server/daemon-instance.ts)는 특정 인스턴스의 종료와 spawn 경합을 확인한다. S1은 배타적 생성과 PID/시작 시각/UUID 확인만 취하고, crash 뒤 stale lock 회수·자동 복구는 구현하지 않았다. PID만 보고 프로세스를 죽이지 않는다.
- **Paseo 버전:** [daemon-manager.ts](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/packages/desktop/src/daemon/daemon-manager.ts)의 소유 daemon 제품 버전 자동 교체는 취하지 않았다. 서버의 제품/프로토콜 버전 분리를 참고하되 Litzio는 승인 조건대로 경고·연결 유지·명시적 재시작을 쓴다.
- **VS Code 인증:** 공식 공개 소스 [Server connection token](https://github.com/microsoft/vscode/blob/main/src/vs/server/node/serverConnectionToken.ts)에서 필수 token·token-file과 쿠키/쿼리 검증을 확인했다. [serve-web](https://github.com/microsoft/vscode/blob/main/cli/src/commands/serve_web.rs)은 token 파일과 여러 서버 버전이 공유하는 token을 다룬다. S1은 사용자 전용 파일의 실행별 token, Desktop Bearer, 브라우저 fragment → JSON POST → HttpOnly/SameSite 쿠키를 쓴다. 원격 인증이나 계정 체계는 도입하지 않았다.
- **VS Code 버전/CLI:** [remoteExtensionHostAgentServer.ts](https://github.com/microsoft/vscode/blob/main/src/vs/server/node/remoteExtensionHostAgentServer.ts)의 built client/server commit 불일치 거부와 serve-web의 버전별 경로를 확인했다. Litzio는 commit 일치가 아니라 별도 프로토콜 버전만 필수로 맞춘다. [server.cli.ts](https://github.com/microsoft/vscode/blob/main/src/vs/server/node/server.cli.ts)의 `VSCODE_IPC_HOOK_CLI` pipe 및 [Electron main](https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts)의 기존 인스턴스 IPC 전달을 확인했다. S1의 관리 CLI만 탐색 파일+HTTP를 사용하며, 기존 모든 CLI 명령을 live daemon RPC로 바꾸지는 않았다. VS Code는 소스 조사이며 이 PC에서 실행 검증하지 않았다(2026-11-04 main 확인 SHA `e576c7bbeb39772a1d1ebe472545def0d93e6d8b`).

## 1. 서버 먼저 / Desktop 먼저

- 서버 먼저: `daemon start`의 PID **55124**, `127.0.0.1:7570`에 Desktop이 연결됐다. 폴더 선택→Root 추가→문서 열기→키 입력→저장 후 디스크 내용과 브라우저 화면에서 같은 문자열을 확인했다.
- Desktop 먼저: daemon이 없는 상태에서 두 dev Desktop을 시작하자 자동 spawn 후 둘 다 PID **64200**, `127.0.0.1:9768`에 연결됐다. 두 창의 시작부터 문서 시작 화면까지 이 1회 관측은 합쳐 약 **2.6초**였다. 성능 기준이나 반복 통계는 아니다.

## 2. 동시 실행과 단일 daemon

두 Electron launch를 같은 시점에 요청했다. daemon 후보 둘 중 하나만 `daemon.lock`을 `wx`로 만들고, 다른 후보는 `S1 lock held; concurrent contender exits.`로 종료했다. 두 창의 연결 로그와 health의 PID/시작 시각/UUID가 같았고, listener는 PID 64200의 9768 하나였다. `instance.json`은 준비 완료 후 sibling 파일을 rename해 공개한다.

두 Desktop은 별도 임시 프로필을 사용했고 S1에서만 Electron 앱 자체의 single-instance gate를 우회했다. crash 뒤 자동 회수, PID 재사용/재부팅 fault 검증은 하지 않았다. 잘못되거나 살아 있지 않은 탐색 기록은 실패로 남고 자동 교체하지 않는다.

## 3. 브라우저와 로컬 인증

`playwright-cli`의 **고정 persistent Chrome 세션 `s1`**에서 실제 화면을 관찰했다. 브라우저는 `/s1/login#<secret>`에서 fragment를 읽고 주소에서 지운 다음 인증 POST를 한다. 이후 `/index.html`과 파일/플러그인 요청은 HttpOnly·SameSite=Strict 쿠키로 연결된다. `document.cookie`는 빈 값이었고, Desktop이 저장한 `S1 saved through daemon`이 브라우저 문서에 보였다.

무인증 `/api/document`, `/s1/health`, `/s1/roots`, `/api/ai-agent-conversations`는 모두 **401**이었다. Root 추가도 이 인증 뒤에만 가능하다. 기존 Host allowlist와 origin 검사는 유지한다. 비밀값은 renderer에 주입하지 않고 Desktop main의 Bearer에만 쓴다. 단, 브라우저 로그인 fragment에는 전달용 비밀값이 있으므로 URL 자체는 인증 정보다. loopback HTTP의 이 쿠키/비밀값 처리는 S1 수준이며 원격 보안 검증이 아니다.

## 4. 유지 / 함께 종료

- `LITZIO_S1_EXIT=keep` 또는 미설정: **정상 창 닫기** 뒤 PID 55124가 유지됐다. fake app-server의 진행 중 대화도 살아 있었고, 브라우저의 Conversation history에서 선택해 같은 `Partial answer`/작업 중 상태를 열었다. 실제 AI 응답 품질·완료는 검증하지 않았다.
- `LITZIO_S1_EXIT=stop`: Desktop B를 정상 닫자 PID 64200이 종료되고 탐색 파일이 제거됐다. **같은 daemon에 연결된 Desktop A는 502, 브라우저 탭은 Failed to fetch**가 됐다. 다른 클라이언트를 보호하거나 daemon에 자동 재연결하는 코드는 없다. 이것은 강제 공동 종료 실험 결과이며 기본 수명 정책을 정한 것이 아니다.
- 창을 잃은 heartbeat는 최장 약 15초까지 client 수에 남을 수 있다. client 수는 진단값이고 job 수는 추적하지 않는다. 재시작은 항상 확인을 요구하므로 이 진단값으로 작업 부재를 단정하지 않는다.

## 5. 버전 정책

health에 `productVersion`, `protocolVersion`, PID/시작 시각/UUID를 따로 반환한다.

| 조건 | 실제 관측 |
| --- | --- |
| 클라이언트 `LITZIO_S1_CLIENT_PROTOCOL=s1-incompatible` | 앱 연결을 거부하고 맞는 daemon을 명시적으로 시작하라는 로그/오류. 기존 PID 64200 유지. |
| 제품만 `LITZIO_S1_DESKTOP_PRODUCT=0.0.2-s1-new` | 경고와 재시작용 환경 변수 안내 뒤 같은 PID에 연결. Desktop이 띄운 daemon도 자동 교체하지 않음. |
| 제품 차이 + `LITZIO_S1_RESTART=1`, 확인 없음 | 다른 클라이언트/작업 중단 가능성을 알리고 거부. PID 유지. |
| 위 선택 + `LITZIO_S1_CONFIRM_RESTART=1` | 명시적 종료 후 새 버전으로 spawn. 61948→52756 관측. |
| 최종 빌드, 다른 Desktop + fake 진행 작업 존재 | fake 대화의 `inProgress`를 확인한 뒤 명시적 재시작. 12804→62860, 새 health 제품 `0.0.2-s1-new`, 프로토콜 `s1-1`. 다른 창 연결은 끊김. |

`LITZIO_S1_PROTOCOL`은 daemon의 실험용 프로토콜 override, `LITZIO_S1_PRODUCT`는 CLI/daemon 제품 override다. `LITZIO_S1_NONINTERACTIVE=1`은 실패 관찰에서 modal 대신 stderr를 사용했다. 제품 설정 UI는 없다. 작업 유지나 무중단 교체는 검증·구현하지 않았다.

## 6. Desktop 기능 차이

| 기능 | 분류 | 근거 / 필요한 조정 |
| --- | --- | --- |
| 휴지통 | **조정 필요** | 폐기용 `delete-me.md`의 UI가 “Move to Trash”를 안내하지만 daemon의 `handleDocumentRequest`에는 Electron `shell.trashItem`이 전달되지 않아 기존 HTTP 영구 삭제를 수행했다. 실제 fixture가 사라짐을 확인했다. native trash 실행 경계와 UI capability를 맞춰야 한다. 현재 스파이크를 실문서 삭제에 쓰면 안 된다. |
| 탐색기 열기 | **그대로 동작(S1)** | HTTP 폴더 목록 성공을 `ExplorerFolders.listedRoot`에 연결했다. 실제 메뉴로 fixture 폴더를 연 후 새 Explorer HWND 71632130을 확인·닫았다. 기존 Downloads 창 HWND 26543612는 그대로 뒀다. protocol 제거 후에는 IPC sender trust를 HTTP origin에 맞춰야 한다. |
| 임의 폴더 선택 | **조정 필요, S1 경로 동작** | 기존 Desktop 폴더 탐색을 재사용하고 최종 선택만 인증 후 daemon Root로 추가했다. 브라우저는 이미 공유된 Root만 탐색한다. 완전 HTTP 일원화 시 로컬 이름 탐색/native bridge와 daemon Root 등록 경계를 옮겨야 한다. |
| 플러그인 | **그대로 동작(관찰 범위)** | daemon 소유 plugin runtime, 검증된 ESM/CSS, UI 명령을 Desktop/브라우저가 같이 소비했다. 실제 Docling 서비스 변환은 하지 않았다. |
| AI 대화 | **그대로 동작(가짜 transport/상태 범위)** | 기존 `codex-app-server.mjs` fixture만 daemon이 실행했다. Desktop 발화→partial 대화→창 종료→브라우저 대화 선택을 확인했다. fixture 카탈로그가 제공하는 `gpt-6.1-sol/medium` 식별자를 사용했을 뿐 실제 모델 호출은 0회다. 실제 provider 인증·완료·작업 재개는 미검증. |
| 복구 초안 | **S1 그대로 / origin 제거 시 조정 필요** | 미저장 문자열이 IndexedDB에 commit된 것을 읽은 뒤 dev Desktop을 비정상 종료했다. daemon 포트가 8099→5116으로 바뀌어도 같은 Desktop 프로필·`litzio://app`에서 Review recovery→Restore work→Save로 문자열을 디스크에 저장했다. HTTP origin으로 바꾸면 기존 origin의 IndexedDB를 자동으로 볼 수 없다. 공유 복구/lease는 S2이며 여기서 구현하지 않음. |
| 업데이트 확인 | **조정 필요, 배포 미검증** | bridge `info()`는 버전/채널을 유지하며 dev 환경에서 `updatesSupported=false`, `phase=idle`이었다. protocol 유지로 기존 updater UI 연결은 남는다. 실제 설치/업데이트 확인은 안 했으며 daemon 버전 경고와 Desktop updater lifecycle을 결합해야 한다. 업데이트/제거 시 daemon 정지는 보류 범위다. |

**추가로 깨진 것: 샘플 복사 수명.** 기존 `firstDocument`는 같은 프로필을 다시 시작할 때 `sample-native-v1` 디렉터리를 교체한다. S1이 그 하위 샘플 폴더를 Root로 고정했으므로 daemon의 정상적인 identity 재검사에서 이전 Root가 바뀐 것으로 판정한다. 같은 프로필의 두 번째 Desktop 시작은 Root 등록 500으로 실패했고 다른 Root 요청도 영향을 받는다. Root 검사를 약화하지 않았다. 수동 daemon 재시작 후 복구 실험을 계속했으며, 이 재시작을 무중단 재연결 성공으로 세지 않았다. 샘플은 공유 Host에서 별도 수명/등록 방식 조정이 필요하다.

## 7. CLI 변경의 열린 화면 반영

같은 `LITZIO_S1_DIR`에서 `plugins disable docling`을 실행했다. Desktop과 브라우저의 Docling 진입점이 **reload 없이 사라졌고**, `/api/worker-plugins`도 `enabled:false`를 반환했다. 기존 공용 설치 폴더와 화면 갱신을 재사용한 결과다. CLI 파일 기반 명령이 daemon에 RPC로 붙어서 편집 세션을 공유한 결과는 아니다. enable도 실행했고 새 daemon/Desktop에서 진입점이 돌아왔다.

## 8. 1단계 통합 비용 재평가

**중간.** 문서 읽기·저장·asset·플러그인·AI transport는 이미 HTTP handler를 공유해 Core 재작성 없이 연결된다. 하지만 custom protocol과 로컬 Host를 제거하려면 (a) native trash/Explorer/폴더 선택 capability, (b) HTTP origin과 IPC trust·navigation 허용, (c) 기존 복구/환경설정의 origin 경계, (d) 샘플 Root 수명, (e) 인증 bootstrap·단일 인스턴스와 버전 재시작·업데이트 접점, (f) 다른 클라이언트가 있는 종료 UX를 정리해야 한다. 단순 proxy 추가량만 보고 “작음”이라고 평가하지 않는다.

다음 제품 판단은 이 브랜치에서 하지 않았다: keep/stop 기본값·다른 클라이언트 보호 정책·Root 철회·origin 데이터 이전·샘플의 새 수명. 공유 편집·원격 인증·자동 시작/복구·무중단 업데이트까지 포함하면 별도 범위다. 이 S1 코드의 직접 병합은 권장하지 않는다.

## 검증과 정리

- `pnpm typecheck`: 전체 통과. `pnpm --filter @litzio/desktop build`: 최종 소스 dev staging 통과(NSIS/package 미실행).
- 기존 Core **354**, CLI **87**, Desktop **85**, 대상 HTTP/프로토콜 **30** 검사 통과. 새 테스트·단언 완화 없음.
- `pnpm browser:test http-host`: **2 통과**, persistent Chrome의 실제 HTTP Save/Reload·충돌·동일 profile/origin crash 복구. 이는 기존 비인증 HTTP 경로의 회귀 확인이며 S1 인증의 증거는 위 별도 실제 화면 관찰이다. 이 검사 서버의 plugin/settings/agent 데이터도 임시 폴더 아래에 격리했다.
- 초기 대상 검사 3개 실패는 source worker 준비 누락이었고 기존 worker build 후 30개 통과. Desktop 전체 검사 첫 실패는 startup mock의 정적 import 해석 문제였으며 S1 모듈을 opt-in dynamic import로 옮긴 뒤 85개 통과. 테스트를 수정하지 않았다.
- 관찰용 스크립트·로그·이미지는 위 임시 폴더에만 남기고 커밋하지 않는다. 비밀값/인증 URL은 이 문서에 포함하지 않았다.
- **최종 정리 확인:** daemon PID 55124/64200/61948/52756/12804/62860, fake app-server 9004/33428/44700, Chrome 12544, HTTP 회귀 서버 55796, 관찰 세션 12676 모두 종료. workspace/임시 경로를 가진 잔여 프로세스 없음. 7570/9768/4430/8099/5116/14086/5181 listener 없음. `instance.json`과 `daemon.lock` 없음. `playwright-cli list`는 `(no browsers)`였다. 직접 연 Explorer 창만 닫았고 원래 Downloads 창은 보존했다.
