# Jira community plugin 0.0.4

Jira Data Center 9.12.28 대상 읽기 전용 커뮤니티 플러그인입니다. JQL 검색이 기본이며 간편 검색은 같은 검색 경로 위에서 JQL을 조립합니다. 보고서 작성에 활용할 목록·설명·최근 댓글을 조회합니다. Jira 쓰기와 저장 필터 불러오기는 제공하지 않습니다.

이 폴더는 독립 배포 전 plain ESM artifact이며 공식 공급 목록·Desktop 번들·pnpm workspace에 포함하지 않습니다. 공개 `@litzio/plugin-sdk`만 사용하고 별도 빌드는 필요 없습니다. 최소 SDK는 `>=0.3.0 <1.0.0`입니다.

## 설정과 실행

대상 Host의 Plugins 설정에서 BASE_URL(예: `https://jira.example.com/jira`)과 필수 `pat` secret을 저장합니다. API URL을 비우면 BASE_URL/rest/api/2를 사용합니다. context path를 유지합니다. URL은 절대 HTTP(S)이며 자격 증명·query·fragment를 거부합니다. API URL은 다른 origin도 허용하므로 PAT를 보낼 대상인지 확인하세요. PAT는 비밀번호 입력으로만 저장하며 일반 설정·대화·명령 인자·입력 JSON에 넣지 않습니다. Windows Host secret 저장소와 Bearer 인증을 사용합니다.

설정·입력 JSON은 artifact 밖에 둡니다. 아래 placeholder를 실제 대상으로 바꿉니다.

1. `litzio plugins validate <artifact> --host <origin> --json`
2. `litzio plugins register <artifact> --host <origin> --json`
3. `litzio plugins settings community.jira --file <settings.json> --host <origin> --json`
4. Plugins 설정에서 `pat` secret을 저장합니다.
5. `litzio plugins list --host <origin> --json`으로 현재 digest를 확인합니다.
6. `litzio plugins trust community.jira --digest <digest> --host <origin> --json`
7. `litzio plugins enable community.jira --host <origin> --json`
8. `litzio operation invoke community.jira.jql --input <input.json> --host <origin> --json`

설정 예: `{"baseUrl":"https://jira.example.com/jira","apiUrl":""}`. artifact 수정 시 validate → 현재 digest 신뢰 → reload → 실제 조회를 반복합니다. 설정·secret 변경에는 Host 자동 재적용을 사용합니다.

설정의 연결 확인과 CLI `community.jira.connection`은 입력 `{}`로 GET /myself를 호출합니다. 5초 제한 안에서 사용자 이름 형식을 확인하고 고정 `{ok,message}`만 반환합니다. 사용자 정보·원문·PAT는 표시하지 않습니다. 이 성공은 개별 이슈 권한을 보증하지 않습니다.

## 0.0.4 검색과 상세 계약

사이드바 Jira 화면은 **JQL**과 **간편 검색** 두 기본 뷰를 제공합니다. ViewWorkspace·InputForm·TextInput·Select·SubmitButton·Table을 재사용하며 새 CSS·공통 UI 예외는 없습니다. 열린 폴더 없이 수동 조회하고 화면 열기만으로 요청하거나 polling하지 않습니다. CLI·화면·비서는 같은 host read 작업을 사용합니다.

### JQL 검색

`community.jira.jql` v1 입력 예: `{"jql":"assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC"}`. JQL은 비어 있지 않은 최대 4000자 문자열입니다. 임의 JQL을 Jira에 그대로 전달하며 자체 parser를 구현하지 않습니다.

GET /search에 startAt=0/maxResults=500부터 요청하며 남은 500행 상한에 맞춰 페이지 크기를 줄입니다. fields에는 summary, status, assignee, reporter, created, updated, priority, issuetype, resolution, duedate, components, labels만 지정합니다. 서버가 페이지 크기를 줄이거나 더 적은 이슈를 반환해도 실제 반환 건수로 offset을 늘리며 순차 요청합니다. 한 번의 검색 전체에 8초 deadline과 최대 500행 상한을 적용합니다. 500행보다 많은 전체 결과는 잘림을 별도 표시하지 않습니다. 전체 내보내기 기능이 아니며 공통 표 잘림 안내는 후속 후보입니다. 간편 검색도 이 함수의 페이지 처리·행 변환·상한·오류를 그대로 사용합니다.

