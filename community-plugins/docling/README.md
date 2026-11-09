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

활성화 뒤 Plugins 설정의 `Open view · Docling`이나 기존 플러그인 화면 진입점으로 조회 화면을 엽니다. 연결 조회는 Host 범위이며 열린 폴더 없이 수동 새로고침합니다. 파일을 읽거나 쓰지 않습니다. PDF/문서 K1 작업에서는 별도로 열린 Host Root를 선택합니다. 자동 polling은 없습니다. CLI와 화면은 같은 `community.docling.connection` 읽기 작업의 한 행을 사용합니다.

## 연결 확인 범위

`GET <serverUrl>/health`와 `/ready`가 모두 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 오류 행을 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health/ready 확인은 요청한 모든 모델의 준비·변환 성공·인증 권한을 보증하지 않습니다. PDF 변환은 아래 공용 K1 작업을 사용합니다. 작업 2는 보관된 `.docling`에서 서버 호출 없이 문서를 만듭니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 화면에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-1321/`에 남깁니다. 실제 Docker 결과는 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

수동 화면 근거: [1440px Light](../../docs/design/assets/docling-1321/connection-1440.png), [640px 한국어 Dark](../../docs/design/assets/docling-1321/connection-640.png). 기존 ViewWorkspace·Table·Button을 재사용하며 새 공통 UI 예외는 없습니다. 좁은 화면의 표는 공통 renderer의 가로 스크롤을 사용합니다. 로컬 경로와 계정 표시는 촬영 시 마스킹했습니다.

## 버전

플러그인 버전은 **0.0.1**입니다. [CHANGELOG](CHANGELOG.md)와 미확정 [ROADMAP](ROADMAP.md)을 참고하세요. `.docling` manifest에는 생성한 플러그인 버전(`converter.pluginVersion`)과 ZIP 형식 번호(`version: 1`)를 기록합니다. 출처·서버·프로필 기록은 원본 재현을 위해 유지하며 문서 변환 정책 버전은 두지 않습니다. 결과 `.md` 본문에는 버전이나 입력 hash 문단을 추가하지 않습니다.

일반 파일 결과의 최소 공개 계약에 따라 `requiresSdk: ">=0.2.0 <1.0.0"`을 선언합니다.

## 두 작업으로 분리 (#1322 범위 정정)

PDF 원본 보관과 Litzio 문서 만들기는 별도 K1 작업입니다. 한 요청에 파일 하나를 처리합니다.

1. **PDF 변환:** `a.pdf` → `a.docling`. 원본 산출물은 수정하지 않고 보관합니다. `convertPdfToArchive`가 고정 프로필로 서버를 확인·변환하고 `createDoclingArchiveFromResult`가 원본 HTTP 응답 바이트와 PDF 바이트를 받아 `.docling` 바이트를 만들며 파일 쓰기는 하지 않습니다. 플러그인은 Host가 제공한 `resultFile.path`에 ZIP 바이트를 쓰고 닫은 뒤 `file:{path}`만 반환합니다. Host가 Root에 새 파일로 원자적으로 저장하며 기본 이름은 `a.pdf` → `a.docling`입니다. ZIP 바이트를 IPC로 보내거나 output에 직접 쓰지 않습니다.
2. **Litzio 문서 만들기(구현):** `.docling` 한 건의 `document.json`으로 새 Litzio 문서를 만듭니다. Docling API·health·version을 호출하지 않으며 서버가 없어도 같은 원본에서 다른 결과 이름으로 다시 실행할 수 있습니다. 원본 `.docling`은 변경하지 않습니다.

공용 작업 화면(명령 센터 → Plugin jobs)에서 `Docling · PDF 변환` 또는 `Docling · Litzio 문서 만들기`, 열린 Host Root, 입력 파일과 Root 상대 결과 경로를 선택합니다. PDF 결과는 파일 경로/복사, 문서 결과는 기존 결과 열기를 제공합니다. 문서 작업의 기본 이름은 기존 `result.md`이며 `a.md`처럼 직접 지정할 수 있습니다. 플러그인 조회 화면에서는 시작하지 않습니다.

CLI 입력 파일은 artifact 밖에 둡니다.

- PDF 보관: `{"requestId":"<새 UUID>","job":"convert-pdf","root":"<Host Root>","file":"a.pdf"}`. output 생략 시 Host가 `a.docling`으로 정합니다.
- 문서 만들기: `{"requestId":"<새 UUID>","job":"create-document","root":"<Host Root>","file":"a.docling","output":"a.md"}`.


- `litzio plugins start community.docling --input <job.json> --host <origin> --json`
- `litzio plugins status <requestId> --host <origin> --json`
- `litzio plugins stop <requestId> --host <origin> --json`
- `litzio plugins result <requestId> --host <origin> --json`

작업마다 새 requestId를 쓰며 불확실 결과는 같은 ID로 조회합니다. start를 자동 재전송하지 않습니다. 여러 파일은 각각 별도 요청이며 큐·재시작 복원·자동 갱신·대조/검수·내부 이미지 대조뷰는 없습니다. PDF 중단은 요청/폴링과 staging writer를 닫은 뒤 stopped를 보고하며 이미 제출된 서버 작업은 계속될 수 있습니다. 문서 작업의 중단은 로컬 읽기/생성을 중단하며 서버와 무관합니다.

### `.docling` 형식 1 봉투

플러그인 소유 ZIP32 형식이며 모든 항목은 무압축(STORE)입니다. `manifest.json`, `document.json`, `pages/<양의 페이지 번호>.png`만 포함합니다. `document.json`은 DoclingDocument 전체 필드를 그대로 JSON으로 담고, `pages`에 선언된 모든 페이지의 PNG를 별도 항목으로 보관합니다. inbody 응답의 image data URI도 원본 JSON 안에 유지하므로 이미지 바이트는 중복될 수 있습니다. 작업 2는 이를 바꾸거나 이미지를 다시 만들지 않습니다.

`manifest.json`은 다음 출처 정보를 담습니다. 원본 절대 경로와 secret은 넣지 않습니다.

| 필드 | 기록 |
| --- | --- |
| format/version/status/createdAt | docling / 1 / success / 완료 UTC 시각 |
| converter | 이 원본 파일을 만든 플러그인 버전 |
| source | 원본 파일 이름, SHA-256, 바이트 수 |
| server | `/version`의 버전들, 실제 OpenAPI SHA-256, 프로필의 기준 hash와 일치 여부(차이만으로 거부하지 않음) |
| profile | 보관 고정 프로필 전체: ID, 서버/문서 버전, 출처, request 전체 |
| task | task ID, 시작·제출·결과 수신 시각과 경과 ms |
| result | 원본 HTTP 결과 본문 바이트의 SHA-256와 크기 |
| document | 저장 JSON SHA-256와 크기, schema/version/pageCount |
| images | ImageRef JSON pointer, 저장/내장 경로, MIME, 원본 바이트 SHA-256와 크기 |
| verification | imageBytesMatchEmbedded / jsonExceptImageUrisMatches |

페이지는 `pages/<n>.png`, 그 밖의 picture/table/text/nested 이미지는 `document.json#<JSON pointer>`의 embedded URI에 원본 그대로 남고 해당 경로를 manifest에 기록합니다. 이미지의 크기 변경·재인코딩은 하지 않습니다. MIME/magic/base64와 별도 페이지 바이트 일치를 확인합니다. 원격/file 이미지 URI는 가져오지 않고 거부합니다. JSON의 모든 ImageRef URI·좌표·크기·DPI를 그대로 유지합니다. 숫자는 Node JSON reviver의 source와 `JSON.rawJSON`으로 원래 토큰을 보존하므로 `origin.binary_hash` 같은 uint64가 반올림되지 않습니다. 저장 JSON은 공백 형태만 달라질 수 있습니다.

