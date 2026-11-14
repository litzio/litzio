# 플러그인 실행·제작 계약

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [AGENTS.md](../../AGENTS.md).
- Last verified: 2026-11-14 — #1634 공개 오류·입력 진단 계약 추가. 검증 범위는 PR 실행 기록 참조.
- Previous verification: 2026-11-13 — #1592 1-2 코드·대상 검사 대조. Node context CLI는 소스·배포 Host의 실행 정보와 그림 포함 create/batch/check 경계를 검사한다. 실제 외부 서비스·원격 PC 수락은 포함하지 않는다.

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

## Node 처리 코드의 공식 CLI

`PluginContext.cli?: Readonly<{bin:string;args:readonly string[]}>`는 이 Host와 같은 배포물/소스 버전의 공식 CLI 실행 정보다. `bin`을 실행 파일로 쓰고 고정 `args` 뒤에 명령 인자를 붙여 Node child_process의 execFile/spawn으로 실행한다. shell·PATH 검색이나 설치 경로 추측은 필요 없다. 플러그인 child의 환경을 상속한다(Desktop의 Electron Node 모드 포함). 실행 파일·CLI entry가 없거나 Host 구성을 식별할 수 없으면 cli는 없다. 이때 플러그인은 status에 원인을 알리고 필요한 작업을 unavailable로 실패시킨다. 다른 설치나 사용자 설정으로 조용히 fallback하지 않는다.

소스 Host는 현재 checkout의 CLI와 tsx loader, 패키징된 Desktop daemon과 독립 HTTP Host는 자기 CLI 배포물의 entry를 사용한다. 비서의 CLI shim도 같은 Host resolver를 사용한다. 이 값은 Host 주소·인증·문서 API가 아니며 `--host`를 자동 추가하지 않는다. `create`, `check`, `apply-batch`의 파일 경로는 이 PC에서 해석된다. SDK/Core나 Host에 명령별 wrapper·문서 의미를 새로 구현하지 않는다. CLI 파일 쓰기는 미저장 Editor 상태를 알지 못하므로 저장된 파일에만 사용한다.

