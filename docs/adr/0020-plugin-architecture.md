# ADR-0020: 플러그인 구조와 기본 화면

- Status: Accepted
- Amended by: [ADR-0022](0022-plugin-screen-code.md) — 플러그인 화면 선언·원격 script 한정 경계를 대체한다.
- Decision date: 2026-11-05
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.
- Authority: 2026-11-05 소유자 결정, under [AGENTS.md](../../AGENTS.md). 관련 보류 이슈: [#1075](https://github.com/litzio/litzio/issues/1075).
- Scope: 재개 시 사용할 저장소·Host·기여·UI·저장 구조의 결정. Accepted는 구현 완료가 아니다.
- Amends: [ADR-0019](0019-plugin-tiers.md)의 계층·공통 SDK·Host·번들 UI 경계를 구체화한다. [ADR-0012](0012-plugin-runtime-and-ui-contributions.md)·[ADR-0015](0015-shared-host-operations.md)·[ADR-0017](0017-bundled-client-and-official-ai.md)의 재개 시 실행·UI·비서 관리 경계는 아래 관계 절을 따른다.

## 2026-11-09 신뢰 단위 개정 (#1379)

[소유자 결정 #1379](https://github.com/litzio/litzio/issues/1379)에 따라 신뢰는 등록된 플러그인(ID와 그 등록) 단위다. 처음 켤 때 한 번 확인하고 업데이트 뒤에는 다시 확인하지 않는다. 제거 후 재추가·등록 교체는 다시 신뢰해야 한다. UI·CLI·비서는 같은 Host 작업을 사용한다. [실행 계약](../design/plugin-stage1-v1.md)을 따른다.

## 본체 확장 원칙 (2026-11-09 개정)

소유자 승인 [#1365](https://github.com/litzio/litzio/issues/1365): 특정 플러그인만을 위한 Core·Host 기능은 만들지 않는다. 단, 여러 플러그인이 함께 쓸 수 있고 가치 있는 기능은 Core·Host에 넣을 수 있다. 판단은 PR 리뷰에서 사람과 오케스트레이터가 하며 자동 검사로 강제하지 않는다.

## 결정

### ① 하나의 SDK·패키지 규격과 공급 책임에 따른 저장소

2026-11-06 소유자 결정 (#1271): 공개 SDK는 npm/tarball 배포 없이 Host가 실행 시점에 제공한다. 플러그인 단독 실행은 지원하지 않으며 SDK 버전은 Host에 묶인다. 구체 공급·import 우선순위는 [1단계 계약](../design/plugin-stage1-v1.md)을 따른다. 플러그인은 신뢰 코드이며 내부 import 차단은 실수로 내부 API에 의존하는 것을 막는 계약 강제이지 sandbox·보안 경계가 아니다. fs로 직접 읽어 eval하는 의도적 우회는 범위 밖이다.

설치 단위는 manifest·빌드된 Host entry·실행 의존성을 포함한 패키지이며 초기에는 로컬 산출물 등록만 제공한다. SDK는 React·Tiptap·Editor 내부 import 없이 사용할 수 있어야 한다. Host·CLI shell은 개별 플러그인 source를 직접 import하지 않는다.

**그래서 무엇이 안 되는가:** 계층별 SDK·특권 API, `official/`·`community/` 패키지 분리, 자칭 tier나 번들 여부에 따른 자동 실행은 없다. 빈 확장 디렉터리, Git/npm 자동 설치·marketplace·외부 SDK 배포망은 선제 구축하지 않는다.

### ② manifest는 실행 전 검증하는 선언이다

이 절의 결정은 [ADR-0022](0022-plugin-screen-code.md)로 대체됐다. 현재 형식은 [실행 계약](../design/plugin-stage1-v1.md#신분증)을 따른다.

### ③ 대상 daemon의 하위 프로세스 신뢰 코드와 별도 상태

**2026-11-05 개정:** 최초 in-process 결정은 daemon 하위 프로세스의 trusted Node 코드로 대체한다. 아래 reload 계약을 따른다. 설치 목록·상태·일반 설정은 그 Host가 소유하며 임의 폴더 자동 탐색은 하지 않는다. installed/trusted/enabled/available/running을 구분한다. 커뮤니티는 설치 직후 실행 차단하고 **명시적 신뢰와 활성화가 모두 있어야** entry를 import한다. 신뢰 단위는 [#1379 개정](#2026-11-09-신뢰-단위-개정-1379)을 따른다.

활성화는 `activate(context)`와 기여 연결, 비활성화는 신규 작업 차단·기여 숨김 후 이미 받은 작업 drain과 `dispose()`다. 일반 operation은 drain한다. 설정·secret·열린 문서는 보존하고 비활성화한 plugin만 사용 불가로 표시한다. 로컬 출처의 다시 읽기는 아래 하위 프로세스 수명 계약을 따른다. 안전한 폭주 정지는 보장하지 않는다.

요청·결과·receipt는 시작한 client에 고정한다. 연결·버전은 [HTTP 계약](../design/http-host-v1.md)을 따른다.

**그래서 무엇이 안 되는가:** 오류·악성 코드·무한 루프로부터 daemon, OS 파일·네트워크·자격 증명을 격리하지 않는다. 신뢰 후 안전 실행 보증, 무중단 코드 교체, 강제 안전 종료, Desktop 전역 실행·다른 Host fallback은 없다. 비활성화로 비서를 끄거나 저장 데이터를 삭제하지 않는다.

### ④ 자격 증명은 최초 Windows OS 저장소만 사용한다

현재 단일 연결의 `(Host 저장 경로, pluginId, secretId)`를 Windows DPAPI CurrentUser로 보호한다. 다중 connectionId는 구현하지 않는다. 선택 근거·입력/상태/삭제·실행 전달 계약은 [1단계 계약](../design/plugin-stage1-v1.md)을 따른다.

**secret 입력은 사용자가 앱 설정 UI에서 직접 한다.** 비서는 설정 화면으로 안내할 수 있지만 값을 입력받거나 읽지 않는다. argv·일반 설정 export·로그·비서 인자/결과·뷰·스냅샷에 PAT를 남기지 않는다. BaseURL의 userinfo·token query도 허용하지 않는다. 외부 API 인증·오류 응답은 Host 경계에서 정리한다.

**그래서 무엇이 안 되는가:** 평문 fallback, Desktop 전역 토큰, Host 간 자격 증명 동기화, 비서의 secret 값 열람·대화 보관은 없다. Windows 저장소 지원만으로 모든 원격 OS의 PAT 기능을 제공하지 않는다. 신뢰한 코드로부터 secret을 격리한다는 보증이나 #1145 인증 보류 해제도 아니다.

### ⑤ 최소 기여와 공용 작업·CLI·활동 기록을 남기는 비서 관리

[ADR-0015](0015-shared-host-operations.md)에 따라 새 기능과 관리 작업은 입력·결과·범위·receipt의 공용 정의와 CLI를 함께 제공한다. CLI는 공통 invoke를 연결하고 필요한 비서 도구도 같은 정의를 재사용한다. 다음 이름은 계약을 설명하는 후보이며 현재 명령이 아니다.

| 기여 지점 | 최소 계약 | 제한 |
| --- | --- | --- |
| 공용 작업 | ID/version·입출력 schema·effect·scope·handler·receipt | 조회/변경 구분, 호출 시 Host가 신뢰·활성·입력·범위 재검사 |

`plugins list/register/trust/enable/disable/settings`, `operation invoke <id> --input <file> --host <target> --json`을 같은 정의로 연결한다. 비서는 **설치·신뢰·활성화·비활성화·설정**을 제어할 수 있어야 한다. 관리 작업은 `assistant` opt-in 여부를 이유로 모두 감추지 않고 공용 정의에서 비서 도구를 제공한다. **2026-11-05 개정:** 건마다 받던 명시 승인은 제거하며, 대상 Host·플러그인·변경 내용과 결과를 사용자에게 보이는 활동 기록으로 남긴다. 비서도 등록 단위 신뢰 단계를 실행할 수 있다. secret 값 변경은 사용자 직접 설정 UI 경로를 따른다.

기능 작업은 검토된 필요한 작업만 비서에 노출한다. schema 표시만으로 provider 연결이 완성되는 것은 아니며 Codex/Copilot adapter의 실제 호출 검증이 필요하다. 결과·receipt는 성공/거부/실패/결과 불확실, 대상·request ID·작업 version·필요한 path/revision을 구분한다. 쓰기는 공식 write path·revision 보호를 따르고 네트워크 실패 뒤 자동 재전송하지 않는다.

**그래서 무엇이 안 되는가:** secret 도구 공개, UI만의 기능·관리, 별도 문서 의미 구현은 없다. 승인 제거로 비서가 사용자 확인 없이 신뢰 코드를 설치·실행할 수 있으며 활동 기록은 이를 사전에 막지 않는다.

## 대체된 결정

- ⑥ 생성 UI와 저장된 뷰, ⑧ 단계 구분·로드맵, K1·카탈로그·Docling 화면 결정은 [ADR-0022](0022-plugin-screen-code.md)로 대체됐다.
- ⑦ OneDrive 결정은 [제품 목적](../purpose.md)과 [#1595](https://github.com/litzio/litzio/issues/1595)에 따른 기능 삭제로 적용하지 않는다.

## 비서 플러그인 제작 로드맵(2026-11-05 개정)

- 실행 모델 참고: [Paseo public-docs/plugins/index.md 58행](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/public-docs/plugins/index.md#L58) 및 [229–239행](https://github.com/getpaseo/paseo/blob/66676d49e6336a75837abec247871553a7658c35/public-docs/plugins/index.md#L229-L239). 로컬 고정 checkout과 문서를 대조했으며 Paseo runtime을 실행하지 않았다.

### 하위 프로세스 reload와 제작 키트

플러그인은 daemon의 하위 프로세스에서 Host가 관리하는 설치본으로 실행한다. 다시 읽기는 로컬 출처를 새 후보 디렉터리에 복사하고 검증·기동·기여 준비를 마친 뒤 전환한다. 준비에 실패하면 작업 실패를 알리고 기존 설치본을 유지한다. 전환 후 이전 인스턴스가 받은 작업을 drain하고 종료한다. 진행 작업의 uncertain/no-replay, 설정·secret·문서 보존은 [실행 계약](../design/plugin-stage1-v1.md#수명과-공용-작업)을 따른다.

제작 키트는 **비서용 플러그인 제작 스킬과 `plugins scaffold/validate/reload` 공용 작업**이다. 스킬은 공개 SDK·manifest·기여·검증·기본 UI·오류 확인 절차를 안내하고 세 작업은 ADR-0015의 입력·결과·범위·receipt 및 CLI를 함께 제공한다. validate는 실행 전 선언·패키지·schema 경계를 확인하며 코드 안전성을 증명하지 않는다.

**그래서 무엇이 안 되는가:** 하위 프로세스는 sandbox가 아니며 신뢰 코드의 OS 파일·네트워크·자격 증명 접근을 격리하지 않는다. 무중단 교체·자동 복구 성공·악성 코드 안전 실행을 보장하지 않는다. 제작 키트를 범용 패키지 배포망이나 자체 parser/editor engine으로 확대하지 않는다.

### 관리 승인 대신 활동 기록

설치·신뢰·활성화·비활성화·설정·reload 등 비서 플러그인 관리에서 건마다 받던 명시 승인을 제거한다. 필요하면 이후 별도 결정으로 다시 붙인다. 대상 Host·플러그인·작업·변경 내용·실행 시각·성공/거부/실패/불확실 및 receipt를 사용자에게 보이는 활동 기록으로 남긴다. 승인 대신 가시성으로 대응한다.

secret 값은 사용자가 설정 UI에서만 입력하며 비서는 읽거나 기록하지 못한다. 등록 단위 신뢰 기록은 유지하며 비서가 신뢰 단계를 실행할 수 있다.

**그래서 무엇이 안 되는가:** **비서가 사용자 확인 없이 신뢰 코드를 설치·실행할 수 있게 된다.** 잘못 생성하거나 선택한 코드가 Host OS 권한으로 실행될 위험을 수용하며 활동 기록은 예방 장벽이나 격리가 아니다. 이 결정은 플러그인 관리의 건별 승인만 제거하며 AI 권한·공급자·모델 변경을 허용하지 않는다.

## 보관 코드의 교훈과 하지 않는 것

source 직접 import 금지, 공식 쓰기·원본 보존, 요청 identity·중복 거부·uncertain/no-replay, disable 신규 차단·drain, 완료 결과만 공개하는 의미는 필요한 시나리오에서 유지·검증한다.

범용 ledger·worker orchestration·sandbox·세밀한 권한 엔진·marketplace·서명·자동 업데이트·플러그인별 dashboard DB는 선제 구축하지 않는다.

## 기존 결정과의 관계·검증

공통 SDK·Host 소유는 [ADR-0019](0019-plugin-tiers.md), 공용 작업·CLI는 [ADR-0015](0015-shared-host-operations.md), 공식 AI는 [ADR-0017](0017-bundled-client-and-official-ai.md), 화면은 [ADR-0022](0022-plugin-screen-code.md)를 따른다. 현재 구현은 [실행 계약](../design/plugin-stage1-v1.md)과 [화면 코드 계약](../design/plugin-screens-v1.md)에 둔다.
