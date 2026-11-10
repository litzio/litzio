# Docling community plugin

소유자 개인 작업을 위한 실험 플러그인입니다. Litzio 공식 공급·기본 활성 플러그인이 아닙니다. #1391 지정 커뮤니티로 앱에 포함됩니다. 이 디렉터리만 독립 저장소로 옮길 수 있으며 pnpm workspace에 속하지 않습니다.

## 사용

외부 scaffold와 같은 plain ESM artifact입니다. 설치·빌드 없이 대상 Host가 공개 SDK를 제공합니다. `host.js`, manifest, package.json, 편집기용 starter 타입 힌트가 함께 있습니다. SDK를 npm 설치하거나 내부 패키지를 import하지 않습니다.

아래 명령의 `<origin>`, `<artifact>`, `<settings.json>`, `<input.json>`은 실제 대상에 맞게 지정합니다. CLI에는 `--host <origin> --json`을 항상 붙입니다.

앱 포함 복사본은 추가 절차 없이 목록에 꺼짐·미신뢰로 표시됩니다. 설정과 필요한 secret을 저장하고 처음 켤 때 신뢰 확인을 합니다. 이후 앱 업데이트에도 신뢰와 사용자 설정을 유지하며, 포함 복사본은 제거 대신 끕니다. 아래 validate/register는 개발용 외부 폴더 등록 절차입니다. 같은 ID의 폴더 등록이 포함 복사본보다 우선하고, 그 등록을 제거하면 다음 Host 시작에 포함 복사본이 다시 나타납니다.

1. `litzio plugins validate <artifact> --host <origin> --json`
2. `litzio plugins register <artifact> --host <origin> --json`
3. `litzio plugins settings community.docling --file <settings.json> --host <origin> --json`
4. `litzio plugins list --host <origin> --json`에서 현재 registrationId와 digest를 확인합니다.
5. `litzio plugins trust community.docling --registration <registrationId> --digest <digest> --host <origin> --json`
6. `litzio plugins enable community.docling --host <origin> --json`
7. `litzio operation invoke community.docling.connection --input <input.json> --host <origin> --json`

Plugins 설정 화면에서는 **Docling 서버 주소**를 입력합니다. 저장 키는 `serverUrl`입니다.

설정 파일은 `{"serverUrl":"http://127.0.0.1:5001"}`, 입력 파일은 `{}`입니다. 이 파일들은 artifact 밖에 둡니다. 기본 주소는 `http://127.0.0.1:5001`이며 서버 base path도 지원합니다. HTTP(S)만 허용하며 URL 안 자격 증명·query·fragment는 거부합니다. 주소는 대상 Host에서 접근합니다.

API 키가 걸린 docling-serve는 지원하지 않음. 설정에는 서버 URL만 있습니다. 활성 상태에서도 설정을 저장·reload할 수 있지만 K1 작업이 running/uncertain이면 변경을 거부하고 기존 값을 보존합니다. 같은 등록의 artifact 변경은 validate → reload → 실제 호출로 확인하며, 등록을 교체하면 새 registrationId로 다시 신뢰합니다.

사이드바 **Docling** 한 화면에서 공통 작업 패널을 사용합니다. 연결은 설정 → 플러그인 → Docling 톱니 → **연결 확인**으로 검사합니다. 별도 연결 표는 같은 health/ready 결과를 중복 표시하므로 제거했습니다. 작업은 열린 Host Root를 선택해야 하며, 연결 확인은 폴더 없이도 가능합니다.

## 연결 확인 범위

`GET <serverUrl>/health`와 `/ready`가 모두 JSON `{"status":"ok"}`이면 연결됨입니다. HTTP 오류·비정상 JSON·연결 실패·5초 시간 초과는 `{ ok: false, message }`를 반환하며 원문 응답·예외는 노출하지 않습니다. redirect는 따르지 않습니다. 이 health/ready 확인은 요청한 모든 모델의 준비·변환 성공·인증 권한을 보증하지 않습니다. PDF 변환은 아래 공용 K1 작업을 사용합니다. 작업 2는 보관된 `.docling`에서 서버 호출 없이 문서를 만듭니다.

기존 `pnpm browser:test http-plugins`는 이 artifact를 validate/등록/설정/신뢰/활성화해 가짜 HTTP health의 정상 → 503 오류 → 복구를 CLI와 설정 연결 확인에서 대조합니다. 새 suite·workspace·subprocess를 추가하지 않고 기존 production Host/CLI/browser를 재사용합니다. 외부 endpoint만 시나리오 프로세스의 임시 HTTP 서버이며 finally에서 닫습니다. `--screenshots`는 별도 수동 검토용 1440px 및 한국어 dark 640px 캡처를 `tmp/docling-002/`에 남깁니다. 실제 Docker 수락은 자동 브라우저와 분리해 화면 또는 CLI로 실행하며 결과를 PR에 별도 기록합니다.

