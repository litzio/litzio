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

API 키가 걸린 docling-serve는 지원하지 않음. 설정에는 서버 URL만 있습니다. 활성 상태에서도 설정을 저장·reload할 수 있지만 K1 작업이 running/uncertain이면 변경을 거부하고 기존 값을 보존합니다. artifact 변경은 validate → 새 digest 신뢰 → reload → 실제 호출이 필요합니다.

사이드바 **Docling** 한 화면에서 공통 작업 패널을 사용합니다. 연결은 설정 → 플러그인 → Docling 톱니 → **연결 확인**으로 검사합니다. 별도 연결 표는 같은 health/ready 결과를 중복 표시하므로 제거했습니다. 작업은 열린 Host Root를 선택해야 하며, 연결 확인은 폴더 없이도 가능합니다.

## 연결 확인 범위

`GET <serverUrl>/health`와 `/ready`가 모두 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 `{ ok: false, message }`를 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health/ready 확인은 요청한 모든 모델의 준비·변환 성공·인증 권한을 보증하지 않습니다. PDF 변환은 아래 공용 K1 작업을 사용합니다. 작업 2는 보관된 `.docling`에서 서버 호출 없이 문서를 만듭니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 설정 연결 확인에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-002/`에 남깁니다. 실제 Docker 수락은 자동 브라우저와 분리해 화면 또는 CLI로 실행하며 결과를 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

화면은 기존 PluginJobPanel·SettingsSelect·Button·체크박스·K1 상태와 결과 행동을 재사용합니다. 새 공통 UI 예외는 없습니다. 640px 작업 표는 공통 renderer의 내부 가로 스크롤을 사용합니다. `--screenshots`의 대시보드 캡처는 `tmp/docling-002/dashboard-1440.png`, `dashboard-640.png`입니다. 검토한 [1440px](../../docs/design/assets/docling-002/dashboard-1440.png)·[한국어 다크 640px](../../docs/design/assets/docling-002/dashboard-640.png)를 보관합니다.

## 버전

플러그인 버전은 **0.0.3**입니다. [CHANGELOG](CHANGELOG.md)와 미확정 [ROADMAP](ROADMAP.md)을 참고하세요. `.docling` manifest에는 생성한 플러그인 버전(`converter.pluginVersion`)과 ZIP 형식 번호(`version: 1`)를 기록합니다. 출처·서버·프로필 기록은 원본 재현을 위해 유지하며 문서 변환 정책 버전은 두지 않습니다. 결과 `.md` 본문에는 버전이나 입력 hash 문단을 추가하지 않습니다.

작업 패널과 healthCheck의 최소 공개 계약에 따라 `requiresSdk: ">=0.3.0 <1.0.0"`을 선언합니다.

## 두 작업으로 분리 (#1322 범위 정정)

PDF 원본 보관과 Litzio 문서 만들기는 별도 K1 작업입니다. 한 요청에 파일 하나를 처리합니다.

1. **PDF 변환:** `a.pdf` → `a.docling`. 원본 PDF와 DoclingDocument JSON 항목은 hash로 확인하며 변경하지 않습니다. `convertPdfToArchive`가 고정 프로필로 서버를 확인·변환하고 `createDoclingArchiveFromResult`가 원본 HTTP 응답 바이트와 PDF 바이트를 받아 `.docling` 바이트를 만들며 파일 쓰기는 하지 않습니다. 플러그인은 Host가 제공한 `resultFile.path`에 ZIP 바이트를 쓰고 닫은 뒤 `file:{path}`만 반환합니다. Host가 Root에 새 파일로 원자적으로 저장하며 기본 이름은 `a.pdf` → `a.docling`입니다. ZIP 바이트를 IPC로 보내거나 output에 직접 쓰지 않습니다.
2. **Litzio 문서 만들기(구현):** `.docling` 한 건의 `document.json`으로 새 Litzio 문서를 만듭니다. Docling API·health·version을 호출하지 않으며 서버가 없어도 같은 원본에서 다른 결과 이름으로 다시 실행할 수 있습니다. 원본 `.docling`은 변경하지 않습니다.

사이드바 Docling에서 작업·열린 폴더를 선택하고 PDF 또는 `.docling` 파일을 체크해 **작업 시작**을 누릅니다. 여러 파일은 파일별 독립 K1 요청으로 함께 접수하며, PDF 서버 요청은 플러그인 활성화 프로세스 안에서 접수 순서대로 한 건씩 처리합니다. 기다리는 작업은 “서버 대기 중”이며 대기 중에도 중단할 수 있습니다. Host 큐나 재시작 복원은 추가하지 않습니다. 변환 helper의 1800초 마감은 해당 차례의 변환 시작부터 적용됩니다. PDF 기본 결과는 `a.docling`, 문서 기본 결과는 `result.md`이며 동명 결과는 덮어쓰지 않습니다. 작업 목록에 상태·단계·경과와 중단·상태 재확인·결과 행동이 표시됩니다. PDF 결과는 경로/복사, 문서 결과는 결과 열기를 제공합니다. 공용 Plugin jobs 화면과 CLI도 유지합니다.

CLI 입력 파일은 artifact 밖에 둡니다.

- PDF 보관: `{"requestId":"<새 UUID>","job":"convert-pdf","root":"<Host Root>","file":"a.pdf"}`. output 생략 시 Host가 `a.docling`으로 정합니다.
- 문서 만들기: `{"requestId":"<새 UUID>","job":"create-document","root":"<Host Root>","file":"a.docling","output":"a.md"}`.


- `litzio plugins start community.docling --input <job.json> --host <origin> --json`
- `litzio plugins status <requestId> --host <origin> --json`
- `litzio plugins stop <requestId> --host <origin> --json`
- `litzio plugins result <requestId> --host <origin> --json`

작업마다 새 requestId를 쓰며 불확실 결과는 같은 ID로 조회합니다. start를 자동 재전송하지 않습니다. 활성 화면은 진행 중 작업을 1초마다 관찰합니다. 여러 파일은 각각 별도 요청이며 Host 큐·재시작 복원·대조/검수·내부 이미지 대조뷰는 없습니다. PDF 중단은 요청/폴링과 staging writer를 닫은 뒤 stopped를 보고하며 이미 제출된 서버 작업은 계속될 수 있습니다. 문서 작업의 중단은 로컬 읽기/생성을 중단하며 서버와 무관합니다.

### `.docling` 형식 1 봉투

플러그인 소유 ZIP32 형식이며 모든 항목은 무압축(STORE)입니다. `manifest.json`, `document.json`, `source.pdf`를 포함합니다. `source.pdf`는 제출한 원본 바이트이며 manifest.source의 SHA-256·크기로 확인합니다. `document.json`은 DoclingDocument 전체 필드·그림 ImageRef와 embedded data URI를 보존하며 manifest.document의 SHA-256·크기로 확인합니다. 페이지 PNG는 요청하지도 보관하지도 않습니다(`include_page_images:false`). 기존 `.docling` 파일 호환은 지원하지 않습니다.

추후 수정·확인 페이지·승인 기록을 한 파일로 전달하기 위한 선택 `review.json` 슬롯은 opaque bytes로 읽고 보존할 수 있습니다. 지금 변환은 이를 만들거나 해석·수정하지 않으며 기록 schema·검수 기능은 미구현입니다. 검수 기록과 무관하게 원본 PDF/JSON hash를 검증하며 전체 ZIP hash를 원본 항목 identity로 쓰지 않습니다. 이후 검수 저장은 공식 경로로 ZIP 전체를 다시 쓰고 `.md`·`assets/`는 밖에 둡니다. 이번 변환은 원본 봉투를 다시 쓰지 않습니다.

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

picture/table/text/nested 이미지는 `document.json#<JSON pointer>`의 embedded URI에 원본 그대로 남고 해당 경로를 manifest에 기록합니다. 이미지의 크기 변경·재인코딩은 하지 않습니다. MIME/magic/base64와 이미지 hash를 확인하며 페이지 ImageRef가 있으면 거부합니다. 원격/file 이미지 URI는 가져오지 않고 거부합니다. JSON의 모든 ImageRef URI·좌표·크기·DPI를 그대로 유지합니다. 숫자는 Node JSON reviver의 source와 `JSON.rawJSON`으로 원래 토큰을 보존하므로 `origin.binary_hash` 같은 uint64가 반올림되지 않습니다. 저장 JSON은 공백 형태만 달라질 수 있습니다.