`createDoclingArchive({manifest,documentJson,pages})`는 Buffer만 반환하며 `readDoclingArchive`는 같은 봉투를 읽습니다. Node 표준 Buffer/crypto/zlib만 쓰며 npm 의존성·SDK 내부 import·직접 결과 파일 쓰기·디스크 압축 해제는 없습니다. Node에 ZIP API가 없어 필요한 STORE ZIP32 헤더/목록만 플러그인에 둡니다. 일반 ZIP/DEFLATE/ZIP64/분할 ZIP/암호화/알 수 없는 항목은 지원하지 않습니다. 경로·중복 항목·CRC·중앙/로컬 헤더·범위·필수 페이지·manifest의 문서/이미지 hash를 확인합니다. 원본 PDF가 없는 작업 2에서 원본의 진위를 검증했다는 뜻은 아닙니다. 파일 결과 상한은 Host의 2 GiB이며 writer를 닫은 뒤 Host가 크기·확장자·Root·충돌을 확인해 저장합니다. 실패·중단 때 staging 정리도 Host가 소유합니다. 플러그인의 ZIP 생성은 현재 메모리에 전체 바이트를 준비하므로 대규모 PDF의 메모리 사용은 수락하지 않았습니다.

### 작업 1 고정 프로필과 검증

보관 SHA `ce90560aacaee2482d37c4b25e36e93060ed156c`의 `plugins/docling/profiles/litzio-pdf-en-v1.json`을 그대로 복사한 [고정 프로필](litzio-pdf-en-v1.json)을 사용합니다. 아래 탐색 시험의 축소 옵션이나 서버 기본값을 제품 요청 옵션으로 쓰지 않습니다. 개별 옵션 선택이나 대체 프로필은 없습니다.