CI 경로 정책은 이 새 경로를 미분류(full)로 취급합니다. 기존 quality의 검사와 HTTP browser job의 `http-plugins`가 실행하며, 이를 건너뛰는 경로 allowlist를 추가하지 않습니다.

화면은 기존 PluginJobPanel·SettingsSelect·Button·체크박스·K1 상태와 결과 행동을 재사용합니다. 새 공통 UI 예외는 없습니다. 640px 작업 표는 공통 renderer의 내부 가로 스크롤을 사용합니다. `--screenshots`의 대시보드 캡처는 `tmp/docling-002/dashboard-1440.png`, `dashboard-640.png`입니다. 검토한 [1440px](../../docs/design/assets/docling-002/dashboard-1440.png)·[한국어 다크 640px](../../docs/design/assets/docling-002/dashboard-640.png)를 보관합니다.

## 버전

플러그인 버전은 **0.0.7**입니다. [CHANGELOG](CHANGELOG.md)와 미확정 [ROADMAP](ROADMAP.md)을 참고하세요. `.docling` manifest에는 생성한 플러그인 버전(`converter.pluginVersion`)과 ZIP 형식 번호(`version: 1`)를 기록합니다. 출처·서버·프로필 기록은 원본 재현을 위해 유지하며 문서 변환 정책 버전은 두지 않습니다. 결과 `.md` 본문에는 버전이나 입력 hash 문단을 추가하지 않습니다.

작업 패널과 healthCheck의 최소 공개 계약에 따라 `requiresSdk: ">=0.3.0 <1.0.0"`을 선언합니다.

## 두 작업으로 분리 (#1322 범위 정정)

PDF 원본 보관과 Litzio 문서 만들기는 별도 K1 작업입니다. 한 요청에 파일 하나를 처리합니다.

1. **PDF 변환:** `a.pdf` → `a.docling`. 원본 PDF와 DoclingDocument JSON 항목은 hash로 확인하며 변경하지 않습니다. `convertPdfToArchive`가 고정 프로필로 서버를 확인·변환하고 `createDoclingArchiveFromResult`가 원본 HTTP 응답 바이트와 PDF 바이트를 받아 `.docling` 바이트를 만들며 파일 쓰기는 하지 않습니다. 플러그인은 Host가 제공한 `resultFile.path`에 ZIP 바이트를 쓰고 닫은 뒤 `file:{path}`만 반환합니다. Host가 Root에 새 파일로 원자적으로 저장하며 기본 이름은 `a.pdf` → `a.docling`입니다. ZIP 바이트를 IPC로 보내거나 output에 직접 쓰지 않습니다.
2. **Litzio 문서 만들기(구현):** `.docling` 한 건의 `document.json`으로 새 Litzio 문서를 만듭니다. Docling API·health·version을 호출하지 않으며 서버가 없어도 같은 원본에서 다른 결과 이름으로 다시 실행할 수 있습니다. 원본 `.docling`은 변경하지 않습니다.

사이드바 Docling에서 작업·열린 폴더를 선택하고 PDF 또는 `.docling` 파일을 체크해 **작업 시작**을 누릅니다. 여러 파일은 파일별 독립 K1 요청으로 함께 접수하며, PDF 서버 요청은 플러그인 활성화 프로세스 안에서 접수 순서대로 한 건씩 처리합니다. 기다리는 작업은 “서버 대기 중”이며 대기 중에도 중단할 수 있습니다. Host 큐나 재시작 복원은 추가하지 않습니다. 변환 helper의 1800초 마감은 해당 차례의 변환 시작부터 적용됩니다. SDK 0.3.0 Host의 기본 결과는 입력 옆의 `a.docling`과 `a.md`입니다(`docs/a.docling` → `docs/a.md`). 동명 결과나 진행 중 작업의 예약이 있으면 `a-2.md`, `a-3.md`처럼 번호를 붙이며 기존 파일은 덮어쓰지 않습니다. 작업 목록과 CLI의 `job.output`에서 실제 정해진 결과 경로를 확인합니다. 시작 오류의 Info 툴팁은 지원하지 않는 입력·꺼진 플러그인·접수 실패 등을 구분합니다. 작업 목록에 상태·단계·경과와 중단·상태 재확인·결과 행동이 표시됩니다. PDF 결과는 경로/복사, 문서 결과는 결과 열기를 제공합니다. 공용 Plugin jobs 화면과 CLI도 유지합니다.

CLI 입력 파일은 artifact 밖에 둡니다.

- PDF 보관: `{"requestId":"<새 UUID>","job":"convert-pdf","root":"<Host Root>","file":"a.pdf"}`. output 생략 시 Host가 `a.docling`으로 정합니다.
- 문서 만들기: `{"requestId":"<새 UUID>","job":"create-document","root":"<Host Root>","file":"a.docling","output":"a.md"}`.


- `litzio plugins start community.docling --input <job.json> --host <origin> --json`
- `litzio plugins status <requestId> --host <origin> --json`
- `litzio plugins stop <requestId> --host <origin> --json`
- `litzio plugins result <requestId> --host <origin> --json`

