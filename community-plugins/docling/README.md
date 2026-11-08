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

인증 키가 필요한 서버만 Plugins 설정 UI의 선택적 `api-key` secret에 입력합니다. 키를 일반 설정이나 JSON·명령 인자에 넣지 않습니다. 요청에는 `X-Api-Key`로 전달합니다. 설정·secret은 활성 상태에서도 저장·reload할 수 있습니다. 해당 플러그인의 K1 작업이 running/uncertain이면 변경을 거부하고 기존 값을 보존합니다. artifact 변경은 validate → 새 digest 신뢰 → reload → 실제 조회가 필요합니다.

활성화 뒤 Plugins 설정의 `Open view · Docling`이나 기존 플러그인 화면 진입점으로 조회 화면을 엽니다. 공통 뷰의 열린 폴더를 선택하고 수동 새로고침합니다(현재 공통 뷰의 폴더 선택 요구를 따르며 파일을 읽거나 쓰지 않습니다). 자동 polling은 없습니다. CLI와 화면은 같은 `community.docling.connection` 읽기 작업의 한 행을 사용합니다.

## 연결 확인 범위

`GET <serverUrl>/health`가 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 오류 행을 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health 확인은 변환 기능·모델 준비·인증 키의 유효성이나 변환 권한을 보증하지 않습니다. PDF 변환의 최종 저장 연결은 #1326을 기다립니다. 아래 작업 2는 보관된 `.docling`에서 문서를 만듭니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 화면에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-1321/`에 남깁니다. 실제 Docker 결과는 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

수동 화면 근거: [1440px Light](../../docs/design/assets/docling-1321/connection-1440.png), [640px 한국어 Dark](../../docs/design/assets/docling-1321/connection-640.png). 기존 ViewWorkspace·Table·Button을 재사용하며 새 공통 UI 예외는 없습니다. 좁은 화면의 표는 공통 renderer의 가로 스크롤을 사용합니다. 로컬 경로와 계정 표시는 촬영 시 마스킹했습니다.

## 두 작업으로 분리 (#1322 범위 정정)

현재 PR은 Draft이며 작업 1의 최종 저장 연결은 #1326을 기다립니다. 기존 PDF → Litzio 문서 단일 작업은 제거했습니다.

1. **PDF 변환(연결 대기):** `a.pdf` → `a.docling`. 원본 산출물은 수정하지 않고 보관합니다. `createDoclingArchiveFromResponse`가 성공한 inbody/embedded 응답과 원본 PDF 바이트를 받아 `.docling` 바이트를 만들며 파일 쓰기는 하지 않습니다. Host 일반 파일 K1 결과는 #1326 병합 뒤 연결합니다.
2. **Litzio 문서 만들기(구현):** `.docling` 한 건의 `document.json`으로 새 Litzio 문서를 만듭니다. Docling API·health·version을 호출하지 않으며 서버가 없어도 같은 원본에서 다른 결과 이름으로 다시 실행할 수 있습니다. 원본 `.docling`은 변경하지 않습니다.

공용 작업 화면(명령 센터 → Plugin jobs)에서 `Docling · Litzio 문서 만들기`, 열린 Host Root, `.docling` 한 건, Root 상대 결과 경로를 선택합니다. 기존 native-document K1의 새 파일 생성·충돌 거부·결과 열기·중단 계약을 그대로 사용합니다. 기본 결과 이름은 현재 공용 화면의 `result.md`입니다. 플러그인 조회 화면에서는 시작하지 않습니다.

CLI 입력 파일(artifact 밖): `{"requestId":"<새 UUID>","job":"create-document","root":"<Host Root>","file":"a.docling","output":"a.md"}`.

- `litzio plugins start community.docling --input <job.json> --host <origin> --json`
- `litzio plugins status <requestId> --host <origin> --json`
- `litzio plugins stop <requestId> --host <origin> --json`
- `litzio plugins result <requestId> --host <origin> --json`

작업마다 새 requestId를 쓰며 불확실 결과는 같은 ID로 조회합니다. start를 자동 재전송하지 않습니다. 여러 파일은 각각 별도 요청이며 큐·재시작 복원·자동 갱신·대조/검수·내부 이미지 대조뷰는 없습니다. 작업 2의 중단은 로컬 읽기/문서 생성을 중단하며 서버 작업과 무관합니다.

### `.docling` v1 봉투

플러그인 소유 ZIP32 형식이며 모든 항목은 무압축(STORE)입니다. `manifest.json`, `document.json`, `pages/<양의 페이지 번호>.png`만 포함합니다. `document.json`은 DoclingDocument 전체 필드를 그대로 JSON으로 담고, `pages`에 선언된 모든 페이지의 PNG를 별도 항목으로 보관합니다. inbody 응답의 image data URI도 원본 JSON 안에 유지하므로 이미지 바이트는 중복될 수 있습니다. 작업 2는 이를 바꾸거나 이미지를 다시 만들지 않습니다.

manifest 예:

```json
{
  "format": "docling",
  "version": 1,
  "source": { "name": "a.pdf", "sha256": "<원본 PDF SHA-256, 소문자 hex 64자>" },
  "doclingServe": { "version": "1.32.0", "options": { "to_formats": "json", "include_page_images": true, "images_scale": 1, "image_export_mode": "embedded", "target_type": "inbody", "include_images": false, "do_ocr": false } },
  "createdAt": "2026-11-09T00:00:00.000Z"
}
```

