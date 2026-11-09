# Jira community plugin 0.0.1

Jira Data Center 9.12.28의 이슈 번호 조회용 커뮤니티 플러그인입니다. 공식 공급 목록·Desktop 번들·pnpm workspace에 포함하지 않습니다. 이 폴더는 독립 저장소로 분리할 수 있는 plain ESM artifact이며 Host 제공 공개 `@litzio/plugin-sdk`만 사용합니다. 별도 설치·빌드는 필요 없습니다. 현재 사용하는 기능의 최소 계약을 따라 `requiresSdk`는 `>=0.3.0 <1.0.0`입니다.

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

설정 파일 예: `{"baseUrl":"https://jira.example.com/jira","apiUrl":""}`. 입력 파일 예: `{"keys":"ABC-123, ABC-130"}`. artifact를 고치면 validate → 현재 digest 신뢰 → reload → 실제 조회를 반복합니다. 설정·secret 변경에는 기존 Host의 자동 재적용을 사용합니다.

Plugins의 `Open view · Jira`로 화면을 엽니다. 열린 폴더 없이 조회할 수 있으며 파일은 읽거나 쓰지 않습니다. 이슈 번호를 입력하고 조회합니다. 화면을 여는 것만으로 요청하지 않으며 polling은 없습니다. CLI와 화면은 같은 공용 읽기 작업을 사용합니다.

## 이슈 페이지 링크

각 반환 행의 `issueUrl`은 BASE_URL 뒤에 `/browse/<KEY>`를 붙인 이슈 페이지 URL입니다. API URL을 별도로 지정해도 사용자용 URL은 BASE_URL로 만듭니다. 키 열은 공개 SDK의 `linkField:"issueUrl"`로 연결하며, 이슈 키를 누르면 Jira 이슈 페이지로 이동합니다. HTTP(S) URL만 공통 표의 기존 외부 링크 경로로 열립니다. 공통 표·Core 행 형식 변경이나 별도 링크 구현은 없습니다.

## 조회와 오류

쉼표로 구분한 대문자 프로젝트 키와 양의 번호를 받습니다. 입력은 최대 20개·512자이며 중복은 첫 등장 순서로 한 번만 조회합니다. 숫자 ID·JQL·번호 없는 검색·쓰기·동적 UI는 지원하지 않습니다. 각 키에 `GET <API URL>/issue/<key>`를 쿼리 없이 요청합니다. 조회 순서대로 키·제목·상태·담당자·우선순위·수정일 한 표를 반환하며 없는 값은 `—`입니다. 수정일은 서버 문자열을 보존합니다. 열 필터·정렬·가로 스크롤은 공통 Table을 사용하며 CLI의 입력이나 원행을 바꾸지 않습니다.

404는 해당 키의 상태 칸에 `이슈를 찾을 수 없습니다. 번호와 접근 권한을 확인하세요. (404)`를 표시하고 다른 키의 조회를 계속합니다. 모든 키가 404여도 같은 행을 각각 표시합니다. Jira가 권한을 숨기기 위해 404를 반환하는 경우도 구분할 수 없습니다. 다른 열은 `—`입니다.

401은 auth, 403은 forbidden, 5xx는 unavailable, 전체 조회 8초 초과는 timeout, redirect·연결 실패·잘못된 URL·비정상 JSON 등은 failed로 분류합니다. 이 경우 전체 조회가 실패하고 공통 Host의 고정 안내를 화면과 CLI에 제공합니다. 일부 성공 행을 새 성공 결과로 노출하지 않습니다. 공통 화면이 보존하는 이전 표는 이전 조회 결과라는 안내와 함께 남습니다. redirect를 따르지 않으며 응답 원문·PAT·예외 메시지를 오류에 담지 않습니다. disable/reload 시 소유한 요청을 중단합니다.

## 검증 범위

기존 `pnpm browser:test http-plugins`의 production Host/CLI/browser와 가짜 HTTP 서버를 재사용합니다. 실제 artifact 검증·등록과, Windows secret 지원 Host에서 PAT 저장·활성화·정상/일부 404 행의 UI/CLI 대조·키 링크와 BASE_URL 기반 href·401/403/500/redirect/timeout 고정 안내·오류 후 복구를 확인합니다. 다른 플랫폼은 artifact 검증만 하며 Windows secret 경계를 우회하지 않습니다. 외부 브라우저를 실제로 여는 검사는 하지 않습니다. 기존 공통 Table 검사와 다른 결함인 Jira URL/context·Bearer·상태 분류를 이 통합 경로에서 확인합니다. 새 suite나 제품 subprocess를 추가하지 않습니다. 8초 timeout은 실제 deadline을 확인하기 위한 대표 사례입니다.

`LITZIO_JIRA_MOCK=1 pnpm browser:test http-plugins`는 별도로 준비한 로컬 Jira 목업의 8081 포트에도 같은 공용 작업으로 MOCK-1/2/404를 조회합니다. 가짜 서버 검사와 Docker 목업 검사는 실제 회사 Jira 인증·사내 인증서·프록시·권한의 성공을 보증하지 않습니다. 회사 서버 확인은 소유자가 수행합니다.

`--screenshots`는 수동 검토용 1440px light와 한국어 dark 640px 캡처를 `tmp/jira-1328/`에 남깁니다. ViewWorkspace·InputForm·TextInput·SubmitButton·Table을 재사용하며 공통 UI 예외는 없습니다. 새 표면·CSS·공통 화면 변경은 없습니다.

수동 화면 근거: [1440px Light](../../docs/design/assets/jira-1328/issues-1440.png), [640px 한국어 Dark](../../docs/design/assets/jira-1328/issues-640.png). 표를 볼 수 있도록 화면 안에서 스크롤한 위치이며 Host·폴더의 로컬 식별자는 마스킹했습니다.