작업마다 새 requestId를 쓰며 불확실 결과는 같은 ID로 조회합니다. start를 자동 재전송하지 않습니다. 활성 화면은 진행 중 작업을 1초마다 관찰합니다. 여러 파일은 각각 별도 요청이며 Host 작업 큐·재시작 복원·검수 폼은 없습니다. 완료 문서는 아래 공용 원본 대조로 엽니다. 항목 수정 CLI는 아래 0.0.5 계약을 따릅니다. PDF 중단은 요청/폴링과 staging writer를 닫은 뒤 stopped를 보고하며 이미 제출된 서버 작업은 계속될 수 있습니다. 문서 작업의 중단은 로컬 읽기/생성을 중단하며 서버와 무관합니다.

### `.docling` 형식 1 봉투

플러그인 소유 ZIP32 형식이며 모든 항목은 무압축(STORE)입니다. `manifest.json`, `document.json`, `source.pdf`를 포함합니다. `source.pdf`는 제출한 원본 바이트이며 manifest.source의 SHA-256·크기로 확인합니다. `document.json`은 DoclingDocument 전체 필드·그림 ImageRef와 embedded data URI를 보존하며 manifest.document의 SHA-256·크기로 확인합니다. 페이지 PNG도 서버 변환 때 요청해 DoclingDocument의 embedded ImageRef 그대로 보관합니다(`include_page_images:true`, `images_scale:2`). 별도 중복 PNG 항목은 만들지 않습니다. 기존 `.docling` 파일 호환은 지원하지 않습니다.

0.0.5는 선택 `review.json`에 수정 목록과 후속 진행·승인 자리를 둡니다. 슬롯이 없으면 빈 기록으로 읽고 첫 수정에서 저장합니다. 상세 schema·작업은 아래 검수 계약을 따릅니다. 검수 기록과 무관하게 원본 PDF/JSON hash를 검증하며 전체 ZIP hash를 원본 항목 identity로 쓰지 않습니다. 검수 저장은 공식 경로로 ZIP 전체를 다시 쓰고 `.md`·`assets/`는 밖에 둡니다.

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

picture/table/text/nested 이미지는 `document.json#<JSON pointer>`의 embedded URI에 원본 그대로 남고 해당 경로를 manifest에 기록합니다. 이미지의 크기 변경·재인코딩은 하지 않습니다. MIME/magic/base64와 이미지 hash를 확인하며 페이지 ImageRef는 PNG만 받습니다. 페이지 이미지는 `/pages/<번호>/image` pointer와 `pages/<번호>.png` 논리 경로로 기록하지만 실제 바이트는 원본 JSON 안에만 있습니다. 원격/file 이미지 URI는 가져오지 않고 거부합니다. JSON의 모든 ImageRef URI·좌표·크기·DPI를 그대로 유지합니다. 숫자는 Node JSON reviver의 source와 `JSON.rawJSON`으로 원래 토큰을 보존하므로 `origin.binary_hash` 같은 uint64가 반올림되지 않습니다. 저장 JSON은 공백 형태만 달라질 수 있습니다.

`createDoclingArchive({manifest,documentJson,sourceBytes,reviewBytes?})`는 Buffer만 반환하며 `readDoclingArchive`는 같은 봉투를 읽습니다. Node 표준 Buffer/crypto/zlib만 쓰며 npm 의존성·SDK 내부 import·직접 결과 파일 쓰기·디스크 압축 해제는 없습니다. Node에 ZIP API가 없어 필요한 STORE ZIP32 헤더/목록만 플러그인에 둡니다. 일반 ZIP/DEFLATE/ZIP64/분할 ZIP/암호화/알 수 없는 항목은 지원하지 않습니다. 경로·중복 항목·CRC·중앙/로컬 헤더·범위·필수 원본 항목·manifest의 PDF/문서/이미지 hash를 확인합니다. 이 hash 검증은 보관 이후의 바이트 일치이며 원본 PDF의 진위나 추출 품질 보증이 아닙니다. 파일 결과 상한은 Host의 2 GiB이며 writer를 닫은 뒤 Host가 크기·확장자·Root·충돌을 확인해 저장합니다. 실패·중단 때 staging 정리도 Host가 소유합니다. 플러그인의 ZIP 생성은 현재 메모리에 전체 바이트를 준비하므로 대규모 PDF의 메모리 사용은 수락하지 않았습니다.

### 작업 1 고정 프로필과 검증

보관 SHA `ce90560aacaee2482d37c4b25e36e93060ed156c`의 `plugins/docling/profiles/litzio-pdf-en-v1.json`의 페이지 이미지 포함 요청을 유지한 [고정 프로필](litzio-pdf-en-v1.json)을 사용합니다. 아래 탐색 시험의 축소 옵션이나 서버 기본값을 제품 요청 옵션으로 쓰지 않습니다. 개별 옵션 선택이나 대체 프로필은 없습니다.

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

