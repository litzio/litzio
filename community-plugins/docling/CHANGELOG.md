# Changelog

## 0.0.11 — 미발행

- SDK 0.5.0의 블록·칸 target 검증과 칸 material/CLI를 사용합니다.
- 원본 병합 span을 모든 실제 칸에 연결하고 빈 grid를 cell:null로 구분합니다.
- 칸 영역과 최종 canonical snapshot 대응을 재생성합니다. ZIP format 4 / review record version 4이며 migration은 없습니다.

## 0.0.10 — 미발행

- P1a/P1b의 내부 snapshot·대조·중간 export에 P2 공용 묶음·검사·필수 확인·완료 기록을 추가합니다.
- ZIP format 3 / review record version 3. 과거 archive migration은 제공하지 않습니다.
- README·manifest·package·versions의 현재 버전을 맞춥니다.

## 0.0.7 — 과거 변경

- 완료 문서의 공용 원본 대조 진입, 불변 provenance와 최종 targets의 양방향 대응을 제공합니다.
- review.json의 확인 페이지·마지막 위치를 공식 전체 파일 교체와 revision 검사로 저장합니다. 원본 PDF/JSON/manifest와 수정 목록을 보존하며 문서를 재생성하지 않습니다.
- 공용 SDK 0.4.0의 comparison/progress와 같은 Host·CLI를 사용합니다. 화면 내 수정·완료 승인은 포함하지 않습니다.
- 변환 때 원본 JSON에 포함된 페이지 PNG를 보관해 기존 공용 이미지·bbox 대조를 재사용합니다. 화면 진입 시 서버 호출·PDF 재렌더링이 없습니다. 검증한 원본과 대응을 revision별로 재사용하며 기록 저장을 순서대로 처리합니다.
- README의 현재 버전과 변환 manifest의 pluginVersion을 0.0.7로 맞춥니다.

## 0.0.6

- 연결 설정 표시 이름을 Docling 서버 주소로 바꿉니다. 저장 키와 최소 SDK 0.3.0은 유지합니다.

## 0.0.4 — 미발행

- 보관된 그림 ImageRef를 공용 이미지 입력에 전달합니다. Host가 공식 assets/ 경로에 저장하며 같은 출력 경로로 재생성하면 기존 이미지를 재사용합니다. 원본 .docling/PDF/JSON은 수정하지 않습니다.
- Figure/Fig./그림과 Table/표의 확실한 아라비아 숫자 캡션 접두어를 고정 번호로 옮기며 `2-1` 같은 문자열을 그대로 보존합니다. 접두어·구분자는 캡션에서 제거합니다.
- 로마 숫자·알파벳·모호한 형식·종류 불일치·같은 종류의 중복 번호는 캡션을 그대로 두고 번호 없음으로 표시하며 손실 요약에 기록합니다. 자동 그림/표 번호는 쓰지 않습니다.
- 대응 보고서는 Host 완료 result(path/revision/inputs)로 최종 targets를 연결하고 실제 파일 hash를 확인합니다. 출력 형식은 기존 sourceHash/items/losses/summary 구조를 유지하며 별도 형식 버전은 만들지 않습니다.
- #1378의 공용 이미지 입력과 #1383의 번호 없음/최종 targets를 사용합니다. 플러그인 전용 Core·Host·Editor 제품 코드를 추가하지 않습니다.

## 0.0.3 — 미발행

- 원본 PDF·DoclingDocument JSON·manifest를 `.docling`에 보존하고 페이지 PNG 요청/저장을 제거합니다. 그림 ImageRef와 원본 hash 검증은 유지하며 기존 봉투 호환은 지원하지 않습니다.
- 선택 opaque review.json 슬롯만 예약합니다. 원본 hash는 검수 기록과 독립이며 검수 기록·승인·편집 기능은 구현하지 않습니다.
- 빈 수정 단계부터 SDK authorDocument까지 한 경로로 제목·문단·직사각형 표·평면 목록·코드·수식·이미지 없는 캡션 Figure를 만듭니다. furniture는 제외합니다.
- sourceHash+self_ref와 SDK targets, 병합 셀 원본 index, 다대일 대응·항목별 손실을 요청별 conversion-report 읽기 결과로 제공합니다. 별도 대응 파일은 없으며 reload 후 재계산합니다.
- 완료 단계에 병합 칸 반복·다단 헤더 계층 소실·중첩 목록 평탄화·그림 이미지 미포함 등 실제 손실만 요약하며 표 개수와 0건은 표시하지 않습니다. SDK 한도나 잘못된 참조/표는 전체 실패하고 보고서에 이유를 남깁니다. Core·Host·Editor·CLI 제품 코드는 변경하지 않습니다.

