# Docling community plugin

소유자 개인 작업을 위한 실험 플러그인입니다. Litzio 공식 공급·번들·기본 활성 플러그인이 아닙니다. 이 디렉터리만 독립 저장소로 옮길 수 있으며 pnpm workspace에 속하지 않습니다.

## 사용

외부 scaffold와 같은 plain ESM artifact입니다. 설치·빌드 없이 대상 Host가 공개 SDK를 제공합니다. `host.js`, manifest, package.json, 편집기용 starter 타입 힌트가 함께 있습니다. SDK를 npm 설치하거나 내부 패키지를 import하지 않습니다.

아래 명령의 `<origin>`, `<artifact>`, `<settings.json>`, `<input.json>`은 실제 대상에 맞게 지정합니다. CLI에는 `--host <origin> --json`을 항상 붙입니다.

1. `litzio plugins validate <artifact> --host <origin> --json`
2. `litzio plugins register <artifact> --host <origin> --json`
3. `litzio plugins settings community.docling --file <settings.json> --host <origin> --json`
4. `litzio plugins list --host <origin> --json`에서 현재 digest를 확인합니다.
5. `litzio plugins trust community.docling --digest <digest> --host <origin> --json`
6. `litzio plugins enable community.docling --host <origin> --json`
7. `litzio operation invoke community.docling.connection --input <input.json> --host <origin> --json`

설정 파일은 `{"serverUrl":"http://127.0.0.1:5001"}`, 입력 파일은 `{}`입니다. 이 파일들은 artifact 밖에 둡니다. 기본 주소는 `http://127.0.0.1:5001`이며 서버 base path도 지원합니다. HTTP(S)만 허용하며 URL 안 자격 증명·query·fragment는 거부합니다. 주소는 대상 Host에서 접근합니다.

인증 키가 필요한 서버만 Plugins 설정 UI의 선택적 `api-key` secret에 입력합니다. 키를 일반 설정이나 JSON·명령 인자에 넣지 않습니다. 요청에는 `X-Api-Key`로 전달합니다. 설정·secret 변경은 끄기 → 수정 → 켜기로 진행합니다. artifact 변경은 validate → 새 digest 신뢰 → reload → 실제 조회가 필요합니다.

활성화 뒤 Plugins 설정의 `Open view · Docling`이나 기존 플러그인 화면 진입점으로 조회 화면을 엽니다. 공통 뷰의 열린 폴더를 선택하고 수동 새로고침합니다(현재 공통 뷰의 폴더 선택 요구를 따르며 파일을 읽거나 쓰지 않습니다). 자동 polling은 없습니다. CLI와 화면은 같은 `community.docling.connection` 읽기 작업의 한 행을 사용합니다.

## 연결 확인 범위

`GET <serverUrl>/health`가 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 오류 행을 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health 확인은 변환 기능·모델 준비·인증 키의 유효성이나 변환 권한을 보증하지 않습니다. PDF 변환은 아래 K1 작업을 사용하며 큐·대조·검수는 제공하지 않습니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 화면에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-1321/`에 남깁니다. 실제 Docker 결과는 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

수동 화면 근거: [1440px Light](../../docs/design/assets/docling-1321/connection-1440.png), [640px 한국어 Dark](../../docs/design/assets/docling-1321/connection-640.png). 기존 ViewWorkspace·Table·Button을 재사용하며 새 공통 UI 예외는 없습니다. 좁은 화면의 표는 공통 renderer의 가로 스크롤을 사용합니다. 로컬 경로와 계정 표시는 촬영 시 마스킹했습니다.

## PDF 한 건 변환 (#1322)

공용 작업 화면(명령 센터 → Plugin jobs)에서 `Docling · PDF 변환`, 열린 Host Root, PDF 한 건, Root 상대 결과 경로를 선택해 시작합니다. 기본 결과 이름은 공용 K1 화면의 `result.md`이며 새 파일만 생성하고 덮어쓰지 않습니다. 상태·결과 열기·중단은 기존 공용 K1 화면을 사용합니다. 플러그인 연결 조회 화면에서는 시작하지 않습니다.

CLI 입력 파일(artifact 밖): `{"requestId":"<새 UUID>","job":"convert","root":"<Host Root>","file":"sample.pdf","output":"result.md"}`.

- `litzio plugins start community.docling --input <job.json> --host <origin> --json`
- `litzio plugins status <requestId> --host <origin> --json`
- `litzio plugins stop <requestId> --host <origin> --json`
- `litzio plugins result <requestId> --host <origin> --json`

작업마다 새 requestId를 쓰며 불확실 결과는 같은 ID로 조회합니다. start를 자동 재전송하지 않습니다. 여러 PDF는 파일마다 별도 명시 요청입니다. Host 큐·스케줄러·재시작 복원·자동 갱신은 없습니다.

v1.32.0 컨테이너의 실제 `/openapi.json`에서 확인한 계약: multipart `POST /v1/convert/file/async`에 `files`, `to_formats=json`, `target_type=inbody`, `image_export_mode=placeholder`를 보냅니다. 응답의 `task_id`로 `GET /v1/status/poll/{task_id}`를 1초 간격 조회하고 `success` 뒤 `GET /v1/result/{task_id}`의 `document.json_content`를 사용합니다. pending/started는 진행 중이며 failure/partial_success/skipped는 실패로 처리해 부분 문서를 성공으로 저장하지 않습니다. HTTP 오류는 SDK 오류 종류로 분류하며 서버 응답·예외 원문을 공개하지 않습니다. 개별 HTTP 요청 제한은 30초이며 작업 전체 시간 제한은 없습니다.

**중단 한계:** 해당 OpenAPI에는 작업 취소 API가 없습니다. 중단은 로컬 파일 읽기·HTTP 요청·대기·폴링을 중단하고 결과 생성을 막는다는 뜻입니다. K1 `stopped`와 phase에 이 범위를 표시합니다. 서버에 이미 제출한 작업은 계속될 수 있습니다. disable/reload/dispose도 소유한 로컬 자원을 중단하며 서버 작업을 재개하지 않습니다.

### 최소 변환 규칙

`body.children`에서 group/element 참조를 따라 원본 순서로 처리합니다. 1~6의 section_header는 제목, 나머지 텍스트(목록·수식·코드·각주 포함)는 일반 문단으로 낮춥니다. 표는 제공된 table_cells 순서의 텍스트를 ` | `로 연결한 문단입니다. picture 이미지는 버리고 자식 텍스트만 처리합니다. furniture, provenance, 스타일, 목록 구조, 표 병합, 이미지와 대조 자료는 저장하지 않습니다. 잘못된 참조·중복/순환 참조나 SDK 크기/요소 상한 초과는 실패하며 조용히 잘라 저장하지 않습니다. 문서 생성은 Host 제공 `authorDocument`만 사용하고 Host가 공식 write path로 저장합니다. 이 규칙은 구조 유효성의 최소 사례이며 원본 충실도·변환 품질의 보증이 아닙니다.

검증은 기존 `http-plugins`의 가짜 서버를 확장합니다. 합성 PDF 업로드 → 중첩 참조의 DoclingDocument → SDK 생성 → Host 저장/CLI 결과 → 공용 화면 열기를 검증하고 서버 failure와 로컬 중단을 대표 사례로 확인합니다. 기존 K1 fixture와 다른 결함은 외부 API 요청 형식과 Docling 해석·SDK 결합이며 새 suite나 subprocess는 추가하지 않습니다. 실제 컨테이너 수락은 별도 PR 검증 기록으로 구분합니다.
