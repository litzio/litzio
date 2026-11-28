---
name: litzio-guide
description: 리치오 앱 사용법, 문서 템플릿과 터미널 CLI 이어하기를 안내한다. 템플릿 생성·저장이나 앱 조작 안내가 필요할 때 읽는다.
---
# 리치오 사용 안내

## 앱 사용법
- 시작 화면이나 파일 사이드바에서 문서·폴더를 열고 파일을 선택하면 탭이 열린다. 읽기·편집·원문 모드를 사용하며 편집 후 저장한다. 아직 적용하지 않은 속성 초안은 별개다.
- 설정에서 외관·언어·문서 환경·비서를 조정한다. 비서 설정은 공급자(Codex·GitHub Copilot·Ollama)·모델·추론 강도·기본 언어·권한 모드를 고른다. Ollama는 Host의 Ollama 모델을 Copilot CLI로 실행하며 Ollama 주소는 Ollama 진단에서 고친다. 기본 언어는 대화 없이 시작하는 작업에 사용된다.
- Copilot CLI 추론 강도 변경은 새 대화가 필요하다. ACP thought-level과 Agent/Plan은 다음 메시지에 적용된다. Full access는 sandbox를 해제하고 도구·경로·네트워크 접근을 자동 승인한다. 진단은 연결·계정 상태, 공통 환경은 작업 폴더·지시문·로컬 스킬을 보여 준다.
- Codex dynamic tools와 Copilot·Ollama HTTP MCP는 같은 Host 도구를 제공한다. 실제 제공된 도구를 사용한다. 앱의 탭·폴더 열기/닫기·표시 설정은 사용자가 직접 조작한다.
- 새 문서 결과 카드에서 열기·생성 Undo를 할 수 있다. 디스크 변경·미저장 편집에 대한 기존 확인과 나중 변경 시 삭제 거부는 유지된다.

## 템플릿
- 새 문서를 만들 때 list_templates로 현재 이름·설명을 조회한다. language는 ko 또는 en이며 그 외에는 en을 사용한다. 요청에 맞는 템플릿은 read_template로 확인하고 create_document({path,template,language})로 만들 수 있다. 요청 범위 안의 선택·적용에 별도 동의를 묻지 않는다.
- 사용자가 지정한 템플릿은 현재 ID로 확인한다. 없거나 잘못됐으면 다른 템플릿으로 몰래 대체하지 말고 문제를 알린다. 맞는 템플릿이 없으면 일반 새 문서 생성 경로를 쓴다.
- 템플릿 생성은 title/blocks/operations와 함께 사용하지 않는다. 작성 방법과 무관하게 템플릿 구조를 보존한다. 상대 리소스는 복사되지 않으므로 목적지에서 사용 가능한지 확인한다.
- 저장 요청은 save_template({name,from,description?})으로 수행한다. 이름·원본 경로 등 필요한 정보만 확인하며 별도 사전 동의는 요구하지 않는다. 원본은 바뀌지 않는다.
- 미저장 편집 내용은 전달되지 않는다. 해당 편집까지 담으려면 먼저 저장하도록 안내하며 디스크 내용을 미저장 편집본이라고 하지 않는다.
- 기본 제공 템플릿은 읽기 전용이므로 새 이름의 사본으로 사용자 템플릿을 만든다. 같은 이름은 덮어쓰지 않으며 다른 이름을 정한다. 저장 결과를 확인한다. 목록을 외우지 말고 현재 카탈로그를 조회한다.
- Host의 템플릿 저장소는 문서 폴더 밖의 고정 앱 경로다. 원본·목적지는 이 턴의 열린 폴더/Host Root와 쓰기 권한을 따른다. 도구·접근이 없으면 제한을 설명하고 가능한 공식 경로나 텍스트 안내를 제공한다.

## 기존 문서에 그림 넣기
본문을 공급자 패치 또는 UTF-8 파일 편집 셸로 직접 편집한다. 이미지 경로는 문서 기준 상대 경로, 캡션은 빈 줄 뒤에 쓴다. 같은 폴더의 실제 이미지라면 복사 없이 참조할 수 있다.
```markdown
:::{figure} ./sample.png

합성 표본
:::
```
삽입 방법과 무관하게 `litzio check <file> --format json`으로 문서와 그림 경로를 검사한다.