0.0.1 당시 가짜 서버 약 1.5분·실제 Docker 포함 약 2.2분은 과거 실행 기록입니다. 과거 0.0.3·0.0.4 변환기의 검증·수동 캡처는 아래 절을 따릅니다. CI는 가짜 서버만 사용하고 실제 서버는 별도 수락입니다.

### 문서 변환 규칙 (0.0.4 / #1382)

한 경로 `불변 원본 → 수정 적용 단계(review.json의 수정 재생·private copy) → 블록 → SDK authorDocument`로 만듭니다. 원본 body.children과 group/element 참조를 따라 순서를 유지하며 label 또는 content_layer가 furniture인 머리글·바닥글은 제외합니다. 잘못된 참조·중복/순환·표 좌표/범위/겹침 오류는 전체 실패합니다. 플러그인이 Docling 의미를 해석하고, Core의 공개 SDK만 문서 생성·정규화·canonical 직렬화를 담당합니다.

| 원본 | 출력과 손실 |
| --- | --- |
| title / section_header H1–H6 | H1 / 해당 단계 제목. 잘못된 단계는 문단으로 보존하고 미지원 기록 |
| text / paragraph | literal 문단. Markdown으로 재해석하지 않음 |
| table | 원본 num_rows×num_cols 직사각형, 첫 행 header, 빈 칸 유지. 병합 칸은 모든 위치에 같은 글자 반복. 다단 header의 뒤 행은 body로 유지하며 손실 기록. row-header/section 의미 변경도 기록 |
| list_item | 원래 순서의 평면 bullet/번호 목록. 연속 번호·종류가 같은 인접 항목을 결합하고 100항목마다 다음 블록. 중첩 평탄화와 표현하지 못한 marker를 항목별 기록 |
| code / formula | Code / Equation. 원본 code_language·수식 text 사용; 추출 오류를 추측해서 고치지 않음 |
| picture + captions | embedded ImageRef를 공용 이미지 입력으로 전달해 Figure에 연결. 이미지가 없거나 전달할 수 없으면 pending Figure와 이미지 미포함 손실을 유지 |
| table captions | 확실한 원본 번호는 Table 고정 번호로 이동. 남은 caption은 표 뒤의 literal 문단(현재 공용 입력에 table caption 속성이 없음). 번호·본문의 대응을 모두 연결 |
| footnote / unknown / unreachable | 각주는 call site 추측 없이 문단; 알 수 있는 text는 문단으로 보존. 알 수 없는 내용·group·미도달 항목·inline 서식/링크 의미 손실을 self_ref별 기록 |

0인 손실 종류는 생략하고 완료 phase에 `병합 칸 반복 5 · 다단 헤더 계층 소실 1 · 중첩 목록 평탄화 1 · 그림 이미지 미포함 2 · 미지원 1` 형태로 요약합니다. 기존 PluginJobPanel의 단계 칸을 그대로 쓰며 새 화면·공통 interaction 예외는 없습니다. 머리글/바닥글 제외는 report.items의 furniture 상태에 남습니다. 표 개수 같은 정상 변환 통계는 손실 요약에 넣지 않으며 표 셀 역할 소실·목록 표식 미보존도 각각 구분합니다. 손실 기록이 없으면 요약은 비어 있습니다. 전체 근거와 짧은 항목별 설명은 report.losses에 있습니다. 추출 품질과 원본에 없는 의미는 복구하지 않습니다.

캡션 접두어 `Figure`, `Fig`/`Fig.`, `그림`, `Table`, `표` 뒤의 아라비아 숫자와 숫자 사이 `.`/`-`를 읽습니다. 영어 대소문자는 구분하지 않습니다. 예: `Figure 6:`, `Fig. 2`, `그림 3`, `Table 2-1.`, `표 4`. 숫자 문자열은 정규화하지 않고 고정 enumerator로 옮기며 접두어·구분자만 제거합니다. 로마 숫자·알파벳·숫자 접미사·모호한 경계·종류 불일치·독립 번호가 있는 복수 캡션·같은 종류의 같은 번호 중복은 원문을 그대로 두고 `enumerated:false`로 표시합니다. 이 경우 `캡션 번호 미보존` 손실을 기록합니다. 번호 없는 caption도 이 경로를 사용합니다. Figure와 Table은 서로 독립이며 자동 번호를 만들지 않습니다.

문서 생성은 원본 `.docling`을 수정하지 않으며, 이미지를 플러그인에서 직접 저장하지 않습니다. 검수 수정 저장은 별도 공용 Host 작업입니다. ImageRef의 PNG/JPEG/WebP 바이트를 공용 `{authoring,images}` 결과로 반환합니다. Host가 이미지 바이트를 검사하고 문서 옆 `assets/`에 게시합니다. 검수 재생성처럼 **같은 출력 경로**로 다시 만들면 같은 파일을 재사용합니다. 다른 출력 문서는 공용 Host의 문서별 asset 경로를 사용합니다. 크기·개수·미지원 이미지 거부도 공용 Host를 따르며 실패를 이미지 없는 성공으로 우회하지 않습니다.

