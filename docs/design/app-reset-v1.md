# Complete app reset (#1285)

- Status: Implemented
- Last verified: 2026-11-06 — Windows 격리 파일/CLI/helper/main 검사, HTTP Host 검사와 persistent Chrome UI 검사 및 1440px·640px 수동 캡처. 실제 설치형 Electron 초기화·재실행 검사는 Windows CI 전용이며 로컬 미실행.
- Scope: 로컬 Desktop profile과 Litzio 소유 Host 데이터 초기화. 원격 Host·외부 브라우저·공급자 계정은 삭제하지 않는다.
- Authority: [#1285](https://github.com/litzio/litzio/issues/1285)의 소유자 결정, [ADR-0015](../adr/0015-shared-host-operations.md), [ADR-0016](../adr/0016-shared-local-daemon-host.md), [ADR-0018](../adr/0018-desktop-remote-hosts.md). 관련 현재 계약은 [Desktop distribution](desktop-distribution-v1.md), [HTTP Host](http-host-v1.md), [Editing session and Save](editing-session-save-v1.md)다.

## 목표와 제거기의 경계

처음 설치한 것처럼 깨끗한 상태로 되돌리며 Litzio 소유 저장소의 사용자 데이터도 남기지 않는다. 템플릿·스킬·편집된 샘플·로컬 대화·설정·secret·복구는 모두 삭제 대상이다.

현재 [packageConfiguration](../../apps/desktop/scripts/package.ts)은 `deleteAppDataOnUninstall: false`이며 [NSIS helper](../../apps/desktop/installer/cli.nsh)는 앱 데이터·updater cache를 보존한다. 따라서 현재 제거·재설치만으로 이 목표를 충족한다고 주장하지 않는다. 초기화는 설치물과 CLI 통합을 유지하면서 앱 소유 데이터를 비우는 별도 작업이다. 설치·제거 정책은 바꾸지 않는다.

소유자는 별도 Chrome 등 **외부 브라우저 profile의 Litzio origin 데이터**와 Codex/Copilot 전역 계정·공급자 서버의 데이터를 삭제 범위 밖으로 확정했다. Desktop profile 안의 Chromium 환경설정·탐색 기억·IndexedDB 복구는 전부 삭제한다. 외부 브라우저의 저장소까지 삭제했다고 표시하지 않는다.

## 진입점과 공용 작업

Desktop 설정 → 저장·복구 → 앱 초기화에서 확인 화면을 연다. 상시 화면에는 진입 버튼만 두고 삭제/유지 범위, 실제 경로와 폴더 옵션은 확인 화면에 둔다. [Settings](../../apps/editor/src/shell/SettingsDialog.tsx)와 [DangerConfirmation](../../apps/editor/src/components/ui/danger-confirmation.tsx)을 재사용하며 Cancel 초기 focus·초점 복귀를 유지한다. 공통 모달에 내용 slot만 추가하며 새 표면·색·상호작용 예외는 없다.

[공용 작업](../../apps/editor/server/app-reset.ts)을 CLI와 Desktop의 종료 후 helper가 재사용한다. 이 로컬 작업을 원격 daemon의 삭제 HTTP API로 노출하지 않는다. Host의 읽기 전용 `GET /api/app-reset/paths`는 실행 중 runtime이 고정한 절대 경로만 반환한다. Desktop은 자신의 환경에서 계산한 경로와 대조한다. 다른 shell/cwd의 override로 서로 다르면 초기화를 거부하며 matching 환경에서 CLI로 확인하도록 안내한다.

| 단계 | 입력 | 결과와 receipt | 범위 |
| --- | --- | --- | --- |
| inspect | 실제 profile·cache·Host 경로 | 삭제 대상·외부 유지 항목·경로 계획의 SHA-256 revision | 로컬 읽기 전용. 파일 내용·secret 값은 읽거나 출력하지 않음 |
| apply | 검토한 revision·명시 확인·폴더 옵션 | success / refused / partial / uncertain; 삭제한 경로와 실제 잔존/실패 결과 | 모든 writer가 종료되고 계정 공용 배타 gate를 획득한 로컬 저장소 |

```sh
litzio app-reset inspect --profile <absolute-profile-directory> --updater-cache <absolute-cache-directory>
litzio app-reset apply --profile <same-profile> --updater-cache <same-cache> --confirm --revision <reviewed-sha> [--remove-folders]
```

Windows에서 profile·cache를 생략하면 공식 기본 위치를 사용한다. 다른 플랫폼은 둘 다 명시한다. CLI의 Host 데이터는 해당 실행 환경의 `hostPaths`를 따른다. 실제 대상이 다른 override 환경의 경로를 자동 추측하지 않는다. `apply`는 살아 있는 Desktop/Host/CLI writer를 강제 종료하지 않고 거부한다. 실행 중 앱의 미저장 작업을 CLI flag로 버릴 수 없다. 모든 결과는 JSON이며 거부·부분 실패는 exit 1이다. 응답 유실이나 실패를 자동 재실행하지 않는다.

## 저장 소유권과 삭제 대상

아래 기본값은 공식 Windows 설치본 기준이다. [hostPaths](../../apps/editor/server/host-paths.ts), [registry](../../apps/editor/server/remote-host-registry.ts), [daemon state](../../apps/editor/server/daemon-state.ts)의 실제 경로와 override를 사용한다. 상대 Host override도 소유 프로세스의 cwd에서 절대 경로로 해석하며 Desktop과 daemon의 cwd가 다른 경우 경로 대조로 거부한다.

| 데이터 | 실제 위치 | 처리 |
| --- | --- | --- |
| Desktop 데이터 | `%APPDATA%/litzio`, 명시한 `--user-data-dir` 우선 | preferences, logs, 모든 버전의 편집 sample, Chromium storage·복구 포함 전체 내용 |
| Host 전체 저장소 | `LITZIO_DATA_DIR` 또는 설치본 `~/.litzio`, 개발 실행 checkout의 `.litzio-dev` | 알려진 항목만 보존 예외로 거르지 않고 전체 내용 제거; 중단된 쓰기와 추가 사용자 데이터도 포함 |
| 템플릿 | `<Host base>/templates` | 전체 제거; 번들 기본 템플릿은 다음 시작에서도 제공 |
| AI 설정 | `<Host base>/assistant.json` 또는 `LITZIO_ASSISTANT_SETTINGS_FILE` | 파일과 UUID 임시 sibling 제거 |
| 플러그인 등록·신뢰·설정 | `<Host base>/plugins.json` 또는 `LITZIO_PLUGINS_SETTINGS_FILE` | 파일과 UUID 임시 sibling 제거 |
| secret | 실제 plugins 설정 파일 경로 + `.secrets` | DPAPI 암호문 전체 제거; 복호화/값 출력 없음 |
| 비서 cwd | 기본 `%APPDATA%/litzio/assistant`, `LITZIO_ASSISTANT_CWD` 우선 | 로컬 대화 목록·파일·instructions·사용자 스킬 전체 제거; 기본 가이드는 정상 환경 생성 시 다시 제공 |
| 원격 등록·작업 요약 | `<LITZIO_DATA_DIR 또는 ~/.litzio>/desktop` | 로컬 등록·요약·중단된 쓰기 제거. 원격 서비스·파일은 그대로 유지 |
| daemon 데이터 | `<LITZIO_DAEMON_DIR 또는 ~/.litzio/daemon>` | 모든 채널의 discovery·lock·log 포함 전체 내용; 살아 있는 owner가 있으면 삭제 전에 거부 |
| updater cache | `%LOCALAPPDATA%/litzio-updater` | 내려받은 업데이트·cache 제거. Desktop은 잠긴 electron-updater의 cache base resolver를 재사용 |

설정 파일을 개별 override한 경우 그 부모의 임의 사용자 파일까지 제거하지 않는다. 해당 파일·제품이 만든 UUID 임시 sibling·secret을 정확히 포함한다. 등록 파일에 들어 있는 외부 artifact `directory`를 따라 삭제하지 않는다. 외부 문서·별도로 저장한 파일·plugin scaffold/artifact·계정과 공급자 서버 데이터·설치물은 유지한다. 앱 소유 저장소 안에 보관한 데이터는 별도 보존 예외를 만들지 않는다. #1341에서 저장 뷰·snapshot 기능과 전용 초기화 항목을 제거했으며, Host 전체 저장소의 삭제 범위는 그대로다.

## 선택적 폴더 제거

옵션은 데이터 보존 선택이 아니라 **비워진 컨테이너도 제거할지**의 선택이다. 끄더라도 모든 대상 데이터는 삭제하고 빈 상위 대상 디렉터리만 남길 수 있다. 켜면 대상 디렉터리도 제거한다. 없는 디렉터리는 이미 비워진 것으로 취급하며 옵션을 맞추기 위해 새로 만들지 않는다. 중첩된 대상은 한 번만 삭제하고 임의의 부모 디렉터리까지 재귀 삭제하지 않는다. 앱 재실행은 정상 최초 실행에 필요한 기본 폴더와 sample을 다시 만든다.

## 수명과 실패 보호

[ResetGuard](../../apps/editor/server/reset-guard.ts)의 상태 소유자는 같은 OS 계정이다. 기본 위치는 Host base 밖의 `~/.litzio-reset-guard`; 검증은 `LITZIO_RESET_DIR`로 격리한다. 같은 계정의 여러 채널·설치본이 Host base/daemon override와 무관하게 참여해야 하므로 기존 한 채널의 daemon lock이나 한 profile의 작업 요약만으로 대체할 수 없다. gate는 문서 세션이나 범용 persistence가 아니라 초기화와 writer 수명 사이의 좁은 배타 제어다.

Desktop·HTTP/Vite Host·실행 CLI가 PID/OS 생성 identity를 가진 actor lease를 등록한다. 일반 CLI의 순수 help/version은 참여하지 않는다. writer는 먼저 등록하고 exclusive 존재를 확인한다. 초기화는 exclusive를 먼저 만든 뒤 기존 actor를 검사하므로 새 writer와의 시작 경쟁도 둘 중 하나가 거부된다. 다른 프로세스를 죽이지 않는다. dead PID 세대의 고유 actor 파일만 회수한다. 중단된 exclusive, 알 수 없는 기록, Host 하위 프로세스 종료 실패 marker는 자동 회수하지 않고 검사할 위치를 보고한다. gate 자체를 포함하거나 home·현재 cwd·설치 실행 파일·사용자 문서/OS 데이터 root를 포함하는 삭제 대상은 거부한다.

Vite도 문서·asset middleware가 수락한 promise를 SSR module loading부터 추적한다. listener 종료 이벤트는 서비스 종료와 수락된 handler의 settle까지 기다린 뒤 lease를 해제한다. 종료 중 새 Host 서비스를 초기화하지 않으며 `server.close()`도 같은 정리를 기다린다. Vite 내부 restart가 listener를 닫는 경로에도 같은 lease 보호가 적용된다. 이미 수락된 파일 변경은 소켓 단절로 취소됐다고 간주하지 않는다.

Desktop 경로:

1. 실제 경로 계획을 검토하고 삭제 범위와 외부 유지 데이터를 확인한다.
2. 기존 `askEditorToRestart`와 모든 탭의 pending-work 검사로 미저장 편집·초안·진행 작업을 거부한다. 창 입력을 막고, 늦은 `beforeunload` 거부 시 디스크에 취소를 먼저 기록하고 기존 owned-process 종료 함수로 helper의 종료를 확인한 뒤 입력을 다시 허용한다. IPC 취소가 유실된 뒤 부모가 종료되어도 helper가 취소 파일을 확인해 삭제하지 않는다. 기존 복구 삭제 동의와 새 미저장 작업 보호를 혼동하지 않는다.
3. 종료 후 helper의 준비 응답을 받은 다음 창을 닫는다. 기존 `window-all-closed` 경로가 업데이트 timer를 멈추고 자신이 시작한 daemon의 종료를 기다린다. daemon 종료를 확인하지 못하면 marker로 삭제를 막는다. CLI-owned daemon·다른 채널 writer는 남겨 두며 이후 gate가 삭제를 거부한다.
4. helper는 정확한 부모 PID/생성 identity의 종료를 확인한 뒤 공용 apply를 호출한다. 다른 Desktop/Host/CLI actor 및 기존 discovery/work 기록의 live owner도 거부한다. Host 종료 실패는 marker로 남아 자식이 살아 있을 수 있는 상태의 삭제를 막는다.
5. 경로 전체를 사전 검사하고 root·보호 위치·junction/symlink 대상/ancestor·종류 오류를 거부한다. 소유 디렉터리 내부 링크는 외부를 따라가지 않고 링크만 제거한다. 각 실제 삭제 뒤 잔존을 검사하며 실패를 성공으로 바꾸지 않는다. 외부 프로세스의 임의 경로 교체에 대한 OS sandbox를 주장하지 않는다.
6. helper가 프로필 밖 임시 receipt를 남기고 앱을 다시 시작한다. 다음 시작은 실패/부분 실패를 실제 경로 결과와 함께 알린다. exclusive gate 해제 실패도 이미 얻은 삭제 receipt를 버리지 않고 uncertain으로 보고한다. receipt 쓰기 실패도 다시 시작해 누락 결과를 알린다. atomic rollback이나 자동 retry는 없다.

## 검증과 한계

주된 보호 계층을 나누며 같은 파일 삭제 사례를 브라우저에서 반복하지 않는다.

- [파일 fixture](../../apps/desktop/test/reset-storage.test.ts): override·모든 데이터 분류·빈 폴더 옵션·중첩 삭제·외부 문서/artifact·junction·실패/잔존 결과. 정상 startup의 실제 templates/settings/skills/sample loader로 초기화 후와 깨끗한 최초 실행 결과를 비교한다. 실제 AI 호출은 없다.
  custom Desktop profile과 별도 OS 앱 데이터의 무관한 logs ancestor junction도 검사한다. 수정 전에는 불필요한 경로 preflight로 전체 거부됐고, 수정 후 현행 profile·Host base·assistant cwd의 canary는 제거하면서 외부 로그와 junction을 보존한다. 기존 위험 root/junction 사전 거부 검사는 유지한다. 새 subprocess·전수 조합 없이 기존 파일 검사에 한 대표 사례를 추가했으며 Windows 단독 약 20ms다. home과 APPDATA/XDG를 fixture로 격리해 실제 사용자 앱 데이터는 사용하지 않는다.
- [gate fixture](../../apps/desktop/test/reset-guard.test.ts): 여러 actor 역할·새 writer·PID 세대·중단된 exclusive와 종료 실패 보호. 손상된 optional-cleanup SystemRoot에서도 필수 OS identity 확인이 되고 호출자 환경은 바꾸지 않는지 확인한다.
- [CLI fixture](../../packages/cli/test/app-reset.test.ts): 공용 작업 호출·검토 revision/명시 확인·live/불명확 owner 거부와 최초 설정 복원. 임시 경로만 삭제한다.
- [main 연결](../../apps/desktop/test/window-startup.test.ts): 실제 main 코드를 격리 port로 실행해 sender·계획·미저장 작업·늦은 unload 거부와 helper 취소를 확인한다. 실제 앱/OS 파일을 조작하지 않는다.
- [helper fixture](../../apps/desktop/test/reset-helper.test.ts): 실제 자식 프로세스에서 부모 종료 전 데이터 보존, 종료 후 삭제·receipt·재실행을 확인한다. 세 subprocess(가짜 부모, 실제 source helper, 즉시 종료하는 재실행 표식)가 필요하며 인메모리 mock으로 process-exit/IPC 경계를 증명할 수 없다. 별도 helper 한 개로 IPC 유실 뒤 취소 기록을 존중하는지도 검사한다. 취소 파일 확인 전 canary 삭제 실패를 재현한 뒤 수정했고 두 검사가 통과했다. Windows 단독 실행 관측 약 2초, 다른 검사 병렬 실행 중 약 6초. 폴더·secret은 합성이며 외부 서비스 호출은 없다.
- [HTTP 검사](../../apps/editor/test/http-host.test.ts): runtime 경로 고정과 활성 Host의 gate 참여·HTTP method 경계. 클라이언트 socket을 닫아도 이미 수락한 비동기 파일 변경은 계속될 수 있으므로 handler가 끝나기 전 Host close/gate 해제가 완료되지 않는지도 검사한다. 기존 close가 먼저 완료되는 실패를 재현했고, listener 종료 뒤 in-flight handler가 settle할 때까지 lease를 유지하도록 수정했다. subprocess·timeout 완화 없이 네트워크 close event와 명시적 fixture 작업 경계로 검사한다.
- [Vite 경계 검사](../../apps/editor/test/vite-plugins.test.ts): 실제 config·Vite listener·middleware·ResetGuard에서 요청 단절 후 listener와 services가 닫혀도 대기 중인 쓰기가 있으면 exclusive와 close 완료를 거부하는지 확인한다. handler/service module만 fixture이며 명시적 Promise를 풀면 임시 파일 쓰기가 끝나고 lease가 해제된다. 기존 HTTP 검사와 달리 Vite의 configureServer/비동기 module loader/close 연결을 보호한다. 수정 전 배타권이 잘못 승인되는 실패를 확인했고 수정 후 약 2초에 통과했다. 새 subprocess·브라우저·OS trash 작업·전수 조합은 추가하지 않았다. 기존 플러그인 연결 검사도 guard를 임시 fixture로 격리한다.
- [브라우저](../../apps/editor/test/app-reset.browser.js): 공통 확인 모달·Cancel focus·삭제/유지 안내·옵션 전달·실제 Editor restart-check의 미저장 작업 거부. bridge만 stand-in이며 실제 삭제 성공을 주장하지 않는다.
- [packaged CI](../../apps/desktop/test/packaged/packaged.e2e.ts): 실제 Electron 종료 후 Chromium profile handle 해제, 번들 RunAsNode helper, 격리 사용자 데이터 제거, 새 프로세스 세대/기본 sample/빈 작업 상태와 외부 문서 보존을 한 대표 사례로 확인한다. 프로세스와 renderer summary뿐 아니라 실제 native window handle도 확인한다. helper만 숨기고 사용자 GUI 재실행에는 `windowsHide`를 적용하지 않는다([libuv의 Windows spawn 처리](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c#L1042-L1048)). 첫 CI case는 48.7초 후 native 종료 정리에 실패했으며 로그/artifact를 분석해 GUI 숨김을 수정하고 단계별 `reset-proof.json`을 추가했다. 정리 오류가 본문의 최초 실패를 덮지 않게 한다. 실제 Desktop 재실행은 source mock이나 가짜 Node 부모로 대체할 수 없고 로컬 실행 금지이므로 성공 실행 시간은 후속 CI에서 측정한다. install/update/uninstall 자체를 로컬에서 실행하지 않는다.

수동 시각 검토는 persistent Chrome과 native bridge stand-in을 사용했다. 1440px English Light [이전](assets/app-reset-1285/before-1440.png) / [이후](assets/app-reset-1285/after-1440.png) / [확인](assets/app-reset-1285/confirm-1440.png), 640px 한국어 Dark [이전](assets/app-reset-1285/before-640.png) / [이후](assets/app-reset-1285/after-640.png) / [확인](assets/app-reset-1285/confirm-640.png). 정렬·버튼 여백·scroll 접근·가림·한국어 줄바꿈·공통 위험 확인의 초점을 확인했다. 640px의 추가 구역은 기존 설정 scroll로 접근한다. [촬영 body](assets/app-reset-1285/capture.browser.js)는 테스트 폴더에 임시 복사해 `pnpm browser:test app-reset-capture`로만 실행하고 자동 회귀 경로에 넣지 않는다. Host 계정은 fixture 라벨이며 실제 계정명을 공개하지 않는다.

두 번째 packaged CI의 단계 기록은 앱 종료 event 대기에서 실패했으나 새 profile 로그는 재실행을 보여 주었다. Windows에서 Playwright `app.process()`는 `cmd.exe` launcher이므로 main의 실제 PID를 별도로 받아 종료와 새 세대를 판정하도록 고쳤다. 대기 시간이나 데이터 단언은 완화하지 않으며 정리 때 native 프로세스와 launcher의 종료를 모두 확인한다. CI 진단 exact allowlist도 새 `reset-proof.json` 한 항목을 명시하도록 기존 검사를 갱신했다.

현재 namespace에 참여하지 않는 외부/구버전의 임의 쓰기나 외부 파일 시스템 조작을 차단한다고 주장하지 않는다. 기존 discovery에 기록된 live owner도 별도로 거부하며, 소유 범위를 확인할 수 없으면 성공 대신 거부한다. 다른 workspace와 프로세스는 초기화나 검증 대상이 아니다.