## CLI와 터미널 이어하기
- Host 호출은 현재 비서를 소유한 listener가 전달한 `LITZIO_HOST_ORIGIN`을 명시한다. PowerShell: `litzio plugins list --host $env:LITZIO_HOST_ORIGIN --json`; POSIX: `litzio plugins list --host "$LITZIO_HOST_ORIGIN" --json`. 비어 있으면 대상 Host 주소가 없다고 보고하고 중단한다. 포트 탐색·기본값·다른 daemon 추측은 하지 않는다. 앱 밖 터미널에는 자동 전달되지 않으므로 의도한 주소를 직접 지정한다.
- `litzio`를 찾지 못하면 Host가 제공한 절대 경로로 실행한다: POSIX 셸은 `"$LITZIO_ASSISTANT_CLI" <인수>`, PowerShell은 `& $env:LITZIO_ASSISTANT_CLI <인수>`, cmd는 `"%LITZIO_ASSISTANT_CLI%" <인수>`를 쓴다.
- Codex thread ID로 대화를 이어간다. 리치오 dynamic tools는 터미널에서 실행되지 않으므로 설치된 CLI를 사용한다. litzio --help와 각 명령의 --help로 설치 버전의 옵션·연산 schema를 확인한다.
- Host는 자기 CLI의 private shim을 자식 PATH 앞에 두며 시스템 PATH는 바꾸지 않는다. 리치오 밖에서 이어갈 때는 의도한 Host/카탈로그의 CLI인지 명시적으로 확인한다.
- 메시지 맥락의 permissionMode가 opened-folders(열린 폴더)·read-only(읽기 전용)이면 CLI는 check·inspect·compare·도움말만 실행된다. 쓰기(insert-*·apply-batch 등)는 시도하거나 실행 승인을 요청하지 말고 본문을 직접 고친 뒤 litzio check로 검사한다. 공급자 패치 도구가 없으면 UTF-8 파일 편집 셸을 쓴다. 읽기 전용의 편집 제한은 유지하며 full-access(전체 접근)에서는 쓰기 CLI도 쓸 수 있다.
- 기존 본문은 공급자 패치로 고쳐 변경 보기·되돌리기와 역슬래시를 보존하고 `litzio check <file> --format json`으로 검사한다. 셸은 읽기·검사·변환·일괄 처리 등에 쓴다. 임시 파일은 현재 폴더에 두며 열린 폴더의 지시 파일을 먼저 읽는다.
- 문장부호로 끝나는(또는 시작하는) 굵게·기울임 바로 바깥에 글자를 붙이면 강조가 풀린다(예: `**정확도(Accuracy)**를`). check의 emphasis 경고를 보면 그 바깥 글자를 `&#x...;` 문자 참조로 바꿔 고친다.
- 전체 접근의 이미지 자산 CLI: litzio assistant import-image <absolute-document> --source <absolute-image>로 가져올 수 있다. 삽입 방법과 무관하게 litzio check로 그림 경로를 검사한다.
- 전체 접근의 새 문서 CLI: litzio create <new-file>, litzio inspect <file>, litzio apply-batch <file> --operations <json-file> --if-revision <revision>, litzio check <file> 순서로 작성·검사한다.
- 긴 텍스트는 명령 인수(`--text` 등)로 넘기지 말고 `apply-batch --operations <json-file>`(또는 `-`로 stdin)으로 넘긴다. Windows 명령줄은 약 8,000자에서 잘린다.
- 전체 접근의 템플릿 CLI: litzio templates list --json --language <ko|en>, litzio templates read <id> --json --language <ko|en>, litzio create <new-file> --template <id> --language <ko|en>, litzio templates save <name> --from <file> --description <text>를 사용한다.
- CLI 생성에는 리치오 결과 카드·카드 Undo가 없으므로 경로·검사 결과를 텍스트로 보고한다.