| 그룹 | 고정 요청 |
| --- | --- |
| 입력/출력 | PDF → JSON, inbody, embedded |
| 파이프라인 | standard, threaded_docling_parse, layout default |
| OCR | true, force false, rapidocr, en |
| 표 | structure true, tableformer_v1_accurate, accurate, cell matching true |
| 제목 | hierarchy true, bookmarks/numbering/style/font style true, tolerance 0.05, max level 6, bookmark threshold 0.8 |
| 이미지 | pictures/pages true, scale 2 |
| enrichment | code/formula true, codeformulav2; picture classification true, document_figure_classifier_v2 |
| 기타 | chart extraction false, picture description false, abort_on_error false; page_range는 보내지 않음 |

`convertPdfToArchive`는 `/version`과 OpenAPI info.version이 1.32.0인지, `/ready`가 정상인지 확인합니다. 비동기 제출은 정확히 한 번만 하며 poll의 ID/type을 대조하고 완전한 success·빈 errors·DoclingDocument 1.10.0만 받습니다. 전체 마감 시간은 기본 1800초이며 읽기·preflight·upload·poll·download·보관 준비에 적용합니다. 결과 바이트를 반환하기 전에 PDF를 다시 읽어 SHA-256을 대조합니다. 실패/중단/timeout은 결과를 반환하지 않으며 서버 작업을 자동 재제출·취소·재개하지 않습니다. 제출 후 helper 오류에는 task ID를 붙입니다(접수 응답을 못 받으면 ID 미확정/no-resubmit 안내).

**실제 고정 프로필 시험:** 상시 보관 컨테이너 `docling-serve`에 CodeFormulaV2를 한 번 설치한 뒤 고정 프로필 전체로 합성 PDF 변환과 `.docling` 생성을 확인했습니다. OCR·표·제목 계층·code/formula enrichment·picture classification을 켜고 pictures/pages와 scale 2를 그대로 사용했습니다. 결과는 완전한 success, errors 없음, DoclingDocument 1.10.0이며 페이지 1장·그림 1개였습니다. 페이지 PNG는 144dpi·1190×1684, 그림/페이지 원본 바이트와 manifest hash·ZIP CRC를 대조했습니다. GPU 실행이며 변환/보관 helper 약 5.2초였습니다. 원본 충실도나 복잡한 PDF의 품질 보증은 아닙니다. 최초 미설치 이미지에서는 CodeFormulaV2 부재로 실패했지만 프로필 값을 바꾸지 않고 모델 설치로 해결했습니다.

### 로컬 컨테이너 재사용

이 PC에는 `ghcr.io/docling-project/docling-serve-cu128:v1.32.0`의 컨테이너 **`docling-serve` 하나**를 보관합니다. GPU를 사용하고 필요한 CodeFormulaV2 모델은 컨테이너 안에 설치했습니다. 별도 볼륨이나 새 이미지는 만들지 않았습니다. 모델이 포함된 컨테이너를 삭제하지 않고 시작/중지만 합니다.

```sh
docker start docling-serve
# 준비 확인: http://127.0.0.1:5001/ready
# 플러그인 serverUrl: http://127.0.0.1:5001
docker stop docling-serve
```

`/ready` 정상 뒤 사용합니다. 초기 생성 때의 모델 설치 명령은 `docker exec docling-serve docling-tools models download-hf-repo docling-project/CodeFormulaV2`였으며, 재시작할 때마다 설치하지 않습니다. 다른 PC에서 생성하는 경우 5001 포트 사용 여부와 GPU를 먼저 확인하고 같은 이미지/프로필의 모델을 준비해야 합니다. 다운로드·설치 실패 시 프로필을 낮춰 우회하지 않습니다.