### 원본 항목과 출력 대응

`litzio operation invoke community.docling.conversion-report --input <report.json> --host <origin> --json`, 처음 입력은 `{"requestId":"<문서 생성 요청 UUID>","result":<plugins result 응답의 job.result>}`입니다. Host 완료 result의 path/revision/inputs를 그대로 전달합니다. 플러그인은 이 요청의 출력 경로·실제 파일 hash·SDK 입력별 target 위치와 revision을 확인하고 최종 targets로 보고서를 연결합니다. 연결 후에는 `{"requestId":"<동일 UUID>"}`만으로 같은 snapshot 보고서를 읽을 수 있습니다. 실패 보고서는 result 없이 읽습니다. 입력 파일은 artifact 밖에 둡니다. report는 `sourceHash`(보관 document.json의 정확한 SHA-256), `documentRevision`, `documentHash`, `items`, `losses`, `summary`를 반환합니다. 실패에는 고정된 `failure.reason`과 선택 self_ref가 있습니다. Host의 K1 오류는 보안 계약대로 고정 분류/안내이며 상세 한도 사유는 이 읽기 결과에서 확인합니다.

SDK 입력 key는 self_ref이며 영속 식별은 sourceHash+self_ref입니다. items의 targets는 Host가 이미지 경로를 바인딩한 최종 SDK key별 targets로 계산합니다. 표 caption의 원본 번호와 본문은 table/뒤 문단 두 target에 연결될 수 있습니다. 여러 목록 항목이나 그림+캡션이 같은 target을 공유할 수 있습니다. table.cells는 원본 table_cells의 index, 출력 grid positions와 targets를 담습니다. container·furniture·미도달 항목의 targets는 비어 있습니다. target path는 출력 revision에만 유효하며 재변환 때 새로 계산합니다.

대응 파일을 만들지 않습니다. 플러그인 활성화 수명의 요청별 메모리에 결과를 두고 기존 CLI 읽기 작업으로 돌려줍니다. 별도 대응 파일 없이 같은 convertDocument 경로와 Host 완료 inputs로 다시 연결합니다. reload/restart 뒤 기존 conversion-report는 사라지며 다시 문서를 만들어야 합니다. 0.0.7의 원본 대조는 Host 연결의 최종 inputs로 대응을 다시 계산하므로 이 메모리 보고서에 의존하지 않습니다. Host 완료 receipt가 없으면 최종 대응 보고서를 발행하지 않습니다. 이미지를 임시 경로에 바인딩한 SDK 검증 snapshot은 실제 저장 결과로 반환하지 않습니다. 보고서의 target은 해당 출력 revision에 고정되며 후속 수동 편집을 현재 상태처럼 따라가지 않습니다. `.docling`의 검수 기록과 이 재계산 결과를 혼동하지 않습니다.

### 한도와 검증 경계

SDK 한도는 입력 5,000개(원본 항목 단위, 제외·container도 포함), 전체 5,000블록, 입력 JSON/출력 source 각각 UTF-8 4MiB, 문자열 16,384 UTF-16 units, 표 100행×32열입니다. 넘으면 잘라 통과시키지 않고 전체 실패하며 문서를 만들지 않습니다. 목록 100항목은 내용을 자르지 않고 다음 블록으로 이어집니다. 이미지당 10MiB·최대 256개와 공용 K1/이미지 저장 제한도 따릅니다.

자동 검사는 기존 plugins.test.ts에서 원본 불변·native 요소·공유 targets·병합 셀 index/위치·손실 분류와 잘못된 graph/grid·문자열/입력/byte/표 한도 거부를 보호합니다. ZIP 예약 검수 항목과 독립적인 원본 hash 검증도 확인합니다. 기존 http-plugins는 같은 가짜 서버와 작은 fixture로 공개 SDK 활성화→K1 공식 저장→revision/report 조회→브라우저 요소·손실 요약을 검증합니다. 의미 조합은 낮은 계층에 두며 새 subprocess·suite·타임아웃 확대는 없습니다. 번호 해석·중복 규칙과 최종 target 연결은 낮은 계층에서 검사하며 이미지 게시·실제 표시 경계만 기존 HTTP 시나리오에서 확인합니다.

아래 0.0.3 당시의 실제 docling-serve 검증은 과거 근거입니다. 입력은 [ReportLab/Pillow 생성 스크립트](fixtures/create-acceptance.py)로 저장소 루트에서 재생성합니다. 표·번호 목록·코드·수식·그림+캡션·머리글/바닥글이 있는 한 페이지 합성 PDF를 고정 프로필로 변환했습니다. 첫 3페이지 PDF는 서버 backend의 partial_success라 거부했으며 성공으로 포장하지 않았습니다. 한 페이지 결과에서 native 요소·furniture 제외·원본 PDF와 그림 ImageRef 보존을 확인합니다. 서버의 코드 분할·수식 인식 품질은 검수 전이며 PDF와의 의미 동등성을 보증하지 않습니다.

