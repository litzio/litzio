# Windows browser automation

## 확인된 원인과 적용 범위

일부 Windows 환경에서는 설치형 Chrome을 새 임시 profile로 반복 실행할 때 로그온 실패가 누적되어 계정 잠금 정책에 도달할 수 있다. 프로젝트의 [PR #121](https://github.com/litzio/litzio/pull/121)은 Chrome이 빈 암호 로그온으로 계정의 빈 암호 여부를 확인하고 결과를 profile에 캐시하는 경로를 재현했다. 새 profile은 이 확인을 다시 수행했다. 모든 Windows 설정에서 동일하게 잠긴다는 뜻은 아니다.

같은 PR에서 persistent profile을 재사용하면 최초 생성 이후 반복 실행의 실패 카운터가 증가하지 않는 것을 확인했다. 계정 정책 변경이나 비활성화로 우회하지 않고 profile을 재사용한다.

## 실행 규칙

- 프로젝트 검증은 `pnpm browser:test`를 사용한다. 실행 방법과 scratch fixture는 [검증 안내](../test/README.md)에 있다.
- runner는 Playwright Test의 worker fixture에서 `chromium.launchPersistentContext`로 checkout별 고정 profile을 재사용한다. Windows에서는 설치형 Chrome을 사용하며 worker는 하나씩 실행한다. `LITZIO_BROWSER_CHANNEL=msedge`는 설치형 Edge를 선택하고 같은 checkout hash에 `-edge`를 붙인 고정 profile 하나를 재사용한다. 채널은 순차 실행한다.
- `playwright-cli`를 직접 사용할 때도 `open --persistent`로 연다. 디버깅 중 다시 접속할 때는 기존 session을 재사용한다.
- 기본 `open`의 새 임시 profile, 임시 `--user-data-dir`, 반복적인 Playwright `launch()`로 설치형 Chrome을 실행하지 않는다. 짧은 간격으로 새 Chrome을 여러 번 띄우지 않는다.
- 같은 checkout의 browser runner를 동시에 여러 개 실행하지 않는다.

## Profile reuse and test isolation

runner가 서버를 시작할 때는 실행마다 OS 임시 폴더 아래 Host 전용 디렉터리를 만든다.
`LITZIO_DATA_DIR`(플러그인 작업 이력 등), daemon 기록, 플러그인 설정·secret과 비서 작업·설정
경로를 그 안으로 전달하여 Vite·production HTTP 모두 실행 간 데이터를 공유하지 않는다.
사용자가 지정한 `LITZIO_DATA_DIR`는 그대로 사용하고 삭제하지 않는다.
Host 데이터·비서 작업·비서 설정·daemon·플러그인 설정과 별도로 초기화 보호 경로인 `LITZIO_RESET_DIR`도 실행별로 격리한다. 브라우저 runner와 수동 비서 수락 실행기는 `test/helpers/isolated-host-environment.ts`의 같은 경로 목록을 사용한다. 공급자 로그인은 이 목록에 포함하지 않는다. 외부 서버에 붙을 때는 caller가 서버의 모든 경로와 수명을 소유한다.
Playwright의 서버 종료 후 runner 종료 시 생성 당시 디렉터리의 실제 경로·파일 식별자를 확인하여
자신이 만든 디렉터리만 정리한다. 대체·symlink/junction 등으로 소유권 확인에 실패하면 남기고
오류를 보고한다. `LITZIO_BROWSER_URL`로 붙는 외부 서버의 데이터 경로·수명은 caller 소유다.
이 Host 데이터 격리는 아래 persistent Chrome profile과 별개이며 profile은 삭제하지 않는다.

browser fixture, HTTP 복구 검사와 shortcut probe는 `brand.ts`의 `appName`에서 임시 경로 prefix `<appName>-browser-profile`을 가져온다(공식 기본값 `litzio-browser-profile`). 그 아래 checkout 경로의 SHA-256 앞 16자리와 선택적 `-edge` suffix로 고정 profile을 구분한다. 같은 브랜드·checkout·채널은 이 profile을 계속 재사용한다.

공통 persistent context에는 `Connection: close`를 설정하지 않는다. Chromium의 문서·asset·fetch
요청은 서버의 keep-alive 연결을 재사용한다. context 전체에서 연결을 닫으면 Windows HTTP
검사의 짧은 TCP 연결이 누적될 수 있다([#1361](https://github.com/litzio/litzio/issues/1361)).
Playwright의 Node 측 `page.request.*`와 `route.fetch()` 호출에만 `headers: { Connection: "close" }`를
명시한다. 이는 만료 직전 유휴 keep-alive 소켓 재사용 경합을 피하는 기존
[#658](https://github.com/litzio/litzio/issues/658) 보호다. 다른 요청 헤더가 있으면 함께 유지한다.
새 Node 요청도 같은 규칙을 따른다. 제품 Host와 Vite 서버 설정은 바꾸지 않으며
재시도·timeout 증가·HTTP 오류 단언 완화로 대신하지 않는다. 고정 profile과 storage 격리는
그대로 유지한다. 연결 설정 변경 시 실제 서버가 받은 두 Node 경로의 헤더와 Chromium의
연결 재사용, 기존 재연결·프로세스 종료 검사를 확인한다.

[현재 browser fixture](../../apps/editor/test/browser/scenarios.spec.ts)는 worker 시작 시 cookie와 해당 origin의 `localStorage`/`sessionStorage`를 정리한다. Chrome의 profile 자체는 유지하면서 이전 실행의 문서 폭·최근 folder 같은 browser preference가 다음 실행의 초기 조건에 섞이지 않게 하기 위해서다. 각 시나리오 시작 시 UI 언어·열린 폴더·섹션 접힘·탭·표 표시 기본값/문서별 환경설정을 지우고 복구 IndexedDB도 삭제한 뒤 다시 로드하여 이전 시나리오의 탐색 상태·복구 제안을 격리한다. HTTP/packaged Desktop 복구 검사도 최초 초기화에서만 탭 환경설정과 복구 DB를 정리하고, 같은 검사의 crash/restart에서는 보존한다. 개별 시나리오 안의 Reload와 storage persistence 검증은 유지한다. 테스트 격리를 이유로 매번 profile을 삭제해서는 안 된다.

시나리오 간 초기화는 같은 origin의 일회성 빈 페이지에서 수행한 뒤 실제 Editor를 로드한다. 이전 시나리오의 scratch 파일이 이미 지워졌어도 App이 이전 탭 경로를 읽기 전에 환경설정을 비울 수 있다. 실제 Editor 시작과 시나리오 내부 Reload의 콘솔·Host 응답 검사는 그대로 수행한다.

## Process and session cleanup

The production HTTP recovery test deliberately terminates its own browser process and launches a
new PID with the **same** checkout-owned profile and exact origin. It obtains that PID from its
own browser CDP session; Windows termination targets only that PID's tree. It does not judge
success from taskkill's exit code: already-exited children can cause a nonzero status.
The test logs taskkill's status and stderr, then requires the owned browser PID to disappear
with the existing ESRCH poll; a surviving PID fails with those termination diagnostics.
It does not clear storage
between browser crash/restart steps, which keep the daemon alive. PR4 separately stops/restarts
its own production CLI daemon at the same origin to check unsaved input, Undo/Redo and Save
through the Desktop reconnect control (native bridge stand-in). It never stops the runner daemon
or an external caller-supplied server. The normal fixture still isolates separate
tests. Packaged Desktop has its own fixed Electron test profiles and resets recovery only on a
test's first launch, preserving the record on subsequent launches within that test.

worker fixture는 `finally`에서 자신이 연 persistent context를 닫는다. Playwright의 `webServer`는 로컬·CI 모두 매번 OS가 할당한 빈 포트로 자기 Vite 또는 production HTTP Host를 시작하고 종료한다. 실제 bind와 소유 서버의 기동 확인 후 `Browser server:` 한 줄에 URL·포트·소유 PID를 출력하고 worker에 전달한다. Windows의 [포트 0 bind](https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-bind)는 OS의 dynamic client port 할당을 사용하므로 예약·사용 중인 포트를 피한다. 특정 ephemeral 번호 자체가 항상 안전하다고 가정하지 않으며 매 실행 실제 bind가 성공한 번호만 사용한다. HTTP CLI는 포트 0을 받지 않으므로 잠시 bind한 포트를 해제해 전달하며, 그 사이 포트가 점유되면 기동 실패로 종료한다. 다른 서버로 붙이지 않는다. 명시적으로 지정한 `LITZIO_BROWSER_URL`만 caller 소유 서버에 붙이며 runner가 종료하지 않는다. 일반 개발 서버와 제품 daemon의 기본 포트는 유지한다. 직접 시작한 서버와 추가 CLI session은 이름과 PID를 확인해 정리한다. profile 재사용과 실행 중인 프로세스 방치는 다른 문제다.

자신이 시작한 프로세스만 종료하며, 같은 이름이나 port의 다른 프로세스를 광범위하게 종료하지 않는다. 정리에 실패하면 남아 있는 process/session/port와 이유를 작업 결과에 기록한다. 전체 규칙은 [AGENTS.md](../../AGENTS.md#process-cleanup)를 따른다.