`createDoclingArchive({manifest,documentJson,sourceBytes,reviewBytes?})`는 Buffer만 반환하며 `readDoclingArchive`는 같은 봉투를 읽습니다. Node 표준 Buffer/crypto/zlib만 쓰며 npm 의존성·SDK 내부 import·직접 결과 파일 쓰기·디스크 압축 해제는 없습니다. Node에 ZIP API가 없어 필요한 STORE ZIP32 헤더/목록만 플러그인에 둡니다. 일반 ZIP/DEFLATE/ZIP64/분할 ZIP/암호화/알 수 없는 항목은 지원하지 않습니다. 경로·중복 항목·CRC·중앙/로컬 헤더·범위·필수 원본 항목·manifest의 PDF/문서/이미지 hash를 확인합니다. 이 hash 검증은 보관 이후의 바이트 일치이며 원본 PDF의 진위나 추출 품질 보증이 아닙니다. 파일 결과 상한은 Host의 2 GiB이며 writer를 닫은 뒤 Host가 크기·확장자·Root·충돌을 확인해 저장합니다. 실패·중단 때 staging 정리도 Host가 소유합니다. 플러그인의 ZIP 생성은 현재 메모리에 전체 바이트를 준비하므로 대규모 PDF의 메모리 사용은 수락하지 않았습니다.