### 실제 v1.32.0 페이지 이미지 API 확인

아래는 고정 프로필 확정 전 페이지 전송 형식을 확인한 탐색 기록이며 승인 프로필의 성공 증거가 아닙니다. 이전 임시 컨테이너의 `ghcr.io/docling-project/docling-serve-cu128:v1.32.0`에서 `/version`과 `/openapi.json`, 작은 합성 1페이지 PDF의 실제 비동기 변환으로 확인했습니다. CPU 실행 결과이며 큰 PDF·GPU·변환 품질의 보증이 아닙니다.

- 제출: multipart `POST /v1/convert/file/async`, 파일 필드 `files`, `to_formats=json`.
- `include_page_images`: 기본 false. **true여야 전체 페이지 이미지가 포함**됩니다. `include_images`는 그림 요소 옵션이며 별개입니다(실험에서는 false).
- `images_scale`: 기본 2.0. 실험은 1.0으로 지정했고 페이지 1에 72dpi, 596×842 PNG를 받았습니다. 배율에 따른 픽셀 차이의 전수 검증은 하지 않았습니다.
- `image_export_mode`: OpenAPI enum은 placeholder/embedded/referenced, 기본 placeholder입니다.
- `target_type`: OpenAPI enum은 inbody/presigned_url/zip, 기본 inbody입니다. presigned_url은 실제 시험하지 않았습니다.
- **embedded + inbody:** `GET /v1/result/{task_id}`가 application/json을 반환합니다. `document.json_content` 안의 `pages["1"].image`에 mimetype/dpi/size/`uri: data:image/png;base64,...`가 있습니다. 이를 PNG bytes로 복원해 `.docling`을 만드는 경로를 준비했습니다.
- **referenced + zip:** 같은 결과 경로가 application/zip을 반환합니다. 실제 항목은 `sample.json`, `artifacts/`, `artifacts/page_000001_<hash>.png`였고 JSON의 페이지 image.uri는 이 상대 경로였습니다. 서버 ZIP 자체는 `.docling` 형식이 아니며 현재 reader 입력도 아닙니다.
- **referenced + inbody:** 요청은 허용됐지만 실제 JSON에는 embedded PNG data URI가 들어왔습니다. referenced 파일 제공으로 간주하지 않습니다.
- 세 시험 모두 `do_ocr=false`, `include_page_images=true`, `images_scale=1`, `include_images=false`, `to_formats=json`을 사용해 success를 확인했습니다. 이 축소 옵션을 고정 프로필 대신 사용하지 않습니다.

`task_id`로 `GET /v1/status/poll/{task_id}`를 조회하고 success 뒤 결과를 받습니다. 해당 OpenAPI에는 작업 취소 API가 없습니다. 작업 1 연결 시에는 로컬 요청/폴링을 중단해도 서버 작업은 계속될 수 있음을 상태와 안내에 유지해야 합니다.

### 검증 경계

기존 `http-plugins`에서 가짜 서버에 **고정 프로필 전체**를 제출하고 수신한 multipart 각 값을 대조합니다. 완전한 success의 `.docling`을 작업 2 fixture로 쓰며 큰 정수·원본/결과 hash·프로필·페이지 원본 바이트 보존을 확인합니다. task failure의 ID와 단일 제출, 변환 중 PDF 변경 거부, 전체 deadline을 각각 대표 사례로 보호합니다. 전수 조합은 아니며 새 suite·workspace·검증 서버 프로세스는 추가하지 않고 기존 CLI 호출 helper를 재사용합니다. 추가 가짜 서버 사례는 기존 K1 fixture로 잡지 못하는 외부 서비스 계약/원본 보존/전체 마감 결함을 검증합니다.