### 간편 검색

`community.jira.issues` v4는 계정(`account`, 비우면 currentUser), 해결 여부(`status`, 기본 미해결), 번호(`keys`), 프로젝트 키(`project`), 보고자 계정(`reporter`), 기간 기준(`dateField`, 수정일 기본/생성일), 시작일(`dateFrom`), 종료일(`dateTo`)의 8개 입력을 받습니다.

입력 예: `{"project":"MOCK","reporter":"example.user","dateField":"생성일","dateFrom":"2026-11-01","dateTo":"2026-11-09"}`. 조건을 AND로 조합하고 계정·보고자 전체 문자열의 backslash·큰따옴표를 escape하며 제어 문자는 거부합니다. 프로젝트는 대문자 키만 허용합니다. 날짜는 유효한 YYYY-MM-DD이고 역전 기간은 거부합니다. 시작일 이상·종료일 다음 날 미만으로 해당 날짜 전체를 포함합니다(Jira 시간대). 두 날짜가 비어 있으면 기간 조건을 붙이지 않습니다. 생성일과 수정일 기간을 동시에 거는 조건은 지원하지 않음. 기간 기준과 관계없이 최근 수정순입니다.

번호는 쉼표로 구분한 대문자 키 최대 20개·512자이며 중복을 제거합니다. 번호 입력 시 다른 조건을 무시하고 `key in (...) ORDER BY updated DESC`를 조립합니다. 예: `{"keys":"ABC-123, ABC-130"}`. 0.0.2의 키별 GET/404 자리 행은 검색 결과로 바뀌었습니다. 없는 번호·권한상 보이지 않는 번호는 반환되지 않으며 입력 순서를 보장하지 않습니다. 404 여부가 필요하면 상세 작업을 사용합니다.

### 결과와 오류

기본 열은 Key(링크)·제목·Status·Assignee·Reporter·Created·Updated 순서입니다. Priority·issueType·resolution·dueDate·components·labels도 outputSchema·rowSchema와 행 데이터에 보존하되 기본 columns에서 제외합니다. 열 추가·제거는 #1351 후속입니다. 없는 값과 해석할 수 없는 시각은 `—`입니다. Created·Updated는 Host PC 현지 시간의 `YY-MM-DD HH:mm`, 날짜만 있는 dueDate는 `YY-MM-DD`로 반환합니다. 댓글 시각과 fetchedAt도 같은 현지 시각 형식입니다. 고정 폭 문자열은 같은 세기 안에서 현지 시각 순서로 정렬됩니다. 초·원문 시간대는 보존하지 않으며 DST로 현지 시각이 반복되는 구간이나 세기 경계의 절대 시각 순서는 보장하지 않습니다. 키의 issueUrl은 BASE_URL/browse/KEY로 만들고 공개 linkField로 Jira 원본을 엽니다. 별도 상세 패널은 없습니다.

401→auth, 403→forbidden, 404→not_found, 5xx→unavailable, 8초 초과→timeout, 400·redirect·연결 실패·비정상 응답→failed입니다. 모두 기존 Host 고정 안내를 사용하며 PAT·예외·Jira 원문(errorMessages 포함)을 노출하지 않습니다. JQL 오류의 자세한 이유는 표시하지 않음. 결과 대신 오류가 나오면 JQL 문법과 필드 이름을 확인하고, 자세한 이유는 Jira 웹의 이슈 검색에서 같은 JQL로 확인하세요. 같은 안내를 JQL 입력 툴팁에도 둡니다. 일부 페이지 성공 후 실패도 전체 실패이며 이전 표는 이전 조회 안내와 함께 보존합니다. redirect는 거부하고 disable/reload는 소유한 요청을 취소합니다.

### 이슈 상세

