# Jira community plugin 0.0.2

Jira Data Center 9.12.28의 할당 이슈·이슈 번호 조회용 커뮤니티 플러그인입니다. 공식 공급 목록·Desktop 번들·pnpm workspace에 포함하지 않습니다. 이 폴더는 독립 저장소로 분리할 수 있는 plain ESM artifact이며 Host 제공 공개 `@litzio/plugin-sdk`만 사용합니다. 별도 설치·빌드는 필요 없습니다. 현재 사용하는 기능의 최소 계약을 따라 `requiresSdk`는 `>=0.3.0 <1.0.0`입니다.

## 설정과 실행

대상 Host의 Plugins 설정에서 BASE_URL(예: `https://jira.example.com/jira`)을 입력합니다. API URL은 REST API 기본 주소이며, 비우면 BASE_URL 뒤에 `/rest/api/2`를 붙입니다. context path를 유지합니다. 두 주소는 절대 HTTP(S) URL이어야 하며 자격 증명·query·fragment를 거부합니다. API URL은 BASE_URL과 다른 origin도 명시할 수 있으므로 PAT를 보낼 대상인지 확인하세요. PAT는 필수 `pat` secret으로 비밀번호 입력에만 넣으며 `Authorization: Bearer`로 전송합니다. 일반 설정·대화·명령 인자·입력 JSON에 넣지 않습니다. secret은 Windows Host의 저장소를 사용합니다.

아래 placeholder는 실제 대상으로 바꾸고, 설정·입력 파일은 artifact 밖에 둡니다.

1. `litzio plugins validate <artifact> --host <origin> --json`
2. `litzio plugins register <artifact> --host <origin> --json`
3. `litzio plugins settings community.jira --file <settings.json> --host <origin> --json`
4. Plugins 설정에서 `pat` secret을 저장합니다.
5. `litzio plugins list --host <origin> --json`에서 현재 digest를 확인합니다.
6. `litzio plugins trust community.jira --digest <digest> --host <origin> --json`
7. `litzio plugins enable community.jira --host <origin> --json`
8. `litzio operation invoke community.jira.issues --input <input.json> --host <origin> --json`

설정 파일 예: `{"baseUrl":"https://jira.example.com/jira","apiUrl":""}`. 입력 파일 예: `{}`(내 미해결), `{"account":"example.user","status":"전체"}`(다른 계정 전체), `{"keys":"ABC-123, ABC-130"}`(번호 조회). artifact를 고치면 validate → 현재 digest 신뢰 → reload → 실제 조회를 반복합니다. 설정·secret 변경에는 기존 Host의 자동 재적용을 사용합니다.

사이드바의 `Jira`로 조회 화면을 엽니다. 설정은 Plugins 목록 오른쪽의 Jira 설정 톱니로 엽니다. 열린 폴더 없이 조회할 수 있으며 파일은 읽거나 쓰지 않습니다. 계정은 비우면 PAT의 현재 사용자이며, 해결 여부는 미해결이 기본입니다. 해결됨·전체도 선택할 수 있습니다. [조회]를 눌러 실행합니다. 이슈 번호를 보조 입력에 넣으면 계정·해결 여부 대신 번호로 조회합니다. 화면을 여는 것만으로 요청하지 않으며 polling은 없습니다. CLI와 화면은 같은 공용 읽기 작업을 사용합니다.

## 설정 창에서 연결 확인