### 작업 1 고정 프로필과 검증

보관 SHA `ce90560aacaee2482d37c4b25e36e93060ed156c`의 `plugins/docling/profiles/litzio-pdf-en-v1.json`에서 `include_page_images`만 false로 바꾼 [고정 프로필](litzio-pdf-en-v1.json)을 사용합니다. 아래 탐색 시험의 축소 옵션이나 서버 기본값을 제품 요청 옵션으로 쓰지 않습니다. 개별 옵션 선택이나 대체 프로필은 없습니다.

| 그룹 | 고정 요청 |
| --- | --- |
| 입력/출력 | PDF → JSON, inbody, embedded |
| 파이프라인 | standard, threaded_docling_parse, layout default |
| OCR | true, force false, rapidocr, en |
| 표 | structure true, tableformer_v1_accurate, accurate, cell matching true |
| 제목 | hierarchy true, bookmarks/numbering/style/font style true, tolerance 0.05, max level 6, bookmark threshold 0.8 |
| 이미지 | pictures true, pages false, scale 2 |
| enrichment | code/formula true, codeformulav2; picture classification true, document_figure_classifier_v2 |
| 기타 | chart extraction false, picture description false, abort_on_error false; page_range는 보내지 않음 |

`convertPdfToArchive`는 `/version`과 OpenAPI info.version이 1.32.0인지, `/ready`가 정상인지 확인합니다. 비동기 제출은 정확히 한 번만 하며 poll의 ID/type을 대조하고 완전한 success·빈 errors·DoclingDocument 1.10.0만 받습니다. 전체 마감 시간은 기본 1800초이며 읽기·preflight·upload·poll·download·보관 준비에 적용합니다. 결과 바이트를 반환하기 전에 PDF를 다시 읽어 SHA-256을 대조합니다. 실패/중단/timeout은 결과를 반환하지 않으며 서버 작업을 자동 재제출·취소·재개하지 않습니다. 제출 후 helper 오류에는 task ID를 붙입니다(접수 응답을 못 받으면 ID 미확정/no-resubmit 안내).

**과거 0.0.1 고정 프로필 시험(페이지 이미지 포함):** 상시 보관 컨테이너 `docling-serve`에 CodeFormulaV2를 한 번 설치한 뒤 고정 프로필 전체로 합성 PDF 변환과 `.docling` 생성을 확인했습니다. OCR·표·제목 계층·code/formula enrichment·picture classification을 켜고 pictures/pages와 scale 2를 그대로 사용했습니다. 결과는 완전한 success, errors 없음, DoclingDocument 1.10.0이며 페이지 1장·그림 1개였습니다. 페이지 PNG는 144dpi·1190×1684, 페이지/그림 원본 바이트와 manifest hash·ZIP CRC를 대조했습니다. GPU 실행이며 변환/보관 helper 약 5.2초였습니다. 원본 충실도나 복잡한 PDF의 품질 보증은 아닙니다. 최초 미설치 이미지에서는 CodeFormulaV2 부재로 실패했지만 프로필 값을 바꾸지 않고 모델 설치로 해결했습니다.