수동 캡처는 서버 변환이 끝난 `.docling`을 `LITZIO_DOCLING_REAL_ARCHIVE`, 이전 변환기의 같은 문서 source를 `LITZIO_DOCLING_BEFORE`로 지정한 `pnpm browser:test http-plugins --screenshots`로 촬영합니다. 이 옵션은 Docling 등록·문서 생성·열기·대응·1440/한국어 dark 640px 검토만 수행하며 Jira fault 회귀는 별도 자동 실행이 소유합니다. 외부 모델 대기를 180초 가짜 서버 회귀 안에 넣지 않습니다. 재생성 가능한 PDF/ZIP/JSON은 커밋하지 않습니다.

수동 검토 근거(계정·폴더 경로 마스킹):

| 상태 | 1440px | 한국어 다크 640px |
| --- | --- | --- |
| 이전 변환기 | [Before](../../docs/design/assets/docling-003/before-1440.png) | [Before](../../docs/design/assets/docling-003/before-640.png) |
| 표·목록·코드 | [After](../../docs/design/assets/docling-003/after-1440.png) | [After](../../docs/design/assets/docling-003/after-640.png) |
| 수식·캡션 Figure | [After](../../docs/design/assets/docling-003/equation-figure-1440.png) | [After](../../docs/design/assets/docling-003/equation-figure-640.png) |
| 손실 요약 | [패널](../../docs/design/assets/docling-003/losses-1440.png) | [왼쪽](../../docs/design/assets/docling-003/losses-640.png) · [오른쪽](../../docs/design/assets/docling-003/losses-640-end.png) |

공통 표의 정렬·여백·한국어 줄바꿈·가로 스크롤과 본문 잘림/가림을 확인했습니다. 0.0.3 당시에는 캡션의 원본 `Figure 1:`과 자동 번호가 함께 보였습니다. 0.0.4는 확실한 번호를 이동하고 불확실한 번호에 자동 번호를 붙이지 않습니다. UI 표면이나 레이아웃은 변경하지 않습니다.

## 공식 로고 조사 (2026-11-09)