`community.jira.detail` v1 입력은 `{"key":"MOCK-1"}`입니다. CLI `operation invoke community.jira.detail`과 비서가 같은 작업을 사용합니다. 이슈 GET 뒤 GET /issue/KEY/comment?orderBy=-created&startAt=0&maxResults=10을 호출합니다. [Jira REST 댓글 계약](https://docs.atlassian.com/software/jira/docs/api/REST/9.12.2/#api/2/issue-getComments)에 따라 생성 시각 내림차순으로 최대 10개를 읽습니다. 10개는 보고서 문맥과 8초 deadline·출력 크기를 제한하기 위한 상한입니다. 수정된 옛 댓글을 최신 생성 댓글로 취급하지 않습니다. 서버가 더 작은 페이지를 반환하면 받은 범위만 돌려줍니다.

키·URL·조회 완료 Host 현지 시각(fetchedAt)·commentsTotal(권한상 보이는 전체 수)·commentsStartAt(내림차순 offset 0)·commentsReturned를 반환합니다. 설명은 최대 16000, 댓글 본문은 각각 최대 4000 UTF-16 code units이고 descriptionTruncated/bodyTruncated로 잘림을 표시합니다. null 설명은 빈 문자열이며 그 외 비문자열은 실패합니다. HTML·wiki 원문은 텍스트로만 다루고 실행하지 않습니다. 댓글 조회 실패 시 부분 성공은 없으며 상세 404도 고정 not_found입니다. 동시 댓글 증감의 트랜잭션 스냅샷은 보장하지 않습니다.

## 검증 범위

`pnpm browser:test http-plugins`의 기존 production Host·CLI·browser·가짜 HTTP 서버를 보완합니다. JQL 정상·400 고정 안내, 페이지·500행 상한, 간편 검색 JQL 조립, 기본 열과 링크, 상세 본문·최근 댓글 범위·잘림, 기존 안전 오류를 검사합니다. 낮은 계층의 기존 plugins.test.ts에서 날짜·escape·빈 댓글·비문자열 설명을 확인합니다. 즐겨찾기 UI에는 의존하지 않습니다.

`LITZIO_JIRA_MOCK=1`은 별도 준비한 로컬 Docker Jira 8081의 연결 확인과 지원하는 현재 사용자 전체 검색만 확인합니다. 목업은 임의 JQL·key-in·댓글을 지원하지 않으며 저장소를 수정하지 않습니다. 실제 Jira 인증·사내 인증서·프록시·권한·댓글 정렬·날짜 시간대는 소유자 확인이 필요합니다. 비서 실제 요약과 시각 검토 실행 결과는 PR에 별도로 기록합니다.

`--screenshots`의 Jira 수동 검토 이미지는 tmp/jira-1350에 생성합니다. 0.0.2 이전 근거는 [1440px](../../docs/design/assets/jira-1345/issues-1440.png)와 [640px 한국어 Dark](../../docs/design/assets/jira-1345/issues-640-ko-dark.png)에 보존하며 이번 버전의 근거로 간주하지 않습니다.

0.0.4 수동 검토: 1440px [변경 전](../../docs/design/assets/jira-1362/before-1440.png) / [변경 후](../../docs/design/assets/jira-1362/after-1440.png), 640px 한국어 Dark [변경 전](../../docs/design/assets/jira-1362/before-640-ko-dark.png) / [변경 후](../../docs/design/assets/jira-1362/after-640-ko-dark.png). 기존 InputForm/Table의 폼 정렬·줄바꿈·표 가로 스크롤과 축약 날짜를 확인했습니다. 새 표면·공통 UI 예외는 없습니다. 합성 데이터이며 실제 회사 Jira 확인은 소유자가 수행합니다.

0.0.3 수동 검토: [1440px](../../docs/design/assets/jira-1350/issues-1440.png), [640px 한국어 Dark](../../docs/design/assets/jira-1350/issues-640-ko-dark.png). 합성 데이터·마스킹된 Host 정보로 폼 정렬, 한국어 줄바꿈, 기본 7열, 키 링크와 표 가로 스크롤을 확인했습니다.

아이콘: [Lucide Ticket](https://lucide.dev/icons/ticket), lucide-react 1.47.0, ISC License ([고지](LICENSE-icon.txt)); 앱의 기존 아이콘 세트에서 가져와 선 색만 조정한 일반 티켓 SVG이며 Jira/Atlassian 로고를 사용하지 않습니다.

아이콘 수동 검토: [설정 목록 1440px](../../docs/design/assets/jira-1350/settings-1440.png), [한국어 Dark 640px](../../docs/design/assets/jira-1350/settings-640-ko-dark.png). 위 조회 캡처의 사이드바·탭과 함께 세 진입점의 티켓 SVG를 확인했습니다. 설정 목록 촬영용 임시 body는 캡처 후 제거했으며 자동 검사에 촬영 순회를 추가하지 않습니다.
