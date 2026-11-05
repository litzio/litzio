# ADR-0018: Desktop의 원격 Host 등록과 여러 Host 보기

- Status: Accepted
- Decision date: 2026-11-04
- Last verified: 2026-11-05 — #1174 소유자 결정 ①~⑨, 사전 조사와 관련 ADR·구현 계약을 문서 대조. 제품·원격 연결 실행 검증 없음.
- Authority: [#1174의 소유자 승인 결정](https://github.com/litzio/litzio/issues/1174), under [AGENTS.md](../../AGENTS.md).
- Scope: Desktop 로컬 등록 목록과 로컬·원격 Host의 한 화면 표시. PR0은 결정 문서만 작성한다. Accepted는 구현 완료를 뜻하지 않는다.
- Amends: [ADR-0016](0016-shared-local-daemon-host.md)의 Desktop 연결 대상·재연결 범위와 [ADR-0017](0017-bundled-client-and-official-ai.md)의 원격 Host 보류. 로컬 daemon 수명·Core 의미·공식 write path는 유지한다.

## 배경과 근거

[Discussion #767](https://github.com/litzio/litzio/discussions/767)의 사용 형태 ②는 Desktop이 주소로 원격 Host에 연결해 로컬·원격 데이터를 한 화면에서 보는 형태다. ADR-0017에서 UI를 앱에 번들하고 Host API와 분리했지만, 단일 전역 클라이언트와 경로만의 식별로는 서로 다른 Host의 같은 경로를 안전하게 구별할 수 없다. 탭뿐 아니라 복구·폴더·자산·비서·설정·capability에도 Host 문맥이 필요하다. 문서 포맷에 Host 주소를 넣는 변경은 필요하지 않다.

사전 조사 `<local-research>/remote-hosts.md`(2026-11-05)는 Litzio `4e093f156ea3d53d80a2652da90dd50c80a5c64e`, Paseo `5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af`의 정적 소스 조사다. 제품 실행이나 Windows Desktop·Linux 원격 연결의 증명이 아니다. 조사 원본의 수동 연결 추천과 자동 재연결 보류는 #1174의 결정 ②로 대체한다. 승인 범위의 authority는 조사 제안이 아니라 이 ADR과 소유자 결정이다.

Paseo에서 다음 원리를 참고한다. Litzio의 identity는 Paseo의 serverId를 그대로 가져오지 않고 아래 hostId로 정의한다.

- [Host runtime](https://github.com/getpaseo/paseo/blob/5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af/packages/app/src/runtime/host-runtime.ts): serverId별 client·상태와 자동 재연결을 유지한다. 전역 active Host 주소만 바꾸지 않는다.
- [Host filter](https://github.com/getpaseo/paseo/blob/5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af/packages/app/src/components/hosts/host-filter.tsx): 전체/개별 Host 필터는 표시 선택이다. 이미 열린 작업의 대상을 바꾸지 않는다.
- [연결·복구 경계](https://github.com/getpaseo/paseo/blob/5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af/docs/connected-hosts.md): 연결 복구와 미확정 쓰기의 자동 재실행을 구별한다.
- [Plugin registry](https://github.com/getpaseo/paseo/blob/5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af/packages/app/src/plugins/registry.ts)·[bundle 평가](https://github.com/getpaseo/paseo/blob/5d1a2c10f8a493e2329f3f9bee51dfb94ccd28af/packages/app/src/plugins/evaluate.ts): 원격 client bundle 실행은 채택하지 않는다. Litzio는 번들 UI와 원격 데이터/API를 분리하고 플러그인 로더를 복원하지 않는다.

## 결정 ①~⑨

### ① 한 화면과 설정 범위

탐색기는 Host별 구역과 전체/개별 Host 필터를 제공하고 탭에는 Host를 표시한다. 필터나 활성 탭 변경이 다른 탭의 요청 대상을 바꾸지 않는다. 설정은 앱 전역과 Host별로 분리한다. 테마·언어·패널 배치 같은 앱 설정과 Host 소유 AI 설정·템플릿을 혼동하지 않는다. Host 간 이동·일괄 작업은 제공하지 않는다.

### ② 원격 자동 연결·재연결

등록한 원격 Host는 앱 시작 시 자동 연결하고 끊기면 자동 재연결한다. Host별 client·연결 상태·capability를 독립 유지하며 한 Host가 꺼져 있어도 앱 시작과 다른 Host 작업을 막지 않는다. 늦은 응답이 다른 Host나 새 연결의 상태를 덮지 않게 한다. 쓰기 작업은 자동 재전송하지 않으며 응답 유실은 실패 또는 결과 불확실로 남긴다. 원격 자동 탐색은 하지 않는다.

이 정책은 등록한 원격 연결에 적용한다. ADR-0016의 로컬 daemon 탐색·필요 시 spawn·수동 다시 연결·주체별 종료 정책은 유지한다. 원격 재연결은 원격 daemon 시작·재시작·종료 권한이 아니다. 연결 해제·앱 종료·등록 제거를 원격 비서 실행의 취소로 취급하지 않는다.

### ③ 비서 대상 고정

대화 생성 때 Host를 선택하고 그 대화의 Host를 고정한다. 문서·폴더 참조와 AI 실행은 그 Host의 경로·OS 계정·공급자 문맥을 사용한다. 활성 탭이나 필터 변경으로 대화를 다른 Host로 옮기거나 여러 Host 문맥을 합치지 않는다.

### ④ 등록 identity

등록 시 불변 `hostId`와 `origin`을 부여하고 라벨만 변경한다. 주소 변경은 새 등록이며 같은 정규화 origin의 중복은 거부한다. hostId는 Desktop 등록의 식별자이지 서버 기계·daemon 실행 인스턴스·문서 identity·인증 증명이 아니다. DNS alias의 동일 기계 판정이나 서버 교체 감지는 보장하지 않는다.

문서·폴더 위치는 `(hostId, path)`로 식별한다. 탭·기억·복구 후보·barrier·삭제·이름 변경·자산·receipt는 원래 Host를 유지한다. 경로는 대상 Host 문맥에서 해석하며 Desktop OS로 원격 경로를 해석하지 않는다. Core의 문서 의미·plain-text SSOT·상대 URI는 그대로 유지하고 Host 주소는 요청·렌더링 경계에만 적용한다.

### ⑤ Desktop 로컬 등록 목록과 CLI

등록 목록은 Desktop 로컬에 저장한다. 원격 daemon에 Desktop 연결 설정을 저장하거나 daemon 간 registry를 만들지 않는다. 설정 화면과 얇은 CLI가 같은 저장 작업을 재사용한다. 공용 작업 계약은 아래와 같이 ADR-0015를 따른다. CLI는 원격 탐색이나 원격 daemon 제어를 하지 않는다.

### ⑥ CSP 적용과 재시작 보호

새 Host는 등록을 저장한 뒤 미저장 작업·초안을 보호하고 앱을 재시작해 CSP에 적용한다. 등록 저장 성공과 현재 창에서 연결 가능함을 구분해 알린다. 저장 직후 기존 편집 세션에 새 주소를 즉시 허용하는 동적 CSP 확장은 하지 않는다. connect/img에는 등록한 정확한 origin만 허용하며 script는 앱 번들에 한정한다. Desktop origin 허용, 쓰기 Origin 검사, 문서 SVG/HTML sandbox는 유지한다. 원격 health의 프로토콜 헤더를 위한 정확한 preflight 보완은 PR3에서 구현·검증하며 범용 main HTTP proxy로 우회하지 않는다.

### ⑦ 단절·제거와 복구 보호

끊김 시 탭·복구를 유지하며 로컬 대체 저장이나 오프라인 쓰기 대기열은 제공하지 않는다. 제거는 열린 작업을 먼저 정리하고 사용자 확인을 거친다. 남은 복구 기록이 있으면 제거를 거부한다. CLI도 같은 보호·거부 결과를 지키며 화면 소유 상태를 확인할 수 없는 경우 보호를 우회해 제거하지 않는다. 주소 재등록을 과거 작업의 자동 이전으로 취급하지 않는다.

### ⑧ 원격 파일과 로컬 OS 기능

삭제는 대상 원격 Host의 OS 휴지통을 사용한다. 지원하지 않거나 실패하면 실패로 알리고 영구 삭제로 대체하지 않는다. 파일 탐색기 열기·로그 폴더 열기·daemon 켜기/끄기는 로컬 Host에만 제공한다. 원격 경로를 Desktop shell에 넘기거나 원격 연결 제거로 서버를 종료하지 않는다.

### ⑨ 버전·권한 경계

프로토콜 불일치는 거부하고 제품 버전 차이는 경고한다. 재연결에서도 확인하며 임의 구버전 호환 계층은 만들지 않는다. 현재 인증 없음 결정과 향후 [#1145](https://github.com/litzio/litzio/issues/1145) 검토는 유지한다. 화면에는 원격 파일과 비서 실행이 대상 Host의 OS 계정·접근 범위에서 수행됨을 표시한다. Root 제한을 AI 전체의 OS sandbox나 인증으로 설명하지 않는다. 도달 가능한 무인증 포트의 파일·AI 접근 경계는 기존 경고를 유지하며 인터넷 공개나 인증 proxy 연동을 보장하지 않는다.

## 등록 공용 작업과 CLI 정의 방향

[ADR-0015](0015-shared-host-operations.md)의 공용 정의·실행 함수를 설정과 CLI가 재사용한다. 저장 위치가 Desktop 로컬이어도 CLI 제공 의무를 면제하지 않는다. 문서 의미는 Core에 남고 등록 관리는 원격 Host의 문서 쓰기 작업과 분리한다.

| 작업 | 입력 | 결과·receipt | 범위·필요 조건 |
| --- | --- | --- | --- |
| 목록·상태 조회 | Desktop 로컬 등록 목록의 대상, 선택적 hostId | hostId·origin·라벨과 관측 연결 상태/실패 이유; 현재 창의 관측 여부를 구분 | 로컬 등록 조회이며 원격 자동 탐색 아님. 영속 ledger 불필요 |
| 등록 | origin·라벨 | 성공 시 hostId·정규화 origin·라벨·저장 결과·재시작 필요 여부, 중복/잘못된 주소는 거부 이유 | 같은 Desktop 로컬 목록. 저장 성공은 연결 성공 아님 |
| 라벨 변경 | hostId·새 라벨 | 같은 hostId·origin과 변경된 라벨·저장 결과 | origin 변경은 거부하고 새 등록으로 안내 |
| 연결·다시 연결 | hostId | 접속 확인 결과·상태·프로토콜 거부/제품 버전 경고·적용을 위한 재시작 필요 여부 | 등록된 대상만, daemon 제어 없음. CLI의 접속 관측과 앱의 지속 연결을 혼동하지 않음 |
| 제거 | hostId·사용자 확인과 열린 작업 정리·복구 보호 확인 | 제거된 hostId·origin·저장 결과 또는 보호 조건의 거부 이유 | 열린 작업 정리·확인 뒤 복구가 남으면 거부. 원격 파일·daemon에는 변화 없음 |

receipt는 결과를 확인할 수 있는 위 정보이며 범용 영속 감사 저장소를 추가하는 요구가 아니다. 공용 결과는 성공·거부·실패·결과 불확실을 구분한다. 네트워크 실패를 로컬 재실행·저장 완료로 바꾸지 않는다. 연결 성공도 이전 미확정 쓰기의 성공 receipt를 대신하지 않는다.

PR3에서 등록 목록·등록·라벨 변경·제거·연결/재연결·상태를 제공하는 CLI 명령과 설정 화면을 함께 구현한다. 구체 명령 표기, 저장 파일/모듈 위치와 보호 확인 전달 방식은 구현 상세로 정하되 두 인터페이스에 별도 저장 의미를 만들지 않는다. CLI만으로 화면의 미저장 작업을 버리거나 CSP를 우회할 수 없다. 비서 도구는 필요성이 확인될 때 같은 정의로 제공하며 이번 결정이 자동 공개를 요구하지 않는다.

## 지원하지 않는 것

- Host 간 이동·일괄 작업, 대화·검색 통합.
- 원격 자동 탐색, 원격 daemon 시작·종료·재시작·설치·업데이트 제어.
- 오프라인 쓰기 대기열·자동 쓰기 재전송·로컬 대체 저장.
- 인증·계정·권한 체계 도입, 공유 편집·미저장/Undo/history 공유.
- 원격 플러그인 UI·코드 실행과 플러그인 로더 복원.
- 과거 문서·복구·설정의 하위 호환·migration.

## 이행 순서와 완료 조건

아래는 #1174의 PR0~4이며 ADR-0016의 과거 PR 번호와 구별한다. 구현 PR마다 관련 Implemented 계약을 실제 변경과 함께 갱신한다.

| PR | 범위 | 완료 조건 |
| --- | --- | --- |
| PR0 | 이 ADR, ADR-0016·0017 개정, 용어와 색인 | ①~⑨·비지원·공용 작업/CLI·이행 경계 기록. 문서만 변경하고 `pnpm docs:check` 통과 |
| PR1 | Host 식별: `(Host, 경로)` 키를 탭·기억·복구·탐색기에 전달 | 같은 경로/다른 Host가 충돌하지 않고 삭제·rename·복구 barrier가 다른 Host 기록에 영향 없음. 로컬 Save/Restore/409 유지. migration 없음 |
| PR2 | Host별 client·요청 다중화·상태·capability, API·자산·비서·템플릿 대상 고정 | 두 Host의 같은 경로에 open/save/image/rollback/비서가 올바르게 라우팅됨. 한 Host 중단·늦은 응답이 다른 Host에 영향 없음. 쓰기 자동 replay 없음. 필요하면 비서·템플릿 분리하되 전역 fallback으로 다중 Host 기능을 공개하지 않음 |
| PR3 | Desktop 로컬 등록·CLI·설정·연결 상태·CSP·health preflight | 설정/CLI가 같은 정의로 등록·연결·제거. 중복/잘못된 주소·버전 정책, 자동 연결/재연결과 재시작 보호 검증. 정확한 origin·health OPTIONS·media 허용, 임의 origin/원격 script 거부. 원격 제거가 daemon을 중단하지 않음 |
| PR4 | 탐색기·탭·필터·비서 대상의 한 화면 통합과 OS 기능 제한·통합 검증 | 로컬 daemon+원격 Host 같은 경로 동시 열기·구별·저장·앱 재시작 복구. 꺼진 Host가 있어도 시작 가능. 제거의 열린 작업/복구 보호와 원격 Explorer 차단. 관련 계약 갱신·필수 CI 통과 |

전체 완료는 이슈 기준대로 로컬·원격 같은 경로의 동시 사용과 재시작 복구, Host 장애와 독립된 시작, CLI·설정의 등록·연결·제거 동일 정의, 관련 ADR·계약 갱신과 필수 CI 통과다. Windows Desktop·Linux 원격 및 브라우저 회귀의 실제 검증과 정적/fixture 근거는 구분해 보고한다. 브라우저는 `pnpm browser:test`, 검증 범위는 [테스트 설계](../contributing/test-design.md)와 [verification matrix](../../CONTRIBUTING.md#verification-matrix)를 따른다. 이번 PR0에서 제품 동작·연결은 검증하지 않는다.

갱신 대상은 [HTTP Host](../design/http-host-v1.md)·[Desktop distribution](../design/desktop-distribution-v1.md), [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md), [Editing session and Save](../design/editing-session-save-v1.md), [Editor UX Shell](../design/editor-ux-shell-v1.md), [비서](../design/main-agent-v1.md)·[템플릿](../design/document-templates-v1.md)이다. 현행 단일 로컬 Host·수동 재연결·단일 주소 CSP의 구현 기록은 PR1~4에서 해당 동작이 바뀔 때 갱신하며 PR0에서 제공 완료로 쓰지 않는다.