### 로컬 컨테이너 재사용

이 PC에는 `ghcr.io/docling-project/docling-serve-cu128:v1.32.0`의 컨테이너 **`docling-serve` 하나**를 보관합니다. GPU를 사용하고 필요한 CodeFormulaV2 모델은 컨테이너 안에 설치했습니다. 별도 볼륨이나 새 이미지는 만들지 않았습니다. 모델이 포함된 컨테이너를 삭제하지 않고 시작/중지만 합니다.

```sh
docker start docling-serve
# 준비 확인: http://127.0.0.1:5001/ready
# 플러그인 serverUrl: http://127.0.0.1:5001
docker stop docling-serve
```

`/ready` 정상 뒤 사용합니다. 초기 생성 때의 모델 설치 명령은 `docker exec docling-serve docling-tools models download-hf-repo docling-project/CodeFormulaV2`였으며, 재시작할 때마다 설치하지 않습니다. 다른 PC에서 생성하는 경우 5001 포트 사용 여부와 GPU를 먼저 확인하고 같은 이미지/프로필의 모델을 준비해야 합니다. 다운로드·설치 실패 시 프로필을 낮춰 우회하지 않습니다.

### 과거 v1.32.0 페이지 이미지 API 탐색

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

### PDF 작업의 기존 검증 경계

기존 http-plugins 가짜 서버는 고정 프로필 multipart 전체, 단일 제출, task failure ID, 변환 중 PDF 변경 거부, 전체 deadline·중단을 대표 사례로 보호합니다. 같은 서버에서 만든 봉투는 문서 작업의 offline 입력으로 재사용합니다. uint64 토큰·원본 PDF/JSON/그림 hash·CRC와 공식 K1 저장/결과 열기를 대조하며 새 서버 프로세스를 추가하지 않습니다. Root·같은 이름 충돌/덮어쓰기 거부는 기존 Host suite가 소유합니다.

0.0.1 당시 가짜 서버 약 1.5분·실제 Docker 포함 약 2.2분은 과거 실행 기록입니다. 현재 0.0.3의 검증·수동 캡처는 아래 절을 따릅니다. CI는 가짜 서버만 사용하고 실제 서버는 별도 수락입니다.

### 문서 변환 규칙 (0.0.3 / #1368)

한 경로 `불변 원본 → 수정 적용 단계(현재 빈 수정·private copy) → 블록 → SDK authorDocument`로 만듭니다. 원본 body.children과 group/element 참조를 따라 순서를 유지하며 label 또는 content_layer가 furniture인 머리글·바닥글은 제외합니다. 잘못된 참조·중복/순환·표 좌표/범위/겹침 오류는 전체 실패합니다. 플러그인이 Docling 의미를 해석하고, Core의 공개 SDK만 문서 생성·정규화·canonical 직렬화를 담당합니다.

| 원본 | 출력과 손실 |
| --- | --- |
| title / section_header H1–H6 | H1 / 해당 단계 제목. 잘못된 단계는 문단으로 보존하고 미지원 기록 |
| text / paragraph | literal 문단. Markdown으로 재해석하지 않음 |
| table | 원본 num_rows×num_cols 직사각형, 첫 행 header, 빈 칸 유지. 병합 칸은 모든 위치에 같은 글자 반복. 다단 header의 뒤 행은 body로 유지하며 손실 기록. row-header/section 의미 변경도 기록 |
| list_item | 원래 순서의 평면 bullet/번호 목록. 연속 번호·종류가 같은 인접 항목을 결합하고 100항목마다 다음 블록. 중첩 평탄화와 표현하지 못한 marker를 항목별 기록 |
| code / formula | Code / Equation. 원본 code_language·수식 text 사용; 추출 오류를 추측해서 고치지 않음 |
| picture + captions | 빈 URL pending Figure와 literal caption. 이미지 미포함을 그림마다 기록. 별도 번호 의미는 추출하지 않음 |
| table captions | 표 뒤의 literal 문단. SDK에 표 caption 속성이 없어 대응으로 연결 |
| footnote / unknown / unreachable | 각주는 call site 추측 없이 문단; 알 수 있는 text는 문단으로 보존. 알 수 없는 내용·group·미도달 항목·inline 서식/링크 의미 손실을 self_ref별 기록 |

