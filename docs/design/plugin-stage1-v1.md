# 플러그인 실행·제작 계약

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [AGENTS.md](../../AGENTS.md).
- Last verified: 2026-11-13 — #1592 1-2 코드·대상 검사 대조. 실제 외부 서비스·원격 PC 수락은 포함하지 않는다.

## 현재 범위

플러그인은 대상 Host의 Node 하위 프로세스에서 실행되고 자기 React 화면 코드를 제공한다. 설치·신뢰·활성·설정·비밀값·비서 스킬·공용 작업·receipt·reload·앱에 실은 npm과 번들러를 유지한다. Core의 문서 의미와 공식 write path는 플러그인이 재구현하지 않는다.

OneDrive·Jira·Docling, 선언형 화면·조회·자동 form·검수·원본 대조 틀·지정/공식 공급은 2026-11-13 삭제했다. 보관 브랜치 `archive/plugins-declarative-2026-11-13`, 태그 `archive/2026-11-13-plugins-declarative`. [삭제 전 계약](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/docs/design/plugin-stage1-v1.md)은 역사다. 단독 PDF 탭·문서 편집/저장/복구·비서 변경 보기/Undo는 유지한다.

## 신분증

최소 artifact는 `litzio-plugin.json`, `host.mjs`, `screen.jsx`다.

```json
{"id":"local.example","name":"Example","icon":"ChartColumn","entry":"host.mjs","screen":"screen.jsx"}
```

선택 선언은 `description`, `operations`, `settingsSchema`, `secrets`, `skills`, `healthCheck`다. 공개 작업은 id·version·effect(read/write)·scope·assistant·inputSchema·outputSchema를 선언한다. 생략 기본값은 version 1, read, host, assistant false, 빈 schema다. 화면 전용 handler는 공개 작업 선언 없이 자기 화면의 invoke로 호출한다. 비서는 assistant:true 읽기와 healthCheck만 호출한다. 외부 CLI의 공개 invoke와 같은 입력·출력 검증 및 receipt를 사용한다.

아이콘은 제공된 이름 또는 artifact 내부 SVG/PNG다(확장자 대소문자 무관, 최대 64 KiB·가로/세로 1–256px). WebP 등 다른 형식은 거부한다. SDK의 공통 형식 정의를 manifest 검증과 Host 로더가 함께 사용한다. host/screen/icon의 절대 경로·URL·상위 탈출을 거부하며 파일은 artifact 안에서 해석한다. 화면 소스와 SDK handler 검증은 설치 시 실행 전에 수행한다. 스키마의 외부 참조·중복 작업/secret/skill ID를 거부한다. SDK는 Editor/React 엔진에 의존하지 않는다.

## 설정·비밀값·비서 지침

`settingsSchema`는 일반 설정 JSON Schema다. 초기 값은 {}이며 필드별 저장을 위해 최상위 required는 비워 둔다. 필요한 연결 값은 handler나 healthCheck에서 확인한다. 설정은 Host 소유이고 변경은 활성 인스턴스를 drain·dispose한 후 새 값으로 다시 불러온다.

`secrets`는 `{id,title,description?,scope:"connection",required?}` 배열이다. Windows DPAPI 저장은 Host/account/plugin별 namespace로 분리한다. 일반 설정 파일·관리 결과·대화 활동·출력에 평문 값을 노출하지 않는다. 설정 화면의 저장/교체/손상/삭제는 같은 Host 경로를 사용한다. 다른 OS는 미지원 상태를 표시하며 평문 저장으로 우회하지 않는다. plugin context에 해당 plugin의 secret만 전달한다. 공개 출력의 secret 값은 가리고, 비서에 남은 literal secret은 거부한다.

`skills`는 `{id,directory}` 배열이다. artifact 내부 YAML frontmatter의 name/description이 있는 SKILL.md를 읽고 plugin별 namespace로 비서 스킬 디렉터리에 설치한다. 다른 plugin의 스킬과 겹치지 않는다. disable/reload/제거/Host 종료 시 소유한 스킬을 정리한다. 화면 코드 manifest에서도 이 경로를 사용할 수 있다.

## 수명과 공용 작업

등록은 실행하지 않는다. 처음 신뢰할 때 목록의 registrationId를 확인하고 등록 단위를 신뢰한다. 등록 교체·제거 후 재추가에는 다시 확인한다. 설치는 검증·등록·신뢰·활성·reload를 같은 Host 작업으로 수행한다. 비서 관리도 같은 작업을 사용하며 활동에는 metadata만 남긴다.

Node child의 crash·RPC timeout·dispose 실패는 해당 plugin에 한정한다. 새 요청을 차단한 뒤 이미 접수한 호출과 status 관찰을 drain하고 dispose한다. reload는 새 artifact와 설정·secret을 읽는다. 종료는 모든 child를 닫으며 하나의 실패로 다른 child 정리를 건너뛰지 않는다. 화면/daemon/문서의 수명을 섞지 않는다.

일반 호출 RPC는 기존 10초 한계를 유지한다. K1 장기 작업·staging·job history·결과 게시 경로는 삭제했다. 실행 핵심이 선언형 binding과 검수/생성 문서 게시 callback에 결합돼 있어 독립 계약으로 깨끗이 남지 않았기 때문이다. 새 장기 작업 API나 화면 연결은 만들지 않았다.

## 제작과 설치

CLI `plugins scaffold [directory] --id <id> --template greet|screen|chart`, `validate`, `dependencies`, `bundle`, `install`, `list`, `register`, `trust`, `enable`, `disable`, `reload`, `unregister`, `settings`, secret 상태/삭제는 공용 Host 작업이다. 명시적 --host를 사용한다. query/file 제작 템플릿은 없다. 공개 읽기 호출은 `operation invoke <id> --input <json-file> --host <origin> --json`이다.

npm은 앱에 실은 압축 파일에서 필요할 때 준비한다. 의존성 설치는 lifecycle scripts/native build를 실행하지 않는다. esbuild와 공개 SDK를 배포물에 싣고 artifact 밖 Host runtime에서 SDK를 제공한다. 외부 plugin이 checkout/private 모듈을 import하지 못하게 한다. 제작 시 외부 라이브러리를 bundle하고 실행 시 네트워크 설치를 하지 않는다. 레지스트리·프록시는 기존 npm 설정을 사용한다.

## 검증 경계

SDK는 manifest·schema 경계를, Host 단위 검사는 process·drain·crash·timeout·설정·secret·스킬·신뢰·reload·출력 경계를 보호한다. HTTP/Vite는 같은 작업의 transport와 UI를, packaged 외부 SDK helper는 checkout 없는 SDK resolve·설치·npm·bundle·receipt를 검사한다. 화면의 공식 새 문서 저장은 [화면 계약](plugin-screens-v1.md)을 따른다. fixture/localhost 통과를 실제 원격 PC·사내 서비스·실제 계정 수락으로 표현하지 않는다.