저장한 BASE_URL/API URL과 PAT로 `GET <API URL>/myself`를 요청합니다. [Jira 9.12 REST API 문서](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.2/#api/2/myself-getUser)의 익명 접근을 허용하지 않는 현재 사용자 조회이며 목업도 같은 경로를 지원합니다. 사용자 정보는 반환·표시하지 않고 응답의 사용자 이름 필드를 확인한 뒤 고정 안내만 반환합니다. 401은 PAT 확인, 403은 권한 문의, 연결 실패는 주소·네트워크 확인, 5초 초과는 연결 시간 초과로 구분합니다. redirect·서버 응답·형식 오류도 고정 안내이며 원문·PAT를 포함하지 않습니다. 설정 창 연결 확인 버튼과 CLI `community.jira.connection` 공용 읽기 작업은 동일한 `{ok,message}`를 사용합니다(입력 `{}`). 이 확인은 이슈별 열람 권한을 보증하지 않습니다.

## 이슈 페이지 링크

각 반환 행의 `issueUrl`은 BASE_URL 뒤에 `/browse/<KEY>`를 붙인 이슈 페이지 URL입니다. API URL을 별도로 지정해도 사용자용 URL은 BASE_URL로 만듭니다. 키 열은 공개 SDK의 `linkField:"issueUrl"`로 연결하며, 이슈 키를 누르면 Jira 이슈 페이지로 이동합니다. HTTP(S) URL만 공통 표의 기존 외부 링크 경로로 열립니다. 공통 표·Core 행 형식 변경이나 별도 링크 구현은 없습니다.

## 조회와 오류

할당 조회는 `GET <API URL>/search`와 JQL `assignee = currentUser()` 또는 `assignee = "<계정>"`을 사용합니다. 계정의 backslash와 큰따옴표를 escape하며 제어 문자는 거부합니다. 미해결은 `AND resolution = Unresolved`, 해결됨은 `AND resolution IS NOT EMPTY`, 전체는 resolution 조건 없이 `ORDER BY updated DESC`를 붙입니다. 상태명이 아니라 resolution으로 해결 여부를 판정합니다. 선택 입력을 비워도 같은 기본값을 사용합니다.

페이지는 `startAt=0`, `maxResults=100`으로 시작하고 실제 반환 건수만큼 offset을 증가시킵니다. 전체 조회는 8초 안에 완료해야 합니다. 최대 500건까지 표시하며, 넘는 경우 따로 알리지 않음. 500건은 수동 업무 목록과 10초 Host RPC 안의 요청·렌더링을 제한하기 위한 상한이며 전체 내보내기 기능은 아닙니다. 화면은 공통 표의 행 수만 표시합니다. CLI도 동일한 최대 500행 배열을 받습니다.

하나의 InputForm에서 계정·Select·보조 번호 입력을 받는 방식이 현재 단일 source 카탈로그에서 가장 단순합니다. 별도 뷰나 조회 모드 입력은 추가하지 않습니다. 공통 계약의 한계로 자동 첫 조회·행 Tooltip·입력 옆 버튼 배치·결과 잘림 안내는 제공하지 않습니다. 수동 조회, 짧은 행 상태, 기존 마지막 행 버튼 배치를 사용하며 SDK와 제품 공통 부품은 수정하지 않습니다.

쉼표로 구분한 대문자 프로젝트 키와 양의 번호를 받습니다. 입력은 최대 20개·512자이며 중복은 첫 등장 순서로 한 번만 조회합니다. 숫자 ID·JQL 직접 입력·쓰기·동적 UI는 지원하지 않습니다. 각 키에 `GET <API URL>/issue/<key>`를 쿼리 없이 요청합니다. 조회 순서대로 키·제목·상태·담당자·우선순위·수정일 한 표를 반환하며 없는 값은 `—`입니다. 수정일은 서버 문자열을 보존합니다. 열 필터·정렬·가로 스크롤은 공통 Table을 사용하며 CLI의 입력이나 원행을 바꾸지 않습니다.

404는 해당 키의 상태 칸에 `없음 (404)`를 표시하고 다른 키의 조회를 계속합니다. 모든 키가 404여도 같은 행을 각각 표시합니다. Jira가 권한을 숨기기 위해 404를 반환하는 경우도 구분할 수 없습니다. 다른 열은 `—`입니다.

401은 auth, 403은 forbidden, 5xx는 unavailable, 전체 조회 8초 초과는 timeout, redirect·연결 실패·잘못된 URL·비정상 JSON 등은 failed로 분류합니다. 이 경우 전체 조회가 실패하고 공통 Host의 고정 안내를 화면과 CLI에 제공합니다. 일부 성공 행을 새 성공 결과로 노출하지 않습니다. 공통 화면이 보존하는 이전 표는 이전 조회 결과라는 안내와 함께 남습니다. redirect를 따르지 않으며 응답 원문·PAT·예외 메시지를 오류에 담지 않습니다. disable/reload 시 소유한 요청을 중단합니다.

## 검증 범위

기존 `pnpm browser:test http-plugins`의 production Host/CLI/browser와 가짜 HTTP 서버를 재사용합니다. 실제 artifact 검증·등록과, Windows secret 지원 Host에서 PAT 저장·활성화·정상/일부 404 행의 UI/CLI 대조·키 링크와 BASE_URL 기반 href·401/403/500/redirect/timeout 고정 안내·오류 후 복구를 확인합니다. 다른 플랫폼은 artifact 검증만 하며 Windows secret 경계를 우회하지 않습니다. 외부 브라우저를 실제로 여는 검사는 하지 않습니다. 기존 공통 Table 검사와 다른 결함인 Jira URL/context·Bearer·상태 분류를 이 통합 경로에서 확인합니다. 새 suite나 제품 subprocess를 추가하지 않습니다. 8초 timeout은 실제 deadline을 확인하기 위한 대표 사례입니다.

`$env:LITZIO_JIRA_MOCK="1"; pnpm browser:test http-plugins`는 별도로 준비한 로컬 Jira 목업의 8081 포트에도 같은 공용 작업으로 현재 사용자 전체 검색(서버 페이지 상한 2, 4행)과 MOCK-1/2/404를 조회합니다. 목업 v2는 임의 계정 JQL을 지원하지 않으므로 다른 계정과 escape·501건 상한은 가짜 서버로 확인합니다. 실제 Jira 기준 요청과 목업의 지원 요청 사이에 별도 변환은 없습니다. 가짜 서버 검사와 Docker 목업 검사는 실제 회사 Jira 인증·사내 인증서·프록시·권한의 성공을 보증하지 않습니다. 회사 서버 확인은 소유자가 수행합니다.

`--screenshots`는 수동 검토용 1440px light와 한국어 dark 640px 캡처를 `tmp/jira-1345/`에 남깁니다. ViewWorkspace·InputForm·TextInput·SubmitButton·Table을 재사용하며 공통 UI 예외는 없습니다. 새 표면·CSS·공통 화면 변경은 없습니다.

0.0.1의 이전 화면 근거는 [1440px](../../docs/design/assets/jira-1328/issues-1440.png)와 [640px](../../docs/design/assets/jira-1328/issues-640.png)에 보존합니다. 0.0.2의 근거로 간주하지 않습니다.

0.0.2 수동 검토: [1440px](../../docs/design/assets/jira-1345/issues-1440.png), [640px 한국어 Dark](../../docs/design/assets/jira-1345/issues-640-ko-dark.png). 계정·상태·번호 입력, 기존 마지막 행 버튼, 표 정렬·가로 스크롤과 짧은 행 안내를 확인했습니다. 로컬 식별자는 마스킹하고 합성 이슈만 사용했습니다.