`createDoclingArchive`는 이 metadata, document JSON 문자열과 페이지 바이트를 받아 Buffer를 반환합니다. `readDoclingArchive`는 같은 봉투를 읽습니다. Node 표준 `Buffer`, `crypto`, `zlib.crc32`만 사용하며 npm 의존성·SDK 내부 import·직접 파일 쓰기·디스크 압축 해제는 없습니다. Node에 ZIP API가 없어 필요한 STORE ZIP32 헤더/목록만 플러그인에 두었습니다. 일반 ZIP/DEFLATE/ZIP64/분할 ZIP/암호화/알 수 없는 항목은 지원하지 않습니다. 경로·중복 항목·CRC·중앙/로컬 헤더·범위와 필수 페이지를 확인하고 잘못된 봉투는 실패합니다. SHA-256은 원본 기록이며 원본 PDF가 없는 작업 2에서 PDF 진위를 검증했다는 뜻이 아닙니다. Host 결과 크기·저장 정책은 #1326의 최종 계약을 따를 예정입니다.

### 실제 v1.32.0 페이지 이미지 API 확인

전용 컨테이너 `ghcr.io/docling-project/docling-serve-cu128:v1.32.0`의 `/version`과 `/openapi.json`, 작은 합성 1페이지 PDF의 실제 비동기 변환으로 확인했습니다. CPU 실행 결과이며 큰 PDF·GPU·변환 품질의 보증이 아닙니다.

- 제출: multipart `POST /v1/convert/file/async`, 파일 필드 `files`, `to_formats=json`.
- `include_page_images`: 기본 false. **true여야 전체 페이지 이미지가 포함**됩니다. `include_images`는 그림 요소 옵션이며 별개입니다(실험에서는 false).
- `images_scale`: 기본 2.0. 실험은 1.0으로 지정했고 페이지 1에 72dpi, 596×842 PNG를 받았습니다. 배율에 따른 픽셀 차이의 전수 검증은 하지 않았습니다.
- `image_export_mode`: OpenAPI enum은 placeholder/embedded/referenced, 기본 placeholder입니다.
- `target_type`: OpenAPI enum은 inbody/presigned_url/zip, 기본 inbody입니다. presigned_url은 실제 시험하지 않았습니다.
- **embedded + inbody:** `GET /v1/result/{task_id}`가 application/json을 반환합니다. `document.json_content` 안의 `pages["1"].image`에 mimetype/dpi/size/`uri: data:image/png;base64,...`가 있습니다. 이를 PNG bytes로 복원해 `.docling`을 만드는 경로를 준비했습니다.
- **referenced + zip:** 같은 결과 경로가 application/zip을 반환합니다. 실제 항목은 `sample.json`, `artifacts/`, `artifacts/page_000001_<hash>.png`였고 JSON의 페이지 image.uri는 이 상대 경로였습니다. 서버 ZIP 자체는 `.docling` 형식이 아니며 현재 reader 입력도 아닙니다.
- **referenced + inbody:** 요청은 허용됐지만 실제 JSON에는 embedded PNG data URI가 들어왔습니다. referenced 파일 제공으로 간주하지 않습니다.
- 세 시험 모두 `do_ocr=false`, `include_page_images=true`, `images_scale=1`, `include_images=false`, `to_formats=json`을 사용해 success를 확인했습니다. options는 실제 제출한 값으로 manifest에 기록합니다.

`task_id`로 `GET /v1/status/poll/{task_id}`를 조회하고 success 뒤 결과를 받습니다. 해당 OpenAPI에는 작업 취소 API가 없습니다. 작업 1 연결 시에는 로컬 요청/폴링을 중단해도 서버 작업은 계속될 수 있음을 상태와 안내에 유지해야 합니다.

### 검증 경계

기존 `http-plugins`에서 작은 합성 `.docling`을 사용합니다. 중첩 참조 순서·literal text·표 셀 텍스트와 SDK → Host 저장 → CLI/공용 화면 결과 열기, 같은 원본의 재사용, 손상 CRC 거부를 확인합니다. 가짜 서버는 health만 제공하고 변환 요청은 세어 **작업 2가 변환 API를 호출하지 않음**을 검사합니다. 기존 K1 수명/중단 fixture는 유지하고 짧은 로컬 작업을 인위적으로 늦추지 않습니다. 새 suite·workspace·subprocess는 추가하지 않습니다. ZIP 생성/읽기 바이트 보존은 이 fixture 준비에서 확인하며, 실제 API 결과의 `.docling`은 별도로 Python 표준 zipfile로 항목과 CRC를 대조했습니다. 작업 1 저장 수락은 아직 아닙니다.

### 최소 문서 변환 규칙

`body.children`에서 group/element 참조를 따라 원본 순서로 처리합니다. 1~6의 section_header는 제목, 나머지 텍스트(목록·수식·코드·각주 포함)는 일반 문단으로 낮춥니다. 표는 제공된 table_cells 순서의 텍스트를 ` | `로 연결한 문단입니다. picture 이미지는 버리고 자식 텍스트만 처리합니다. furniture, provenance, 스타일, 목록 구조, 표 병합, 이미지와 대조 자료는 Litzio 문서에 넣지 않습니다(원본 `.docling`에는 보존). 잘못된 참조·중복/순환 참조나 SDK 크기/요소 상한 초과는 실패합니다. 문서 생성은 Host 제공 `authorDocument`만 사용하며 Host가 공식 write path로 저장합니다. 이 규칙은 구조 유효성의 최소 사례이며 원본 충실도·변환 품질의 보증이 아닙니다.
