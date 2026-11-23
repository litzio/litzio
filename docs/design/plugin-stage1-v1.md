# 플러그인 실행·제작 계약

- Status: Implemented
- Authority: [ADR-0022](../adr/0022-plugin-screen-code.md), [AGENTS.md](../../AGENTS.md).
- Last verified: 2026-11-16 — 현재 계약·코드와 삭제된 기능의 잔재를 정적으로 대조했다. 제품·브라우저·Desktop·AI 실행 재검증 없음.

## 현재 범위

플러그인은 대상 Host의 Node 하위 프로세스에서 실행되고 자기 React 화면 코드를 제공한다. 설치·신뢰·활성·설정·비밀값·비서 스킬·공용 작업·receipt·reload·앱에 실은 npm과 번들러를 유지한다. Core의 문서 의미와 공식 write path는 플러그인이 재구현하지 않는다.

SDK 0.10.0은 Core의 `updateDocumentStatus`, `DocumentStatus`, `DOCUMENT_STATUSES`와 선택 `DocumentAuthoringInput.status`를 제공한다. 상태 의미와 검증은 [native 문서 계약](document-support-v1.md#문서-검토-상태)을 따른다. SDK 0.11.0은 화면 부품 `ui.ItemList`와 그 타입을 더한다([화면 계약](plugin-screens-v1.md#공용-정보-부품)). SDK 0.12.0은 `ui.ScreenLayout`의 `back`과 그 타입 `ScreenLayoutBack`을 더한다([화면 계약](plugin-screens-v1.md#머리-구역과-작업-흐름)).

## 신분증

최소 artifact는 `litzio-plugin.json`, `host.mjs`, `screen.jsx`다.

```json
{"id":"local.example","name":"Example","version":"0.1.0","icon":"ChartColumn","entry":"host.mjs","screen":"screen.jsx"}
```

`version`은 공백만으로 이루어지지 않은 한 줄 문자열이며 SDK가 검증한다. 버전 형식과 순서는 작성자가 정한다. 기존 artifact는 필드를 생략할 수 있으며 설정 목록에 ‘버전 없음’, `plugins list`에 `version: null`로 표시한다. scaffold의 기본값은 `0.1.0`이다.

선택 `repository`는 공개 GitHub 주소다. 저장소 주소(`https://github.com/<owner>/<repo>`)나 하위 폴더 주소(`https://github.com/<owner>/<repo>/tree/<ref>/<폴더>`)만 받으며 SDK가 형식을 검증한다. 로컬 폴더로 설치한 플러그인도 이 칸이 있으면 업데이트 확인·적용은 GitHub 기준이다([GitHub 출처](#github-출처)).

선택 선언에는 `description`, `operations`, `settingsSchema`, `secrets`, `skills`, `healthCheck`도 있다. 공개 작업은 id·version·effect(read/write)·scope·assistant·inputSchema·outputSchema를 선언한다. 생략 기본값은 version 1, read, host, assistant false, 빈 schema다. 화면 전용 handler는 공개 작업 선언 없이 자기 화면의 invoke로 호출한다. 비서는 assistant:true 읽기와 healthCheck만 호출한다. 외부 CLI의 공개 invoke와 같은 입력·출력 검증 및 receipt를 사용한다.

아이콘은 제공된 이름 또는 artifact 내부 SVG/PNG다(확장자 대소문자 무관, 최대 64 KiB·가로/세로 1–256px). WebP 등 다른 형식은 거부한다. SDK의 공통 형식 정의를 manifest 검증과 Host 로더가 함께 사용한다. host/screen/icon의 절대 경로·URL·상위 탈출을 거부하며 파일은 artifact 안에서 해석한다. 화면 소스와 SDK handler 검증은 설치 시 실행 전에 수행한다. 스키마의 외부 참조·중복 작업/secret/skill ID를 거부한다. SDK는 Editor/React 엔진에 의존하지 않는다.

## Node 처리 코드의 공식 CLI

`PluginContext.cli?: Readonly<{bin:string;args:readonly string[]}>`는 이 Host와 같은 배포물/소스 버전의 공식 CLI 실행 정보다. `bin`을 실행 파일로 쓰고 고정 `args` 뒤에 명령 인자를 붙여 Node child_process의 execFile/spawn으로 실행한다. shell·PATH 검색이나 설치 경로 추측은 필요 없다. 플러그인 child의 환경을 상속한다(Desktop의 Electron Node 모드 포함). 실행 파일·CLI entry가 없거나 Host 구성을 식별할 수 없으면 cli는 없다. 이때 플러그인은 status에 원인을 알리고 필요한 작업을 unavailable로 실패시킨다. 다른 설치나 사용자 설정으로 조용히 fallback하지 않는다.

소스 Host는 현재 checkout의 CLI와 tsx loader, 패키징된 Desktop daemon과 독립 HTTP Host는 자기 CLI 배포물의 entry를 사용한다. 비서의 CLI shim도 같은 Host resolver를 사용한다. 이 값은 Host 주소·인증·문서 API가 아니며 `--host`를 자동 추가하지 않는다. `create`, `check`, `apply-batch`의 파일 경로는 이 PC에서 해석된다. SDK/Core나 Host에 명령별 wrapper·문서 의미를 새로 구현하지 않는다. CLI 파일 쓰기는 미저장 Editor 상태를 알지 못하므로 저장된 파일에만 사용한다.

SDK 0.6.0의 Node 전용 진입점 `@litzio/plugin-sdk/node`는 `readDocument(path): {revision, document}`와 `writeDocument(path, document, expectedRevision): {revision}`을 제공한다. 같은 프로세스에서 Core 연산과 CLI 단일 명령·apply-batch와 같은 Core 정규 직렬화·유효성 검사, file-commit의 revision 검사·임시 형제 파일·교체를 쓴다. revision 충돌은 `FileChangedError`로 거부하고 파일을 바꾸지 않는다. revision은 Host·문서 보기·CLI와 같은 `textRevision`이다. SDK 루트의 `machineNodes(getEditableDocument(document))`는 CLI inspect JSON의 경로·종류 투영과 같은 구현이다. 루트는 `mergeParagraphWithPrevious`, `splitParagraph`, `updateHeadingLevel`을 재수출하며 블록 넣기는 기존 `insertParagraph` 등을 쓴다.

이 함수도 미저장 Editor 상태를 알지 못하므로 저장된 파일에만 사용한다. 열린 폴더 제한·Host HTTP API·새 RPC는 없으며 CLI처럼 이 PC의 파일 경로를 해석한다. 화면 코드는 Node 진입점을 import할 수 없고 화면 소스/번들 검증에서 거부한다.

```js
import { mergeParagraphWithPrevious } from "@litzio/plugin-sdk";
import { readDocument, writeDocument } from "@litzio/plugin-sdk/node";
export function activate() {
  return {
    status: () => ({ available: true, message: "Ready" }),
    operations: { merge: ({ path, blockPath, revision }) => {
      const snapshot = readDocument(path);
      // The caller's revision guards its snapshot-local blockPath.
      if (snapshot.revision !== revision) throw new Error("Read the document again");
      return writeDocument(path,
        mergeParagraphWithPrevious(snapshot.document, blockPath), revision);
    } },
    dispose() {}
  };
}
```

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

설정 대화상자의 boolean은 본체의 SettingsSwitch 행으로 이름을 왼쪽, 스위치를 오른쪽 끝에 놓는다. 이름표가 붙은 입력은 공용 form-field 간격을 쓴다. secret 이름은 입력의 이름표이며 설정 여부는 별도의 보조 색 상태다. 필드의 저장 오류·저장 상태와 secret의 설정 상태·저장 오류는 그 필드 Row의 이름 아래에 두고 aria-describedby로 해당 입력의 접근 가능한 설명에 연결한다. 저장된 secret 삭제는 빨간 테두리 버튼과 DangerConfirmation(취소 초기 focus, 닫으면 삭제 버튼으로 복귀)을 거친다. 기준 캡처(1440px 밝음): [필드 오류](assets/plugin-settings-rows-1788/after-field-error-1440-light-en.png)·[secret 상태](assets/plugin-settings-rows-1788/after-secret-1440-light-en.png)·[삭제 확인](assets/plugin-settings-rows-1788/after-secret-confirm-1440-light-en.png). 설명은 Tooltip으로 제공한다. 일반 설정은 필드별 자동 저장, secret은 명시적 저장과 즉시 입력 비움을 유지한다. 일반 설정·secret·연결 확인·제거 순서로 배치한다.

`settingsSchema`는 일반 설정 JSON Schema다. 초기 값은 {}이며 필드별 저장을 위해 최상위 required는 비워 둔다. 필요한 연결 값은 handler나 healthCheck에서 확인한다. 설정은 Host 소유이고 변경은 활성 인스턴스를 drain·dispose한 후 새 값으로 다시 불러온다.

`secrets`는 `{id,title,description?,scope:"connection",required?}` 배열이다. Windows DPAPI 저장은 Host/account/plugin별 namespace로 분리한다. 일반 설정 파일·관리 결과·대화 활동·출력에 평문 값을 노출하지 않는다. 설정 화면의 저장/교체/손상/삭제는 같은 Host 경로를 사용한다. 다른 OS는 미지원 상태를 표시하며 평문 저장으로 우회하지 않는다. plugin context에 해당 plugin의 secret만 전달한다. 공개 출력의 secret 값은 가리고, 비서에 남은 literal secret은 거부한다.

`skills`는 `{id,directory}` 배열이다. artifact 내부 YAML frontmatter의 name/description이 있는 SKILL.md를 읽고 plugin별 namespace로 비서 스킬 디렉터리에 설치한다. 다른 plugin의 스킬과 겹치지 않는다. disable/reload/제거/Host 종료 시 소유한 스킬을 정리한다. 화면 코드 manifest에서도 이 경로를 사용할 수 있다. SKILL.md는 UTF-8(BOM 허용), LF·CRLF·혼합 줄바꿈을 받는다. 시작의 `---` 줄 사이에는 YAML mapping과 비어 있지 않은 문자열 `name`, `description`이 필요하다. 따옴표는 선택이고 본문 최소 길이는 없다. 원본 name은 표시용이며 manifest skills.id나 디렉터리 마지막 이름과 같을 필요가 없다. skills.id는 소문자 영문자로 시작하는 소문자 영숫자·단일 하이픈 연결 형식이다. 설치 name은 `litzio-plugin-<plugin id의 점을 --로 치환>---<skills.id>`이며 64자 이하여야 한다. 초과하면 plugin id 또는 skills.id를 줄인다. 검증 오류는 artifact 상대 SKILL.md 경로, 실패 필드와 기대 형식을 돌려준다.

## 수명과 공용 작업

설정의 [플러그인 추가…]와 `plugins register <폴더>`는 Host 전용 복사본을 검증하고 비활성 상태로 등록한다. 처음 켤 때 목록의 registrationId를 확인하고 등록 단위를 신뢰한다. 등록 교체·제거 후 재추가에는 다시 확인한다. `plugins install <폴더 또는 제작 ID>`는 복사본의 검증·등록·신뢰·활성을 하나의 Host 작업으로 수행한다. 비서 관리도 같은 작업을 사용하며 활동에는 metadata만 남긴다.

로컬 등록·설치·다시 읽기·업데이트는 원본의 `litzio-plugin.json`을 먼저 검증한다. 설명서가 없거나 유효하지 않으면 복사 전에 거절하고, 복사에 성공한 뒤에는 복사본의 설명서를 다시 검증한다. 설정의 추가 대화상자는 등록 중에 단추를 비활성화하고 진행 상태를 표시한다. 설명서가 없으면 대화상자 안에 오류를 표시하고 다른 폴더를 고를 수 있게 한다. [1440px 밝음](assets/plugin-register-precheck-1913/after-1440-light.png) · [어두움](assets/plugin-register-precheck-1913/after-1440-dark.png).

Host는 원본 폴더의 실제 경로, 설치 식별자, 번들 전 출처 digest(`.git`·`node_modules` 제외; 의존성 변화는 `package.json`·lockfile로 드러난다)와 번들 후 실행본 digest를 등록 기록에 둔다. 원본 복사는 비동기 파일 작업이다. 실행·화면·아이콘·스킬은 설치본을 사용한다. 원본을 수정하거나 삭제해도 기존 판을 사용한다. 설치본은 Host 전용 경로이며 리치오 작업은 그곳에 쓰지 않는다. 폴더를 받는 제작·관리 작업(`install`·`register`·`validate`·`bundle`·`dependencies`·`scaffold`)은 실제 경로 기준으로 설치본 저장소 안쪽을 대상으로 받으면 거부한다. 리치오가 정하는 쓰기 위치(화면 번들 입력·출력, 의존성 폴더·lockfile, npm 캐시·로그)도 설치본 밖인지 Host가 쓰기 전에 확인한다. 대상 폴더의 도구 설정이 그 밖의 쓰기 위치를 바꾸는 것은 대상 폴더 작성자 책임이며, 그렇게 바뀐 설치본은 다음 불러오기의 실행본 digest 확인에서 거부된다. 실행본 digest(`node_modules` 포함)는 Host가 설치본을 불러올 때(Host 시작, 켜기, 설치·다시 읽기·업데이트 적용, 꺼진 등록을 처음 표시할 때) 비동기 파일 작업으로 확인하고, 공개 작업 호출·`list`·아이콘 등은 그 결과를 쓴다. 아이콘은 불러올 때 확인한 바이트를 제공한다. 불러올 때 등록 값과 다르면 다시 읽기를 요구한다. 이때 `list`는 등록 기록의 식별자·신뢰·켜짐 상태와 출처 요약(`source`)을 반환하며 `artifactChanged: true`로 표시한다. 설치본 manifest에서 이름·버전을 가져오지 않는다. 활성화가 digest 불일치로 거절되면 HTTP 오류에도 `artifactChanged: true`를 담는다. 리치오 밖에서 설치본 파일을 직접 고치는 것은 지원 범위 밖이다. 고친 내용은 다음 불러오기 때 감지되어 다시 읽기를 요구하고, 그 전에는 실행 중 프로세스가 지연 로딩하는 모듈이 바뀐 파일을 읽을 수 있다. 로컬 파일 쓰기 권한이 있는 쪽은 리치오 자체도 고칠 수 있으므로 이 단계의 보호 대상이 아니다. 설정과 비밀값 변경은 설치본으로 인스턴스를 다시 시작한다.

`plugins reload <id>`는 등록된 로컬 출처를 다시 복사하고, GitHub 전용 등록은 기록한 커밋을 다시 받는다. 설정 목록에서 설치본이 바뀐 행의 [다시 설치]도 이 작업을 요청한다. 후보의 검증·기동·status 확인·스킬 준비가 끝나고 등록이 아직 같을 때 전환한다. 준비나 등록 저장에 실패하면 오류를 보고하고 기존 판의 등록·작업·화면·스킬을 유지한다. 성공하면 등록·신뢰·설정·비밀값을 보존하고 새 호출을 새 판에 연결한다. 이전 판이 받은 호출과 status 관찰은 drain한 뒤 dispose하고 이전 복사본을 정리한다.

`plugins check-updates [id]`는 전체 또는 한 등록의 출처를 읽어 등록별 `{id, currentVersion, sourceVersion, available, track?, error?}`를 돌려준다. 출처는 등록이 GitHub 출처를 가지면 GitHub, 아니면 로컬 원본 폴더다. 로컬 출처는 설치 때와 같은 규칙으로 계산한 원본 출처 digest가 등록의 출처 digest와 다르면 `available`이다. GitHub 출처는 추적 대상에서 그 플러그인 폴더의 Git tree SHA가 등록 값과 다르면 `available`이고 `track`에 실제 추적 방식을 담는다([GitHub 출처](#github-출처)). 버전 순서는 비교하지 않으며, 버전이 같아도 내용이 다르면 새 내용이다. 출처를 읽을 수 없으면(원본 폴더 없음, GitHub 주소·폴더 없음, 요청 한도, 출처 변경) 그 등록의 `error`로 알리고 설치본은 그대로 동작한다. 구형 등록은 원본 폴더에서 다시 추가하라는 `error`다. 확인 오류가 하나라도 있으면 receipt는 failure다. 마지막 확인 결과는 Host 메모리에만 두며 `list`의 `update`로 보인다. 그 설치본이 바뀌거나 Host가 다시 시작하면 사라진다. 확인은 출처를 매번 다시 읽고, 등록 파일에는 적용한 출처 digest와 GitHub의 적용 커밋·tree SHA만 남긴다. 설정 목록 머리의 [업데이트 확인]은 전체를, 각 행 ⚙ 설정 대화 상자의 [업데이트 확인]은 그 등록만 확인한다. 목록 머리의 [최신], 행 상태, 대화 상자의 최신·새 버전·확인 오류와 [업데이트]는 모두 같은 마지막 확인 결과(`update`)에서 계산하므로 어느 쪽에서 확인해도 서로 맞다.

`plugins update <id>`는 `reload`와 같은 적용 경로로 출처를 다시 적용한다. 로컬 출처는 원본 폴더를 다시 복사하고, GitHub 출처는 아래 절차로 받는다. 등록 ID·신뢰·켜짐 상태·설정·비밀값을 유지한다. 꺼진 플러그인은 검증한 새 판으로 바꾸되 꺼진 채로 둔다. 켜짐 여부와 관계없이 저장된 설정이 새 판의 settingsSchema에 맞지 않으면 실패하고 기존 판과 등록을 유지한다. 신뢰하지 않은 등록은 새 registrationId를 받아 다음 신뢰 확인이 새 판을 대상으로 한다. 실패하면 기존 판과 확인 결과를 유지한다. 관리 작업은 순서대로 처리하므로 동시에 들어온 확인과 업데이트도 한 순서로 관찰된다.

### GitHub 출처

설정의 [GitHub에서 추가…]와 `plugins register <github 주소> [--track release|branch]`는 폴더 등록과 같이 비활성으로 등록하고, `plugins install <github 주소> [--track …]`은 등록·신뢰·활성을 한 작업으로 한다. 공개 저장소를 지원한다. 저장소·참조·폴더를 찾을 수 없으면 출처 오류를 낸다. `plugins source-plugins <github 주소>`는 폴더별 `{path, source, id, name, version, release, branch}`를 돌려준다. `release`·`branch`는 그 추적으로 설치할 수 있는지다. `/tree/<ref>/<폴더>` 주소가 플러그인 폴더면 설치와 같이 Release 태그와 브랜치의 tree를 각각 직접 확인하고 manifest를 검증한다(목록이 잘려도, Release에만 남은 폴더도 답한다). manifest가 깨졌으면 그 이유를 오류로 돌려준다. 저장소 주소와 상위 폴더 주소는 루트에 manifest가 있어도 주소의 브랜치 또는 기본 브랜치에서 `litzio-plugin.json`이 있는 폴더(루트 포함, `node_modules` 제외)를 최대 50개 찾는다. `source`는 ref·폴더의 각 구성 요소를 인코딩한 주소라 그대로 등록·설치에 쓸 수 있다. 설정 화면은 목록에서 고르게 하며, 주소를 고치면 이전 결과와 선택을 비운다.

폴더는 한 경로로 정한다. 주소가 플러그인 폴더면 저장소 목록 없이 선택한 추적 대상(Release 태그 또는 브랜치)의 tree에서 그 폴더의 `litzio-plugin.json`을 직접 확인한다. 그래서 최신 Release에만 남은 폴더도 `release`로 설치되고, 큰 저장소에서도 폴더 주소는 동작한다. 주소가 저장소·상위 폴더일 때만 주소의 브랜치(없으면 기본 브랜치) 재귀 목록에서 그 아래 플러그인 폴더를 찾는다. 하나면 그것을 쓰고, 여럿이면 설치는 failure와 `plugins[].source` 목록을 돌려준다. GitHub가 재귀 목록을 잘라 보내거나(`truncated`) manifest가 50개를 넘으면 유일한 폴더를 판단할 수 없으므로 정확한 폴더 주소를 쓰라는 오류다.

추적 방식은 등록마다 `release`(GitHub 최신 정식 Release; 초안·프리릴리스·태그만 있는 것은 세지 않는다) 또는 `branch`(주소의 ref, 없으면 기본 브랜치 HEAD)다. 지정하지 않으면 그 플러그인 폴더를 담은 정식 Release가 있을 때 `release`, 없으면 `branch`다. `/tree/<ref>/<폴더>`의 ref와 폴더 경계는 GitHub에 ref로 존재하는 가장 짧은 앞부분으로 정한다.

새 버전은 추적 대상 커밋에서 **그 플러그인 폴더의 Git tree SHA**가 등록의 값과 다를 때만이다. 같은 저장소의 다른 플러그인 폴더 변경이나 Release는 새 버전이 아니다. 원격 manifest의 `version`은 `sourceVersion`으로 보이며 순서는 비교하지 않는다. 확인 결과는 로컬과 같은 모양에 실제 추적 방식 `track`을 더한다.

적용은 대상 커밋의 tarball을 받아 그 폴더만 등록 파일 옆 Host 전용 staging에 풀고(링크 항목은 거부), staging의 설명서를 검증한다. 검증을 통과하면 의존성을 준비한 뒤 로컬 폴더와 같은 복사·검증·전환 경로를 쓴다. 폴더에 `node_modules`가 있으면 npm을 건너뛴다. `package.json`에 의존성이 있고 `package-lock.json`(또는 `npm-shrinkwrap.json`)이 있으면 앱에 실은 npm으로 `npm ci --ignore-scripts --omit=optional`을 실행한다. 의존성이 있는데 lockfile이 없으면 거부한다. 레지스트리 접속 실패는 npm 오류 코드와 함께 알린다. staging은 성공·실패 모두 지운다. 받기·npm·검증·기동이 실패하면 기존 판이 계속 작업을 받는다. 같은 등록의 업데이트는 등록에 저장한 같은 저장소·폴더에서만 받으므로 신뢰를 다시 묻지 않고 설정·비밀값·켜짐 상태를 유지한다. 되돌리기는 없다. `reload`는 등록에 기록한 커밋을 다시 받아 같은 내용을 다시 적용한다.

설치 때 해석한 저장소(owner/repo)·주소의 ref·폴더·추적 방식을 등록에 고정하고, 확인·업데이트는 주소를 다시 해석하지 않고 이 고정값을 쓴다. 등록 기록은 이 값과 원래 주소, 적용한 커밋·tree SHA를 둔다. `plugins list`는 출처를 `source: {kind:"local"}` 또는 `{kind:"github", url, path?, track?, local}`로 보이며 로컬 경로는 내보내지 않는다. 설정 목록은 버전 옆에 `로컬 폴더` 또는 `GitHub <owner>/<repo>/<폴더> · 릴리스|브랜치`를 보인다.

manifest에 `repository`가 있는 로컬 설치는 원본 폴더와 GitHub 주소(owner/repo)를 함께 기록한다. 주소가 플러그인 폴더면 그 폴더를, 저장소·상위 폴더면 그 아래에서 플러그인 ID가 같은 폴더가 정확히 하나일 때 그것을 쓴다. 없거나 여럿이면 정확한 폴더 주소를 쓰라는 확인·업데이트 오류다. 처음 GitHub 업데이트를 적용할 때 ref·폴더·추적 방식을 고정한다. 그 뒤 로컬 다시 읽기로 manifest의 `repository`가 고정한 출처와 다른 곳(owner/repo는 대소문자 무시, ref·폴더는 그대로 비교)을 가리키면 설치본은 계속 동작하지만, 확인은 출처가 바뀌었으니 다시 추가해 신뢰를 확인하라는 `error`를 보이고 업데이트는 거부한다. manifest에서 `repository`를 지워 다시 읽어도 로컬 내용은 그대로 동작하고, 고정한 원격 출처 기록은 등록을 다시 추가할 때까지 남는다. 그 뒤 다른 출처가 나타나면 같은 규칙으로 거부한다. 다시 추가하면 새 등록으로 신뢰를 다시 묻는다. 확인과 [업데이트]는 GitHub 기준이고, 업데이트 뒤에도 원본 폴더 기록은 남아 `reload`는 원본 폴더를 다시 복사한다. 적용한 GitHub tree SHA는 설치본의 출처 digest가 그 GitHub 내용과 같을 때만 유지한다. 로컬 내용으로 다시 읽어 출처 digest가 달라지면 tree SHA를 지워, 다음 확인은 GitHub 내용을 새 내용으로 보인다. 추적 방식을 정하지 않은 로컬 설치는 확인마다 기본 규칙으로 정하고 처음 GitHub 업데이트를 적용할 때 기록한다. 이렇게 한 이유는 로컬 폴더의 Git tree SHA를 줄바꿈 변환·미추적 파일과 무관하게 계산할 수 없어서, 확인할 수 없는 일치를 가정하지 않고 설치본 내용이 GitHub에서 받은 것과 같다는 사실(출처 digest)만 근거로 쓰기 위해서다.

Host는 GitHub 요청이 필요한 작업마다 `GH_TOKEN`, `GITHUB_TOKEN`, `gh auth token --hostname github.com` 순서로 기존 인증 정보를 한 번 확인한다. GitHub CLI가 없거나 시간 제한 안에 토큰을 얻지 못하면 비로그인으로 요청한다. 토큰은 작업 수명 동안 Host의 `https://api.github.com` 요청에만 쓰며, tarball의 `codeload.github.com` 이동을 포함해 다른 origin으로 전달하지 않는다. Host는 토큰을 저장하지 않으며 로그·오류·공개 작업 결과·receipt·화면·비서 도구 결과에도 내보내지 않는다. 플러그인과 의존성 설치 프로세스는 `GH_TOKEN`과 `GITHUB_TOKEN`을 상속하지 않는다. 토큰을 사용한 요청이 401이면 인증 정보를 확인하라는 오류를 돌려준다.

요청 한도 오류는 GitHub가 제공한 `X-RateLimit-Reset` 또는 `Retry-After`를 Host의 로컬 시각으로 알려 준다. 비로그인 요청에는 GitHub CLI 로그인 또는 `GH_TOKEN`으로 한도를 늘릴 수 있다는 안내를 더한다. 설정 화면에서는 이 안내를 hover와 키보드 focus로 볼 수 있다.

시험·격리 Host는 `LITZIO_GITHUB_API_URL`로 GitHub API 주소를 바꿀 수 있다. 기본 GitHub API origin 이외에는 PC의 인증 정보를 사용하지 않는다.

Node child의 crash·RPC timeout·dispose 실패는 해당 plugin에 한정한다. 비활성화는 새 요청을 차단한 뒤 이미 접수한 호출과 status 관찰을 drain하고 dispose한다. 종료는 모든 child를 닫으며 하나의 실패로 다른 child 정리를 건너뛰지 않는다. 실패한 후보와 제거한 등록의 복사본은 정리한다. Host는 시작 시 정상적으로 읽고 형식을 검증한 등록 파일을 기준으로 전용 저장소의 미등록 복사본을 정리한다. 등록이 가리키는 설치본과 원본은 실제 경로로 비교하며, 그 경로와 상위·하위 경로를 보존한다. 등록 파일이 없으면 시작 시 복사본을 보존한다. 등록 파일을 읽을 수 없거나 형식이 잘못되면 등록 파일 복원을 안내하고 시작을 중단한다. 사용자 출처 폴더는 유지한다. 화면/daemon/문서의 수명을 섞지 않는다.

Host 설치본이 없는 구형 등록은 꺼진 상태와 원본 폴더에서 다시 추가하라는 오류로 표시한다. 이전에 앱에 포함됐던 플러그인의 등록도 같은 방식으로 표시하며, Host 시작 시 등록 파일을 다시 쓰지 않는다. 원본 폴더를 다시 추가하고 처음 켤 때 새 등록의 신뢰를 확인한다.

일반 호출 RPC는 10초 한계다. 장기 작업 상태·진행 조회는 플러그인이 소유한다.

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

이제 명시적 공개 오류만 위 예외 경로를 추가한다. 표식 없는 예외와 출력 schema 불일치는 계속 `Plugin operation failed. Check plugin settings and the target.`다. 프로세스 종료도 같은 일반 실패이며 RPC timeout은 `Operation timed out. Check the service connection.`다. write는 기존처럼 `Check the target before retrying a write.` 안내가 붙는다. 기존 PluginOperationError(kind)의 auth/forbidden/not_found/unavailable 등 Host 고정 문구는 유지한다. 비활성·미등록은 `Operation unavailable or plugin disabled`, 불러올 때 확인한 artifact 변경·미신뢰는 `Artifact changed; reload the plugin`으로 거부하며 전용 비서 도구의 admission 거부는 기존 unavailable/forbidden 안내를 유지한다. timeout·crash·출력 실패의 receipt와 종료 코드는 바꾸지 않는다. 비서의 최종 publication adapter는 기존대로 failed를 unavailable, refused outcome을 failure로 정규화하고 code/message/inputIssues는 보존한다.

## 제작과 설치

CLI `plugins scaffold [directory] --id <id> --template greet|screen|chart`, `validate`, `dependencies`, `bundle`, `install`, `list`, `register`, `source-plugins`, `trust`, `enable`, `disable`, `reload`, `check-updates`, `update`, `unregister`, `settings`, secret 상태/삭제는 공용 Host 작업이다. 명시적 --host를 사용한다. query/file 제작 템플릿은 없다. 공개 작업 호출은 `operation invoke <id> --input <json-file> --host <origin> --json`이다. 승인되고 셸·네트워크 및 CLI guard가 허용하는 비서는 공개 쓰기 작업도 CLI로 실행할 수 있다. 전용 `invoke_plugin_operation` 도구는 assistant:true 읽기·healthCheck만 제공하며 쓰기를 허용하지 않는다. scope:folder 작업은 아직 지원하지 않는다.

loopback(127.* 또는 ::1) HTTP Host는 listen 완료 후 해당 listener의 정규화된 origin을 비서 child의 `LITZIO_HOST_ORIGIN`으로 전달한다. 비서는 이를 `--host`에 명시한다. CLI의 필수 주소 검증·실패 시 재실행 금지는 유지한다. origin이 없는 환경에서는 부모의 값을 상속하지 않으며 주소가 없다고 보고하고 중단한다. 연결 수명은 [비서 계약](main-agent-v1.md)을 따른다.

비서 CLI의 자동 주소 전달은 기존 HTTP 허용 목록을 바꾸지 않는다. non-loopback·wildcard·IPv4-mapped IPv6 bind에는 주소를 전달하지 않는다. 이 개발/검사용 구성에서는 자동 주소를 필요로 하는 비서의 Host 대상 CLI 호출만 주소 없음으로 분명히 실패하며, public-origin이나 다른 loopback 주소를 추측하지 않는다. 수동으로 명시한 CLI --host와 기존 HTTP 허용 판정은 유지한다.

제작 폴더 안의 artifact는 설정된 경로와 scaffold가 반환한 canonical 경로 모두로 validate/install/dependencies/bundle할 수 있다. 경로가 허용된 제작 폴더 아래인지 확인한 뒤 Windows 8.3 이름·부모 alias를 canonical 경로로 해석하고, 고정 root 및 요청 쓰기 범위를 다시 검사한다. alias가 범위 밖을 가리키거나 root가 바뀌면 거부한다. validate/install의 디렉터리 단계 거부는 `file:"artifact directory"`, `path:"directory"`와 접근 범위·존재·권한·root/link 조건을 설명하는 안전한 진단을 반환하며 OS 오류의 절대 경로를 노출하지 않는다.

npm은 앱에 실은 압축 파일에서 필요할 때 준비한다. 의존성 설치는 lifecycle scripts/native build를 실행하지 않는다. esbuild와 공개 SDK를 배포물에 싣고 artifact 밖 Host runtime에서 SDK를 제공한다. 외부 plugin이 checkout/private 모듈을 import하지 못하게 한다. 출처 복사에서 `.git`은 제외하고 실제 파일로 준비된 `node_modules`는 로컬 번들과 Node 런타임 import를 위해 포함한다. 링크는 거부한다. 의존성이 준비되어 있으면 설치본에서 번들하며, 의존성 폴더 없이 배포한 패키지는 동봉한 번들을 사용한다. 로컬 폴더의 설치·다시 읽기는 네트워크에서 패키지를 내려받지 않는다. GitHub 출처는 lockfile로 의존성을 준비한다([GitHub 출처](#github-출처)). 레지스트리·프록시는 제작 중 의존성 설치에서 기존 npm 설정을 사용한다. npm 캐시·로그는 명령줄 인자로 Host 데이터 폴더의 `plugin-npm` 아래에 두어 프로젝트·사용자 npmrc보다 우선한다.

## 검증 경계

검증 명령과 통과 조건은 [플러그인 실행 검증](../test/README.md#플러그인-실행-검증)을 따른다.

SDK는 manifest·schema 경계를, Host 단위 검사는 process·drain·crash·timeout·설정·secret·스킬·신뢰·reload·출력 경계를 보호한다. HTTP/Vite는 같은 작업의 transport와 UI를, packaged 외부 SDK helper는 checkout 없는 SDK resolve·설치·npm·bundle·receipt를 검사한다. 화면의 공식 새 문서 저장은 [화면 계약](plugin-screens-v1.md)을 따른다. fixture/localhost 통과를 실제 원격 PC·사내 서비스·실제 계정 수락으로 표현하지 않는다.

긴 처리는 plugin process에서 접수 후 진행하며 화면은 짧은 호출로 상태를 조회할 수 있다. 비서·CLI도 같은 상태를 알아야 하면 assistant:true 공개 읽기 operation으로 진행/결과를 선언한다. status()의 {available,message}와 작업 기록은 별개다. 호출 한계는 10초이며 장기 작업 상태는 플러그인이 소유한다. 실제 제작의 초기 단일 호출 timeout과 후속 접수/조회 시험은 [3단계 기록](../reviews/plugin-screen-code-1592.md#3단계-협의-절차와-제작-시험)을 따른다.

제작 안내는 상태 조회의 `{id,state,message,result?}` 관례를 제공한다. state는 queued/running/succeeded/failed/cancelled/not_found이며 not_found는 조회 기록이 없다는 뜻으로, 쓰기가 없었다는 증거가 아니다. 업무 id는 화면 invoke가 반환하는 result 안에 넣는다. 상태·취소·재시작 복구는 플러그인 소유이며 공용 상태 파일 형식이나 job 엔진을 만들지 않는다. 기존 문서의 지원 의미 부분 편집은 inspect → revision 조건의 한 작업짜리 apply-batch JSON → 다시 inspect로 결과 revision을 확인한다. 제한 권한의 쓰기 CLI guard는 그대로 적용한다.