- 구조가 필요한 읽기는 `litzio inspect <file> --format json`의 Core `content`를 사용한다. `text`는 요약이다. 표 캡션은 `caption`, 목록은 `items[].content`와 `items[].list`이며 그림 캡션·셀·미주 정의에도 `content`가 있다. 체크리스트는 `checklist: true`와 항목별 `checked`다.
- 취소선은 `~~문구~~`를 쓴다. 참고·팁·중요·경고·위험 알림의 첫 줄은 `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`이고, 본문은 `>`로 시작하는 한 문단이다. 캡션·라벨·번호 옵션이 없는 단독 그림은 `![대체 텍스트](./sample.png)`로 쓴다. 중첩 목록 앞 빈 줄은 하위 목록이 문단을 끊을 수 있는 경우 생략한다.
- 체크리스트(할 일·점검표)는 글머리표 목록의 모든 항목에 `- [ ] 할 일` / `- [x] 끝난 일`을 붙이고 항목 사이에 빈 줄을 두지 않는다. 번호 목록이나 일부 항목에만 체크박스를 쓰면 문서가 열리지 않는다. 체크는 그 항목의 `[ ]`↔`[x]`만 바꾸거나 전체 접근에서 `litzio update-list-item-checked <file> --path <목록> --item <항목 번호,중첩 번호> --checked true|false`를 쓴다. `insert-list`·`update-list`의 ListContent는 `"checklist":true`와 항목 `"checked"`를 받는다.
- 빈 줄이 있는 일반 목록을 `inspect --format json`에서 읽어 고칠 때는 해당 목록의 `"loose":true`를 중첩 단계별로 유지한다. 새 목록과 체크리스트에서는 생략한다.

## 안전한 부분 편집 (쓰기 CLI를 허용하는 전체 접근)
`litzio inspect document.md --format json`에서 현재 revision과 NodePath를 얻는다. 해당 블록에 Before가 있을 때 아래 operations.json 예제를 쓸 수 있다. 실제 inspect 결과의 path/from으로 바꾼다.

```json
[{"command":"update-node-text","path":"1","from":"Before","to":"After"}]
```

`litzio apply-batch document.md --operations operations.json --if-revision <inspect의-revision> --format json`은 작업 하나도 `{ok,command,applied,revision}`으로 결과를 준다. `--dry-run`으로 먼저 확인할 수 있다. mismatch는 쓰지 않고 거부한다. 성공 뒤 다시 inspect하여 새 경로와 revision을 얻는다. 단일 edit 명령은 새 revision receipt를 출력하지 않는다. 부분 의미 편집도 canonical 문서 전체를 저장하며 미저장 편집본이나 창의 Undo와 공유하지 않는다. 제한 권한의 CLI guard를 우회하지 않는다.

- 표 칸의 줄바꿈은 `InlineContent`의 `{"kind":"break"}`이며 표 주석은 표에 속한 문단 배열 `notes`다. 작성 입력은 읽기에서 얻은 두 필드를 그대로 받는다.
- Markdown 본문을 직접 작성할 때는 목록에 `- 항목`과 `1. 항목`을 쓴다. 캡션·라벨·주석·번호 옵션이 없는 단순 표는 맨 파이프 표(`| 이름 | 값 |`, 구분줄 `| --- | --- |`)로 쓴다. 라벨과 고정 번호가 없는 블록 수식은 여는 `$$`, LaTeX 본문, 닫는 `$$`를 별도 줄에 쓴다.
- `create --input`과 화면 `saveDocument`는 같은 Core 작성 schema다. text는 글자 그대로이며 content는 읽기 출력의 InlineContent 배열이다. 표 caption·label·셀 구조, 미주 정의/표시, Core ListContent의 중첩·style·delimiter·start, target과 reference를 보존한다. 완성 입력의 끊긴 연결은 위치·이유와 함께 거부한다.

문서 검토 상태는 `litzio inspect <file> --format json`의 `status`(없으면 null)로 읽는다. `litzio update-status <file> --value draft|review|approved`로 정하고 `--remove`로 없앤다. 새 문서의 `create --input` 작성 JSON도 선택 `status`를 받으며 상태는 편집을 제한하지 않는다.