0인 손실 종류는 생략하고 완료 phase에 `표 3 · 병합 칸 5 · … · 그림 이미지 미포함 2 · 미지원 1` 형태로 요약합니다. 기존 PluginJobPanel의 단계 칸을 그대로 쓰며 새 화면·공통 interaction 예외는 없습니다. 머리글/바닥글 제외는 report.items의 furniture 상태에 남습니다. 기타 손실은 표 역할·목록 marker 변경이며 전체 근거는 losses에 있습니다. 추출 품질과 원본에 없는 의미는 복구하지 않습니다.

### 원본 항목과 출력 대응

`litzio operation invoke community.docling.conversion-report --input <report.json> --host <origin> --json`, 입력 `{"requestId":"<문서 생성 요청 UUID>"}`로 상세 결과를 읽습니다. 입력 파일은 artifact 밖에 둡니다. report는 `sourceHash`(보관 document.json의 정확한 SHA-256), `documentRevision`, `documentHash`, `items`, `losses`, `summary`를 반환합니다. 실패에는 고정된 `failure.reason`과 선택 self_ref가 있습니다. Host의 K1 오류는 보안 계약대로 고정 분류/안내이며 상세 한도 사유는 이 읽기 결과에서 확인합니다.

SDK 입력 key는 self_ref이며 영속 식별은 sourceHash+self_ref입니다. items의 targets는 반환된 SDK key별 targets로 계산합니다. 여러 목록 항목이나 그림+캡션이 같은 target을 공유할 수 있습니다. table.cells는 원본 table_cells의 index, 출력 grid positions와 targets를 담습니다. container·furniture·미도달 항목의 targets는 비어 있습니다. target path는 출력 revision에만 유효하며 재변환 때 새로 계산합니다.

대응 파일을 만들지 않습니다. 플러그인 활성화 수명의 요청별 메모리에 결과를 두고 기존 CLI 읽기 작업으로 돌려줍니다. 별도 파일·Host/SDK 저장 확장 없이 검수에서 같은 convertDocument 함수를 재사용해 다시 계산할 수 있는 가장 단순한 선택입니다. reload/restart 뒤 report는 사라지며 다시 변환해야 합니다. SDK 생성 보고는 Host 저장 receipt가 아니므로 실제 저장 성공·revision은 plugins result에서 별도로 확인합니다. `.docling`의 미래 검수 기록과 이 재계산 결과를 혼동하지 않습니다.

### 한도와 검증 경계

SDK 한도는 입력 200개(원본 항목 단위, 제외·container도 포함), 전체 500블록, 입력 JSON/출력 source 각각 UTF-8 256KiB, 문자열 16,384 UTF-16 units, 표 100행×32열입니다. 넘으면 잘라 통과시키지 않고 전체 실패하며 문서를 만들지 않습니다. 목록 100항목은 내용을 자르지 않고 다음 블록으로 이어집니다. 한도 확대·이미지 공식 저장은 후속 공용 기능입니다.

자동 검사는 기존 plugins.test.ts에서 원본 불변·native 요소·공유 targets·병합 셀 index/위치·손실 분류와 잘못된 graph/grid·문자열/입력/byte/표 한도 거부를 보호합니다. ZIP 예약 검수 항목과 독립적인 원본 hash 검증도 확인합니다. 기존 http-plugins는 같은 가짜 서버와 작은 fixture로 공개 SDK 활성화→K1 공식 저장→revision/report 조회→브라우저 요소·손실 요약을 검증합니다. 의미 조합은 낮은 계층에 두며 새 subprocess·suite·타임아웃 확대는 없습니다. 전체 500블록 한도는 SDK가 소유하며 이 변환기에서는 200개 원본 입력 제한이 먼저 적용됩니다.