아래 예는 필요한 플러그인의 처리 코드에만 넣는다. scaffold 기본 골격에는 추가하지 않는다. 입력 folder는 존재하는 출력 폴더, imagePath는 실제 PNG 파일이다. CLI에 줄 JSON은 artifact 밖 임시 폴더에 두고 완료·실패 모두 정리한다. 예는 짧은 작업이며 긴 처리는 기존 plugin 소유 작업·진행 조회 방식으로 나눈다.

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginOperationError } from "@litzio/plugin-sdk";
const exec = promisify(execFile);
export function activate(context) {
  return {
    status: () => ({ available: !!context.cli,
      message: context.cli ? "Ready" : "This Host has no official CLI launcher" }),
    operations: { build: async ({ folder, imagePath }) => {
      const cli = context.cli;
      if (!cli) throw new PluginOperationError("unavailable");
      const temporary = await mkdtemp(path.join(os.tmpdir(), "plugin-authoring-"));
      try {
        const input = path.join(temporary, "authoring.json");
        const operations = path.join(temporary, "operations.json");
        const target = path.join(folder, "report.md");
        await writeFile(input, JSON.stringify({
          authoring: { inputs: [{ key: "result", blocks: [
            { kind: "paragraph", text: "Before" },
            { kind: "figure", imageAsset: "picture", imageAlt: "Result", caption: "Result" }
          ] }] },
          images: [{ key: "picture", mime: "image/png",
            base64: (await readFile(imagePath)).toString("base64") }]
        }));
        const created = await exec(cli.bin, [...cli.args, "create", target,
          "--input", input, "--format", "json"], { windowsHide: true });
        // One operation; existing CLI/Core batch semantics and write checks apply.
        await writeFile(operations, JSON.stringify([
          { command: "replace-text", from: "Before", to: "After" }
        ]));
        await exec(cli.bin, [...cli.args, "apply-batch", target, "--operations", operations],
          { windowsHide: true });
        const checked = await exec(cli.bin, [...cli.args, "check", target,
          "--format", "json"], { windowsHide: true });
        return { created: JSON.parse(created.stdout), checked: JSON.parse(checked.stdout) };
      } finally { await rm(temporary, { recursive: true, force: true }); }
    } },
    dispose() {}
  };
}
```

기존 이름은 create가 거부한다. subprocess 오류 뒤 쓰기를 자동 재실행하지 않는다. create의 receipt는 batch 전 revision이므로 이후 수정의 최신 상태는 check 결과와 저장 파일로 확인한다. raw stderr에는 파일 내용·경로가 포함될 수 있으므로 사용자에게 필요한 원인만 표시하고 secret을 공개 작업 결과로 반환하지 않는다.

## 설정·비밀값·비서 지침

`settingsSchema`는 일반 설정 JSON Schema다. 초기 값은 {}이며 필드별 저장을 위해 최상위 required는 비워 둔다. 필요한 연결 값은 handler나 healthCheck에서 확인한다. 설정은 Host 소유이고 변경은 활성 인스턴스를 drain·dispose한 후 새 값으로 다시 불러온다.

`secrets`는 `{id,title,description?,scope:"connection",required?}` 배열이다. Windows DPAPI 저장은 Host/account/plugin별 namespace로 분리한다. 일반 설정 파일·관리 결과·대화 활동·출력에 평문 값을 노출하지 않는다. 설정 화면의 저장/교체/손상/삭제는 같은 Host 경로를 사용한다. 다른 OS는 미지원 상태를 표시하며 평문 저장으로 우회하지 않는다. plugin context에 해당 plugin의 secret만 전달한다. 공개 출력의 secret 값은 가리고, 비서에 남은 literal secret은 거부한다.

`skills`는 `{id,directory}` 배열이다. artifact 내부 YAML frontmatter의 name/description이 있는 SKILL.md를 읽고 plugin별 namespace로 비서 스킬 디렉터리에 설치한다. 다른 plugin의 스킬과 겹치지 않는다. disable/reload/제거/Host 종료 시 소유한 스킬을 정리한다. 화면 코드 manifest에서도 이 경로를 사용할 수 있다. SKILL.md는 UTF-8(BOM 허용), LF·CRLF·혼합 줄바꿈을 받는다. 시작의 `---` 줄 사이에는 YAML mapping과 비어 있지 않은 문자열 `name`, `description`이 필요하다. 따옴표는 선택이고 본문 최소 길이는 없다. 원본 name은 표시용이며 manifest skills.id나 디렉터리 마지막 이름과 같을 필요가 없다. skills.id는 소문자 영문자로 시작하는 소문자 영숫자·단일 하이픈 연결 형식이다. 설치 name은 `litzio-plugin-<plugin id의 점을 --로 치환>---<skills.id>`이며 64자 이하여야 한다. 초과하면 plugin id 또는 skills.id를 줄인다. 검증 오류는 artifact 상대 SKILL.md 경로, 실패 필드와 기대 형식을 돌려준다.

## 수명과 공용 작업

등록은 실행하지 않는다. 처음 신뢰할 때 목록의 registrationId를 확인하고 등록 단위를 신뢰한다. 등록 교체·제거 후 재추가에는 다시 확인한다. 설치는 검증·등록·신뢰·활성·reload를 같은 Host 작업으로 수행한다. 비서 관리도 같은 작업을 사용하며 활동에는 metadata만 남긴다.

Node child의 crash·RPC timeout·dispose 실패는 해당 plugin에 한정한다. 새 요청을 차단한 뒤 이미 접수한 호출과 status 관찰을 drain하고 dispose한다. reload는 새 artifact와 설정·secret을 읽는다. 종료는 모든 child를 닫으며 하나의 실패로 다른 child 정리를 건너뛰지 않는다. 화면/daemon/문서의 수명을 섞지 않는다.

일반 호출 RPC는 기존 10초 한계를 유지한다. K1 장기 작업·staging·job history·결과 게시 경로는 삭제했다. 실행 핵심이 선언형 binding과 검수/생성 문서 게시 callback에 결합돼 있어 독립 계약으로 깨끗이 남지 않았기 때문이다. 새 장기 작업 API나 화면 연결은 만들지 않았다.

## 호출자에게 전달하는 실패 (#1634)

처리 코드가 호출자가 고칠 수 있는 잘못을 발견하면 공개 SDK의 명시적 오류를 쓴다. 안정된 code는 영문자로 시작하는 영숫자·밑줄·점·하이픈 1–64자다.

```js
import { PluginPublicError } from "@litzio/plugin-sdk";
throw new PluginPublicError("invalid_group", "Use a group ID from list-groups, not a page number.");
```

message는 무엇이 잘못됐는지, 무엇을 넣어야 하는지, 유효한 값은 어디서 얻는지 설명한다. secret·내부 경로·스택·원본 외부 오류 응답은 넣지 않는다. 제작 안내에 이 예를 제공하며, 정상 인사말 scaffold에 오류 예제를 추가하지 않는다.

child는 invoke에서 이 클래스의 인스턴스만 code/message로 직렬화한다. Host는 code 형식을 확인하고 등록된 해당 plugin의 secret literal을 code에서 발견하면 일반 실패로 되돌린다. message는 기존 secret 마스킹을 먼저 적용한 뒤 Unicode Cc/Cf/Cs/Zl/Zp를 제거하고 앞뒤 공백을 정리한다. 정리 후에도 secret을 가리고 최대 1024 Unicode code point로 자른다. 빈 문구·잘못된 code는 일반 실패로 되돌린다. 인코딩·분할된 secret의 모든 변형을 탐지한다는 보장은 없다. 명시적 공개 오류에도 내부 정보가 없도록 작성자가 책임진다.

HTTP·CLI JSON·비서 도구는 기존 `{errorKind,error,receipt}`를 유지하며 `{code,message}`를 덧붙인다. error에도 같은 안전한 message를 넣는다. 화면 invoke는 Error.message와 code, errorKind, inputIssues, receipt를 제공한다. 문구는 HTML로 해석하지 않고 텍스트로 표시한다. CLI 사람용 실패는 `code: message`를 출력하며 실패 종료 코드 1을 유지한다. 공개 write 실패의 receipt outcome은 여전히 uncertain이므로 자동 재실행하지 않는다.

입력 schema 거부는 handler 실행 전에 `{errorKind:"invalid_input",error,inputIssues:[{path,reason}],receipt}`를 반환한다. receipt는 요청 ID·operation·version·scope와 outcome refused를 담는다. 진단은 처음 8개이며 JSON Pointer 경로와 필수 누락·타입·허용 값·형식 등 이유를 제공한다. 입력 값·Ajv params·schema literal은 반환하지 않는다. 유효한 타입·값·형식은 공개 operation schema에서 확인한다. 동적 객체 키는 `*`로 가리고 경로도 secret 마스킹·문자 정리를 적용한다.

### 변경 전 경로와 유지되는 보호

ADR-0020의 secret 절은 argv·로그·비서 결과·뷰에 PAT를 남기지 않고 외부 API 오류 응답을 Host에서 정리하도록 한다. 변경 전 child catch는 자격 증명 유출을 막기 위해 예외 문구·스택을 버리고 허용된 kind만 IPC로 보냈다. Host publicOperationError가 kind를 고정 문구로 바꿨고 HTTP는 결과를 그대로 전달했다. CLI는 두 모드 모두 JSON, 화면 invoke는 error 문자열만 가진 Error, 비서 도구는 공통 실패 결과를 받았다. 입력 schema 거부는 상세 없이 `Invalid operation input` 예외였고 HTTP 400으로 전달됐다. 비서는 이 예외를 다시 일반 실패로 가렸다.

이제 명시적 공개 오류만 위 예외 경로를 추가한다. 표식 없는 예외와 출력 schema 불일치는 계속 `Plugin operation failed. Check plugin settings and the target.`다. 프로세스 종료도 같은 일반 실패이며 RPC timeout은 `Operation timed out. Check the service connection.`다. write는 기존처럼 `Check the target before retrying a write.` 안내가 붙는다. 기존 PluginOperationError(kind)의 auth/forbidden/not_found/unavailable 등 Host 고정 문구는 유지한다. 비활성·미등록은 `Operation unavailable or plugin disabled`, artifact 변경·미신뢰는 `Artifact changed; reload the plugin`으로 거부하며 전용 비서 도구의 admission 거부는 기존 unavailable/forbidden 안내를 유지한다. timeout·crash·출력 실패의 receipt와 종료 코드는 바꾸지 않는다.

## 제작과 설치

CLI `plugins scaffold [directory] --id <id> --template greet|screen|chart`, `validate`, `dependencies`, `bundle`, `install`, `list`, `register`, `trust`, `enable`, `disable`, `reload`, `unregister`, `settings`, secret 상태/삭제는 공용 Host 작업이다. 명시적 --host를 사용한다. query/file 제작 템플릿은 없다. 공개 작업 호출은 `operation invoke <id> --input <json-file> --host <origin> --json`이다. 승인되고 셸·네트워크 및 CLI guard가 허용하는 비서는 공개 쓰기 작업도 CLI로 실행할 수 있다. 전용 `invoke_plugin_operation` 도구는 assistant:true 읽기·healthCheck만 제공하며 쓰기를 허용하지 않는다. scope:folder 작업은 아직 지원하지 않는다.

loopback(127.* 또는 ::1) HTTP Host는 listen 완료 후 해당 listener의 정규화된 origin을 비서 child의 `LITZIO_HOST_ORIGIN`으로 전달한다. 비서는 이를 `--host`에 명시한다. CLI의 필수 주소 검증·실패 시 재실행 금지는 유지한다. origin이 없는 환경에서는 부모의 값을 상속하지 않으며 주소가 없다고 보고하고 중단한다. 연결 수명은 [비서 계약](main-agent-v1.md)을 따른다.

비서 CLI의 자동 주소 전달은 기존 HTTP 허용 목록을 바꾸지 않는다. non-loopback·wildcard·IPv4-mapped IPv6 bind에는 주소를 전달하지 않는다. 이 개발/검사용 구성에서는 자동 주소를 필요로 하는 비서의 Host 대상 CLI 호출만 주소 없음으로 분명히 실패하며, public-origin이나 다른 loopback 주소를 추측하지 않는다. 수동으로 명시한 CLI --host와 기존 HTTP 허용 판정은 유지한다.

제작 폴더 안의 artifact는 설정된 경로와 scaffold가 반환한 canonical 경로 모두로 validate/install/dependencies/bundle할 수 있다. 경로가 허용된 제작 폴더 아래인지 확인한 뒤 Windows 8.3 이름·부모 alias를 canonical 경로로 해석하고, 고정 root 및 요청 쓰기 범위를 다시 검사한다. alias가 범위 밖을 가리키거나 root가 바뀌면 거부한다. validate/install의 디렉터리 단계 거부는 `file:"artifact directory"`, `path:"directory"`와 접근 범위·존재·권한·root/link 조건을 설명하는 안전한 진단을 반환하며 OS 오류의 절대 경로를 노출하지 않는다.

npm은 앱에 실은 압축 파일에서 필요할 때 준비한다. 의존성 설치는 lifecycle scripts/native build를 실행하지 않는다. esbuild와 공개 SDK를 배포물에 싣고 artifact 밖 Host runtime에서 SDK를 제공한다. 외부 plugin이 checkout/private 모듈을 import하지 못하게 한다. 제작 시 외부 라이브러리를 bundle하고 실행 시 네트워크 설치를 하지 않는다. 레지스트리·프록시는 기존 npm 설정을 사용한다.

## 검증 경계

SDK는 manifest·schema 경계를, Host 단위 검사는 process·drain·crash·timeout·설정·secret·스킬·신뢰·reload·출력 경계를 보호한다. HTTP/Vite는 같은 작업의 transport와 UI를, packaged 외부 SDK helper는 checkout 없는 SDK resolve·설치·npm·bundle·receipt를 검사한다. 화면의 공식 새 문서 저장은 [화면 계약](plugin-screens-v1.md)을 따른다. fixture/localhost 통과를 실제 원격 PC·사내 서비스·실제 계정 수락으로 표현하지 않는다.

긴 처리는 plugin process에서 접수 후 진행하며 화면은 짧은 호출로 상태를 조회할 수 있다. 비서·CLI도 같은 상태를 알아야 하면 assistant:true 공개 읽기 operation으로 진행/결과를 선언한다. status()의 {available,message}와 작업 기록은 별개다. 10초 한계를 늘리는 변경이나 공용 K1 job store를 추가하지 않았다. 실제 제작의 초기 단일 호출 timeout과 후속 접수/조회 시험은 [3단계 기록](../reviews/plugin-screen-code-1592.md#3단계-협의-절차와-제작-시험)을 따른다.

제작 안내는 상태 조회의 `{id,state,message,result?}` 관례를 제공한다. state는 queued/running/succeeded/failed/cancelled/not_found이며 not_found는 조회 기록이 없다는 뜻으로, 쓰기가 없었다는 증거가 아니다. 업무 id는 화면 invoke가 반환하는 result 안에 넣는다. 상태·취소·재시작 복구는 플러그인 소유이며 공용 상태 파일 형식이나 job 엔진을 만들지 않는다. 기존 문서의 지원 의미 부분 편집은 inspect → revision 조건의 한 작업짜리 apply-batch JSON → 다시 inspect로 결과 revision을 확인한다. 제한 권한의 쓰기 CLI guard는 그대로 적용한다.