## 0.0.2 — 미발행

- 사이드바 Docling 화면에 PDF 변환·Litzio 문서 만들기를 선언합니다. 공통 작업 패널에서 다중 선택과 작업 목록·상태·단계·중단·결과 행동을 제공합니다. 진행 중 작업 관찰은 활성 화면 수명을 따릅니다.
- PDF 서버 요청은 플러그인 프로세스 안에서 한 건씩 처리합니다. 대기 단계와 대기 중 중단을 제공하며 Host 큐는 추가하지 않습니다.
- 설정 연결 확인을 `healthCheck`와 고정 `{ ok, message }`로 제공합니다. 중복 연결 상태 표는 제거했습니다.
- API 키 설정·secret 선언·X-Api-Key 전송을 제거했습니다. API 키가 걸린 docling-serve는 지원하지 않음.
- `requiresSdk: ">=0.3.0 <1.0.0"`. 변환 정책·봉투 형식 1은 유지합니다.
- 일반 아이콘은 앱과 같은 Lucide의 file-output SVG(ISC)를 사용합니다. 출처·고지는 README와 ICON-LICENSE에 기록합니다.
- 공식 로고는 상표 사용 허용 조건 미확인으로 포함하지 않습니다. README에 출처와 판단을 기록합니다.


## 0.0.1 — 미발행

공개 SDK 0.2.0 이상을 사용하는 첫 커뮤니티 플러그인 버전입니다. 공식 번들·기본 활성 플러그인이 아닙니다.

### 지원하는 기능

- docling-serve 주소·API 키 설정과 health/ready 수동 확인. 모델별 준비를 보증하지 않습니다.
- `.docling` → `.md`: 제목·문단·표 셀 텍스트 평탄화의 최소 변환. 공용 작업 화면과 CLI에서 시작·상태 확인·중단·결과 열기를 사용합니다.
- PDF → `.docling`: 고정 `litzio-pdf-en-v1`, 서버/OpenAPI 1.32.0·ready 확인, DoclingDocument 1.10.0·완전 success 검사, 단일 제출, 기본 1800초 전체 마감, 원본 해시 재확인, 출처·페이지 이미지 보존. Host가 제공한 staging에만 쓰고 일반 파일 결과로 공식 저장합니다. 기본 이름은 `a.pdf` → `a.docling`입니다.
- ZIP 형식 번호 1에 원본/결과/OpenAPI/이미지 hash·크기, 프로필 전체, task ID·시각을 기록합니다. 이미지는 원본 바이트를 유지하고 큰 JSON 정수를 보존합니다.

### 제한과 아직 확인하지 못한 점

- 서버 작업 취소 API가 없습니다. 로컬 중단 뒤에도 제출된 서버 작업은 계속될 수 있습니다.
- 요청 한 번에 파일 하나입니다. 여러 파일은 각각 명시적으로 요청하며 큐·다중 선택·재시작 복원은 없습니다.
- Litzio 결과의 그림·캡션 번호·연결된 미주·중첩 목록·rich inline과 대조뷰는 지원하지 않습니다. 원본 `.docling`의 데이터는 보존합니다.
- SDK의 256 KiB·500블록·문자열·표 한도를 적용하며 조용히 잘라 저장하지 않습니다.
- 로컬 `docling-serve` 컨테이너에 CodeFormulaV2를 설치한 뒤 고정 프로필 전체의 실제 변환이 성공했습니다. 컨테이너는 모델을 보관한 채 중지하며 매번 만들거나 삭제하지 않습니다. 복잡한 PDF의 품질 수락은 별도입니다.
- `requiresSdk`는 `>=0.2.0 <1.0.0`입니다. 두 작업 모두 공용 작업 화면/CLI의 시작·상태·중단을 사용합니다.

## 0.0.5 — 검수 1단계 (#1364)

- `.docling` 내부 review.json에 self_ref 수정 네 종류와 후속 진행·승인 자리를 저장합니다. 원본 PDF/JSON 바이트와 hash는 유지합니다.
- Host 공식 revision 교체 후 기존 변환기로 재생성하며 저장됨/재생성 필요와 충돌을 구분합니다.
- Host 앱 데이터에 관리 연결을 기록하고 Editor·CLI 직접 편집은 경고 후 허용합니다. 단일 `.docling` 인계는 명시적 open으로 이어 갑니다.
- 대조 화면·수정 폼·진행·완료 승인은 포함하지 않습니다.
