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

`GET <serverUrl>/health`가 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 오류 행을 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health 확인은 변환 기능·모델 준비·인증 키의 유효성이나 변환 권한을 보증하지 않습니다. PDF 변환·큐·대조·검수는 #1322 이후 범위입니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 화면에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-1321/`에 남깁니다. 실제 Docker 결과는 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

수동 화면 근거: [1440px Light](../../docs/design/assets/docling-1321/connection-1440.png), [640px 한국어 Dark](../../docs/design/assets/docling-1321/connection-640.png). 기존 ViewWorkspace·Table·Button을 재사용하며 새 공통 UI 예외는 없습니다. 좁은 화면의 표는 공통 renderer의 가로 스크롤을 사용합니다. 로컬 경로와 계정 표시는 촬영 시 마스킹했습니다.