공식 K1 PDF 작업의 정상 저장과 기본 `source.pdf` → `source.docling` 이름, 실패와 중단 상태를 대표 사례로 확인합니다. 같은 이름 충돌/덮어쓰기 거부는 Host suite의 기존 보호를 반복하지 않습니다. 이후 작업 2는 생성된 `.docling`의 중첩 참조 순서·literal text·표 셀 텍스트와 SDK → Host 저장 → CLI/공용 화면 결과 열기, 같은 원본 재사용, 손상 CRC 거부를 확인합니다. 이 구간의 비-health 서버 요청 수가 0인지 확인합니다. 짧은 로컬 작업을 인위적으로 늦추지 않으며 기존 K1 중단 fixture는 유지합니다. 실제 API의 축소 옵션 결과는 앞선 단계에서 Python 표준 zipfile로 항목과 CRC를 대조했으며, 현재 고정 프로필은 모델 설치 후 별도 실제 서버 시험에서 성공했습니다. 최종 가짜 서버 실행은 HTTP recovery 포함 약 1.5분, 실제 Docker 경로를 포함한 실행은 약 2.2분이었습니다. 선택적 `LITZIO_DOCLING_REAL_PDF`에 실제 합성 PDF를 지정한 동일 브라우저 실행에서는 상시 컨테이너로 `a.pdf` → `a.docling` → `a.md`의 공식 CLI/K1 저장과 Editor 열기까지 검증합니다. CI에서는 이 옵션 없이 가짜 서버만 사용합니다. 실제 서버의 페이지/그림 원본 바이트와 ZIP 필수 항목은 archive reader로 대조합니다. 전용 스크린샷은 `tmp/docling-1322/file-{1440,640}.png`, `completed-{1440,640}.png`, 선택적 실제 문서 `real-document-{1440,640}.png`입니다.

### 최소 문서 변환 규칙

`body.children`에서 group/element 참조를 따라 원본 순서로 처리합니다. 1~6의 section_header는 제목, 나머지 텍스트(목록·수식·코드·각주 포함)는 일반 문단으로 낮춥니다. 표는 제공된 table_cells 순서의 텍스트를 ` | `로 연결한 문단입니다. picture 이미지는 버리고 자식 텍스트만 처리합니다. 별도 furniture root는 순회하지 않으며 body 안의 layer는 따로 분류하지 않습니다. provenance, 스타일, 목록 구조, 표 병합, 이미지와 대조 자료는 Litzio 문서에 넣지 않습니다(원본 `.docling`에는 보존). 잘못된 참조·중복/순환 참조나 SDK 크기/요소 상한 초과는 실패합니다. 문서 생성은 Host 제공 `authorDocument`만 사용하며 Host가 공식 write path로 저장합니다. 이 규칙은 구조 유효성의 최소 사례이며 원본 충실도·변환 품질의 보증이 아닙니다.

### 보관 표현 정책·sidecar와 현재 공개 SDK의 대조

아래는 보관 계약을 그대로 재구현했다는 뜻이 아니라 **현재 SDK로 가능한지**를 검토한 결과입니다. 작업 2 구현은 앞 절의 최소 변환을 유지합니다. `authorDocument` 입력은 strict이며 Core 내부 연산을 직접 import해 한도를 우회하지 않습니다.