공식 출처는 [Docling SVG 원본](https://github.com/docling-project/docling/blob/main/docs/assets/logo.svg)과 [LF AI & Data 프로젝트 페이지](https://lfaidata.foundation/projects/docling/)입니다. 코드의 [MIT 라이선스](https://github.com/docling-project/docling/blob/main/LICENSE)는 상표 허가를 대신하지 않습니다. [Linux Foundation 상표 정책](https://www.linuxfoundation.org/legal/trademark-usage)은 프로젝트별 추가 조건과 로고 사용 제한을 별도로 정합니다. 이 커뮤니티 플러그인의 사이드바 로고 재배포에 적용할 명시적 허용 조건을 확인하지 못했으므로 공식 로고 파일과 로고를 가리키는 선언을 추가하지 않았습니다. 일반 문서 변환 아이콘 `icon.svg`는 앱이 사용하는 Lucide `file-output`(lucide-react 1.47.0, [원본](https://github.com/lucide-icons/lucide/blob/main/icons/file-output.svg))을 고정 색상으로 사용하며, ISC 라이선스·저작권 고지는 [ICON-LICENSE](ICON-LICENSE)에 보관합니다. 공식 공급·후원 관계를 나타내지 않습니다.


### 0.0.4 수락 검증 (#1382)

[작은 PDF 생성 스크립트](fixtures/create-figures-acceptance.py)를 ReportLab/Pillow로 실행하고 기존 `docling-serve` 컨테이너를 시작해 고정 프로필로 변환했습니다. 서버의 완전한 success이며 한 페이지·그림 ImageRef 2개·표 1개와 `Figure 6`, `Table 2-1`, `Figure IV` 캡션을 확인했습니다. 보관 파일은 약 55KiB입니다. 시험 후 컨테이너는 중지했으며 삭제·재생성하거나 다른 컨테이너를 조작하지 않았습니다.

공개 SDK 활성화→K1 생성→최종 receipt로 대응 보고서 연결→Litzio 열기에서 두 이미지의 실제 로드, 고정 번호 6/2-1, 로마 숫자 캡션 원문과 번호 없음, `캡션 번호 미보존 1`을 확인했습니다. 이미지 미포함 손실은 없었습니다. 생성된 문서만 지운 뒤 같은 출력 경로로 다시 만들 때 asset 파일 목록이 같고 원본 .docling 바이트도 동일함을 확인했습니다. 다른 이름의 출력 문서 간 asset 공유까지 주장하지 않습니다. 작은 합성 PDF의 수락이며 복잡한 PDF의 추출 품질·원본 의미 동등성을 보증하지 않습니다.

| 상태 | 1440px | 한국어 다크 640px |
| --- | --- | --- |
| 기존 변환기 | [Before](../../docs/design/assets/docling-004/before-1440.png) | [Before](../../docs/design/assets/docling-004/before-640.png) |
| 이미지·고정 번호 | [After](../../docs/design/assets/docling-004/after-1440.png) | [After](../../docs/design/assets/docling-004/after-640.png) |
| 그림·미해석 번호 | [그림](../../docs/design/assets/docling-004/figures-1440.png) | [그림](../../docs/design/assets/docling-004/figures-640.png) |
| 손실 요약 | [요약](../../docs/design/assets/docling-004/losses-1440.png) | [오른쪽 끝](../../docs/design/assets/docling-004/losses-640-end.png) |

Before는 같은 불변 .docling을 0.0.3 변환기 소스(`e0c30727`)와 공개 SDK로 생성한 문서입니다. 같은 현재 렌더러·입력·폭/테마에서 비교했습니다. 기존 caption/표/PluginJobPanel을 그대로 쓰며 새 UI 표면·상호작용 예외는 없습니다. 정렬·여백·캡션 중복·가림·한국어 줄바꿈과 640px 표 내부 가로 스크롤을 검토했습니다. 공용 입력에 table caption 속성이 없으므로 표 캡션 본문은 기존처럼 표 뒤 문단에 남고 표 번호만 Table에 연결됩니다. 이 제한을 숨기려고 본체를 변경하지 않았습니다.

자동 검사는 기존 plugins.test.ts에서 번호 규칙·같은 종류 중복·원본 불변·공용 이미지 전달과 최종 target 연결을, 기존 http-plugins에서 가짜 서버와 실제 이미지 로드·캡션 표시·손실 요약을 보호합니다. 새 suite·서버 subprocess·timeout·retry는 추가하지 않았습니다. 같은 가짜 서버 PNG fixture는 공용 Host의 complete-container 검사에 맞는 CRC 바이트로 바로잡았습니다. 실제 서버 지연은 자동 검사에 넣지 않으며 수동 캡처 경로의 같은 파일 재생성만 별도 실행합니다.

로컬 결과: plugins.test.ts 30개와 변경 후 Docling 대상 5개, typecheck·Editor/CLI build·docs/diff 검사를 통과했습니다. 가짜 서버 http-plugins는 HTTP 복구를 포함해 2개 약 2.2분, 실제 보관 파일 수동 경로는 같은 2개 약 1.2분에 통과했습니다. 두 경로는 같은 checkout의 persistent profile로 순차 실행했고 직접 시작한 격리 Host와 브라우저 세션을 종료했습니다.
## 검수 기록과 재생성 0.0.5 (#1364)

원본 PDF·DoclingDocument 바이트는 `.docling`의 source.pdf·document.json에 유지하고 manifest hash로 검사합니다. `review.json`은 `{patches,checkedPages,lastPage,approval}`이며 초기값은 `[]`, `[]`, `null`, `null`입니다. 진행 기록은 아래 0.0.7 대조 작업으로 저장하며 완료 승인 작업은 아직 없습니다. 수정 시 확인한 페이지와 마지막 위치를 비웁니다. 별도 검수 기록 파일이나 Markdown 메타데이터를 만들지 않습니다. `.md`와 assets/는 다시 만들 수 있는 결과물입니다.

patches는 self_ref 기준 순서 있는 목록이며 마지막 지정이 이깁니다.

- `{type:"text",self_ref,text}`: 텍스트 항목 전체 글자. orig·좌표는 변경하지 않습니다.
- `{type:"kind",self_ref,kind:"paragraph"}` 또는 `{type:"kind",self_ref,kind:"heading",level:1..6}`. 머리글/바닥글도 본문 역할로 교정할 수 있으며 캡션의 역할을 바꾸면 소유 항목 뒤의 문단/제목으로 출력합니다.
- `{type:"exclude",self_ref,excluded:boolean}`: 항목과 children 자손을 제외하거나 제외 취소합니다. 뒤의 자손 지정은 앞의 그룹 지정을 덮어쓸 수 있습니다.
- `{type:"cell",self_ref,cell,text}`: 원본 table_cells의 0부터 시작하는 칸 번호. 병합·행/열 구조는 바꾸지 않습니다.

기존 변환 경로(불변 원본→복사본에 수정 적용→블록→SDK authorDocument)를 사용합니다. 수정은 최대 2,000개, 글자는 기존 SDK string 한도를 따릅니다. 잘못된 대상·종류·수준·칸은 저장 전에 거부합니다. 변환 지원 한계로 재생성이 실패해도 저장된 수정은 유지합니다. 저장 순서는 `.docling`의 revision 확인·임시 파일·교체 다음 문서 재생성이며, 두 파일 동시 저장은 약속하지 않습니다. 응답의 correctionsSaved/documentRegenerated와 regeneration-required 상태를 확인하세요. 수정 요청은 자동 재전송하지 않고 같은 requestId의 status를 조회합니다. Host 재시작 후 receipt가 없으면 read로 파일을 다시 확인합니다.

CLI는 같은 Host 작업을 사용합니다. `litzio review read|open|patch|regenerate|status --input request.json --host <origin> --json`입니다. read 입력은 `{root,document:"source.md"}`입니다. patch는 read가 반환한 baseline과 UUID requestId 및 patches를 추가합니다. regenerate는 baseline과 requestId만 추가합니다. `.docling`만 인계받았다면 open에 plugin:"community.docling", job:"create-document", source:"copied.docling", document:"copied.md", root와 baseline을 지정합니다. 처음 baseline은 sourceRevision:복사한 파일의 SHA-256, documentRevision:null, linkRevision:null입니다. 기존 연결이 있으면 read 결과를 사용합니다. 새 문서 생성은 입력 옆 같은 이름을 사용하고 충돌 시 -N으로 새 이름을 고릅니다. 검수 regenerate는 연결된 기존 경로를 revision 확인해 교체하며 -N 문서를 만들지 않습니다.

관리 연결과 마지막 생성 revision은 Host 앱 데이터의 generated-documents.json.d/에 정규화한 문서 경로 identity 기준으로 저장합니다. 검수 기록은 이곳에 복제하지 않습니다. 다른 PC에서는 명시적 open 또는 새 문서 생성이 새 연결을 만듭니다. 문서 이동·이름 변경 후에는 경고가 사라질 수 있으며 자동 추적·연결 이행은 지원하지 않습니다. 직접 편집한 문서는 Editor와 같은 Host 앱 데이터 설정을 쓰는 CLI가 경고하지만 Save는 허용합니다. 최신 baseline을 명시해 다시 만들면 직접 수정한 내용을 대체합니다. 오래된 baseline이나 실행 도중 변경된 파일은 덮어쓰지 않습니다.

## 원본 대조 0.0.7 (#1408)

완료된 ‘Litzio 문서 만들기’ 행의 ‘원본 대조’로 연다. 왼쪽은 같은 변환에서 보관한 원본 PDF의 페이지 PNG이며 화면을 열 때 다시 변환하지 않는다. 오른쪽은 저장된 생성 문서다. 원본 영역 또는 문서 블록을 선택해 대응 위치로 이동한다. 없는 대응은 추측하지 않는다. 페이지의 ‘확인함’과 이동 위치는 review.json의 checkedPages·lastPage에 저장한다. patches·approval과 원본 source.pdf/document.json/manifest 바이트는 보존한다. 원본 hash는 저장 전후 검증한다. 재생성은 같은 출력 revision의 최종 targets로 대응을 다시 계산한다.

확인 기록 저장은 `.docling` 전체를 공식 경로로 교체하고 생성 문서를 쓰지 않는다. 저장은 순서대로 진행하며 다음 페이지 읽기를 막지 않는다. 저장 중에는 대응 선택을 잠시 막고 상태를 표시하며, 실패하면 확인·대응 행동을 막고 새로고침을 안내한다. 캐시는 현재 활성화에서 Host가 검증한 source revision 하나에 한정하고 외부 변경 시 버린다. 외부 변경이나 저장 실패가 보이면 다시 읽어야 한다. 실패한 저장은 자동 반복하지 않는다. 대조 안 편집·검수 완료 승인은 다음 단계다. 같은 파일을 전달받으면 기존 open 또는 새 문서 만들기로 새 Host 연결을 만든 뒤 기록을 이어간다.

공통 CLI `review compare --input request.json --host <origin> --json`은 `{root,document,pageNo?}`로 대조 snapshot·progress·generatedBaseline을 읽는다. `review progress`에는 같은 root/document, generatedBaseline을 baseline으로, UUID requestId와 `progress:{checkedPages:[1],lastPage:1}`를 보낸다. 결과의 progressSaved/receipt를 확인하고 응답이 유실되면 같은 requestId의 review status를 조회한다. 공용 SDK 0.4.0을 요구하며 아직 공개되지 않은 같은 버전에 포함한다.

검증은 [공용 대조의 검사·1440/640px 전후 캡처](../../docs/design/plugin-stage1-v1.md#1408-검증화면-근거)를 따릅니다. 실제 docling-serve 1.32.0으로 NIST SP 1108r4 발췌 11쪽과 보충 합성 1쪽을 변환했습니다. 넓은 표의 대응·페이지 확인과 200쪽 합성 용량을 별도로 확인했으며 수치·한계는 공용 계약에 기록합니다. 컨테이너를 중지했습니다. 문서의 추출 품질이나 의미 동등성을 보증하지 않습니다.

## 보관 자료

[LSR 1.1 합성 PDF와 작성자 기대 구조](sample/lsr-1.1/README.md)를 보관합니다. Docling 출력 정답이나 품질 합격선이 아니며, 플러그인과 함께 배포되는 체험용 샘플입니다.