실제 docling-serve는 수동 수락으로 분리합니다. 입력은 [ReportLab/Pillow 생성 스크립트](fixtures/create-acceptance.py)로 저장소 루트에서 재생성합니다. 표·번호 목록·코드·수식·그림+캡션·머리글/바닥글이 있는 한 페이지 합성 PDF를 고정 프로필로 변환했습니다. 첫 3페이지 PDF는 서버 backend의 partial_success라 거부했으며 성공으로 포장하지 않았습니다. 한 페이지 결과에서 native 요소·furniture 제외·원본 PDF와 그림 ImageRef 보존을 확인합니다. 서버의 코드 분할·수식 인식 품질은 검수 전이며 PDF와의 의미 동등성을 보증하지 않습니다.

수동 캡처는 서버 변환이 끝난 `.docling`을 `LITZIO_DOCLING_REAL_ARCHIVE`, 이전 변환기의 같은 문서 source를 `LITZIO_DOCLING_BEFORE`로 지정한 `pnpm browser:test http-plugins --screenshots`로 촬영합니다. 이 옵션은 Docling 등록·문서 생성·열기·대응·1440/한국어 dark 640px 검토만 수행하며 Jira fault 회귀는 별도 자동 실행이 소유합니다. 외부 모델 대기를 180초 가짜 서버 회귀 안에 넣지 않습니다. 재생성 가능한 PDF/ZIP/JSON은 커밋하지 않습니다.

수동 검토 근거(계정·폴더 경로 마스킹):

| 상태 | 1440px | 한국어 다크 640px |
| --- | --- | --- |
| 이전 변환기 | [Before](../../docs/design/assets/docling-003/before-1440.png) | [Before](../../docs/design/assets/docling-003/before-640.png) |
| 표·목록·코드 | [After](../../docs/design/assets/docling-003/after-1440.png) | [After](../../docs/design/assets/docling-003/after-640.png) |
| 수식·캡션 Figure | [After](../../docs/design/assets/docling-003/equation-figure-1440.png) | [After](../../docs/design/assets/docling-003/equation-figure-640.png) |
| 손실 요약 | [패널](../../docs/design/assets/docling-003/losses-1440.png) | [왼쪽](../../docs/design/assets/docling-003/losses-640.png) · [오른쪽](../../docs/design/assets/docling-003/losses-640-end.png) |

공통 표의 정렬·여백·한국어 줄바꿈·가로 스크롤과 본문 잘림/가림을 확인했습니다. 캡션의 원본 `Figure 1:` 문자열과 Litzio의 자동 번호가 함께 보이는 것은 원본 번호 의미를 추측해 제거하지 않는 현재 한계입니다. UI 표면이나 레이아웃은 변경하지 않습니다.

## 공식 로고 조사 (2026-11-09)

공식 출처는 [Docling SVG 원본](https://github.com/docling-project/docling/blob/main/docs/assets/logo.svg)과 [LF AI & Data 프로젝트 페이지](https://lfaidata.foundation/projects/docling/)입니다. 코드의 [MIT 라이선스](https://github.com/docling-project/docling/blob/main/LICENSE)는 상표 허가를 대신하지 않습니다. [Linux Foundation 상표 정책](https://www.linuxfoundation.org/legal/trademark-usage)은 프로젝트별 추가 조건과 로고 사용 제한을 별도로 정합니다. 이 커뮤니티 플러그인의 사이드바 로고 재배포에 적용할 명시적 허용 조건을 확인하지 못했으므로 공식 로고 파일과 로고를 가리키는 선언을 추가하지 않았습니다. 일반 문서 변환 아이콘 `icon.svg`는 앱이 사용하는 Lucide `file-output`(lucide-react 1.47.0, [원본](https://github.com/lucide-icons/lucide/blob/main/icons/file-output.svg))을 고정 색상으로 사용하며, ISC 라이선스·저작권 고지는 [ICON-LICENSE](ICON-LICENSE)에 보관합니다. 공식 공급·후원 관계를 나타내지 않습니다.