| 보관 계약 항목 | 공개 SDK 판정 / 현재 구현 | 근거 |
| --- | --- | --- |
| root/group 읽기 순서, 캡션 소유, furniture/unknown/unreachable 분류 | 해석·분류는 플러그인에서 가능. 현재 root/group 순회만 하며 전체 분류·notes는 미구현 | document-authoring.ts:22 (중립 입력); host.js:7 (현재 변환) |
| 문단 경계·원래 번호·교차 참조를 literal text로 유지, 공백 변경 notes | 평문 가능. Core 공백 정규화는 적용되며 notes는 플러그인 계산 필요 | packages/core/src/document-authoring.ts:13, :51 |
| H1~H6 | 가능·현재 사용 | packages/core/src/document-authoring.ts:14 |
| rich inline·지원하지 않는 서식 보고 | **서식 불가**. text가 문자열뿐이며 inline 노드/marks 입력 없음. 보고용 JSON은 플러그인 계산 가능 | packages/core/src/document-authoring.ts:11, :13, :55 |
| plain formula를 Equation으로 생성 | 가능(현재는 문단으로 낮춤) | packages/core/src/document-authoring.ts:19, :59 |
| 직사각 표·병합 셀 텍스트 반복·leading header 결합·빈 셀 유지 | 100행×32열 안에서 플러그인이 grid를 계산하면 가능. 현재는 셀 텍스트 문단 | packages/core/src/document-authoring.ts:10, :16 |
| 과거 표의 100,000셀 허용 범위 | **동일 범위 불가**. 현재 최대 3,200셀이고 전체 문서 한도도 적용 | packages/core/src/document-authoring.ts:10, :16 |
| form cell·병합/계층 헤더의 원래 의미, 겹침·span 오류 | 원래 의미는 **미지원**(과거도 form은 unsupported). grid/오류 분류·notes는 플러그인 책임 | packages/core/src/document-authoring.ts:16 |
| Figure/Table 캡션의 고정 번호 enumerator, 중복/모호성 처리 | **고정 번호 불가**. figure는 평문 caption만, table은 rows만 받음. 번호 추출·모호성 분류 자체는 가능 | packages/core/src/document-authoring.ts:16, :17 |
| source picture+caption, child text를 그림으로 표현 | **조건부** URL·평문 caption은 가능. ZIP 내부 이미지 해제/공식 asset 저장 API 없음. data URI도 문자열 16,384 및 전체 256 KiB 한도에 걸림. 현재 이미지는 Litzio 결과에 넣지 않음 | packages/core/src/document-authoring.ts:10, :17; packages/plugin-sdk/src/index.ts:135 |
| 목록 marker 보존, 평면 목록 | ordered/start/평문 items(최대100)는 가능. marker 문자열은 문단으로 보존 가능 | packages/core/src/document-authoring.ts:15 |
| 중첩 목록·목록 안 rich inline | **불가**. items는 재귀 ListContent가 아닌 string 배열 | packages/core/src/document-authoring.ts:15, :55 |
| standalone footnote를 문단으로 보존, 숫자만 보고 연결하지 않기 | 가능·현재 평문 보존. 설명 notes는 미구현 | packages/core/src/document-authoring.ts:13 |
| 명시적 owner footnotes 관계의 endnote call/definition | **불가**. authoring block/inline에 endnote/footnote 입력 없음 | packages/core/src/document-authoring.ts:12 (block union), :55 |
| 문서 전체 크기·블록 상한 | **과거 큰 문서 범위와 동일하지 않음**. 입력/출력 각각 262,144 UTF-8 bytes, 500블록, 200 input key, 문자열16,384 UTF-16 units | packages/core/src/document-authoring.ts:10, :22, :38, :68 |
| sidecar source의 name/schema/version·정확한 입력 SHA, native SHA 바인딩 | 플러그인에서 계산 가능. authorDocument가 canonical source/hash/revision 반환 | packages/core/src/document-authoring.ts:30, :71 |
| sidecar pages의 page size/image ref, provenance bbox/origin/charspan, 없는 위치 빈 배열 | 원본 JSON에서 플러그인이 그대로 기록 가능. K1 reviewPage에는 bbox/origin만 있고 charspan·전체 provenance는 없음 | packages/core/src/views-v2.ts:270; archive.js (원본 document 보존) |
| sidecar 모든 item/group/root/unreachable의 self_ref/label/layer/parent/status/notes | 플러그인 계산 가능. authorDocument가 이러한 Docling 의미를 계산해 주지는 않음 | packages/core/src/document-authoring.ts:22, :30 |
| sidecar block path/kind/role, group의 여러 target·여러 source의 한 target | 블록 path/hash는 반환됨. kind/role·공유 관계는 플러그인에서 연결 가능(상한 안). 현재 sidecar 미구현 | packages/core/src/document-authoring.ts:71; packages/core/src/views-v2.ts:281 |
| sidecar 재귀 list item index·endnote definition target | **동일 계약 불가**. authoring 결과는 block path이고 중첩 list/endnote 작성 입력도 없음 | packages/core/src/document-authoring.ts:15, :30, :72 |
| sidecar 문서 hash/target 검사·stale map 거부 | hash/path 자료는 가능. 기존 bounded review mapping은 별도 계약이며 legacy map format/notes/charspan을 그대로 받는 API는 아님 | packages/core/src/views-v2.ts:264, :281 |
| `.md`와 `.docling-map.json` 동시 공식 저장 | **현재 불가**. native K1은 document.source 하나만 저장. #1327도 일반 파일 하나의 범위이며 compound 결과/sidecar 저장 보장은 아님 | packages/plugin-sdk/src/index.ts:135; apps/editor/server/plugins/jobs.ts:46 |

필요한 최소 보강 후보는 대용량 authoring 범위, inline/중첩 목록/endnote 입력, Figure/Table 번호·표 캡션 속성, 공식 image asset/sidecar 동반 저장입니다. 이번 PR에서 새 SDK나 우회 write path는 만들지 않습니다.
