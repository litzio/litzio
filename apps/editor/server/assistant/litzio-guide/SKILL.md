---
name: litzio-guide
description: 리치오 앱 사용법, 문서 템플릿과 터미널 CLI 이어하기를 안내한다. 템플릿 생성·저장이나 앱 조작 안내가 필요할 때 읽는다.
---
# 리치오 사용 안내

## 앱 사용법
- 시작 화면이나 파일 사이드바에서 문서·폴더를 열고 파일을 선택하면 탭이 열린다. 읽기·편집·원문 모드를 사용하며 편집 후 저장한다. 아직 적용하지 않은 속성 초안은 별개다.
- 설정에서 외관·언어·문서 환경·비서를 조정한다. 비서 설정은 공급자·모델·추론 강도·기본 언어·권한 모드를 고른다. 기본 언어는 대화 없이 시작하는 작업에 사용된다.
- Copilot CLI 추론 강도 변경은 새 대화가 필요하다. ACP thought-level과 Agent/Plan은 다음 메시지에 적용된다. Full access는 sandbox를 해제하고 도구·경로·네트워크 접근을 자동 승인한다. 진단은 연결·계정 상태, 공통 환경은 작업 폴더·지시문·로컬 스킬을 보여 준다.
- Codex dynamic tools와 Copilot HTTP MCP는 같은 Host 도구를 제공한다. 실제 제공된 도구를 사용한다. 표시·화면 도구에는 메시지를 보낸 창의 보이는 비서 패널이 필요하며 터미널에는 원래 창이 없다.
- 새 문서 결과 카드에서 열기·생성 Undo를 할 수 있다. 디스크 변경·미저장 편집에 대한 기존 확인과 나중 변경 시 삭제 거부는 유지된다.

## 템플릿
- 새 문서를 만들 때 list_templates로 현재 이름·설명을 조회한다. language는 ko 또는 en이며 그 외에는 en을 사용한다. 요청에 맞는 템플릿을 선택해 read_template로 읽고 create_document({path,template,language})로 만든다. 요청 범위 안의 선택·적용에 별도 동의를 묻지 않는다.
- 사용자가 지정한 템플릿은 현재 ID로 확인한다. 없거나 잘못됐으면 다른 템플릿으로 몰래 대체하지 말고 문제를 알린다. 맞는 템플릿이 없으면 일반 새 문서 생성 경로를 쓴다.
- 템플릿 생성은 title/blocks/operations와 함께 사용하지 않는다. 내용을 blocks로 재조립하거나 Markdown·템플릿 파일을 수동 작성하지 않는다. 상대 리소스는 복사되지 않으므로 목적지에서 사용 가능한지 확인한다.
- 저장 요청은 save_template({name,from,description?})으로 수행한다. 이름·원본 경로 등 필요한 정보만 확인하며 별도 사전 동의는 요구하지 않는다. 원본은 바뀌지 않는다. 새 템플릿은 먼저 create_document로 문서를 만든 뒤 저장한다.
- 미저장 편집 내용은 전달되지 않는다. 해당 편집까지 담으려면 먼저 저장하도록 안내하며 디스크 내용을 미저장 편집본이라고 하지 않는다.
- 기본 제공 템플릿은 읽기 전용이므로 새 이름의 사본으로 사용자 템플릿을 만든다. 같은 이름은 덮어쓰지 않으며 다른 이름을 정한다. 저장 후 read_template와 list_templates로 결과·목록을 확인한다. 목록을 외우지 말고 현재 카탈로그를 조회한다.
- Host의 템플릿 저장소는 문서 폴더 밖의 고정 앱 경로다. 원본·목적지는 이 턴의 열린 폴더/Host Root와 쓰기 권한을 따른다. 도구·접근이 없으면 제한을 설명하고 가능한 공식 경로나 텍스트 안내를 제공한다.

## 터미널 이어하기
- 이 절의 CLI 절차는 Host 도구가 없는 터미널에서만 사용한다. 리치오에서 Host 도구가 보이면 stage_document → inspect_staged_document → edit_staged_document를 쓰고 셸·CLI를 실행하지 않는다.
- Codex thread ID로 대화를 이어간다. 리치오 dynamic tools는 터미널에서 실행되지 않으므로 설치된 CLI를 사용한다. litzio --help와 각 명령의 --help로 설치 버전의 옵션·연산 schema를 확인한다.
- Host는 자기 CLI의 private shim을 자식 PATH 앞에 두며 시스템 PATH는 바꾸지 않는다. 리치오 밖에서 이어갈 때는 의도한 Host/카탈로그의 CLI인지 명시적으로 확인한다.
- 기존 문서 사본: litzio assistant changes start <conversationId> --path <absolute-original-path>. conversationId는 메시지 맥락에 있다. 반환된 사본 경로에 litzio inspect <copy> --format json, litzio apply-batch <copy> --operations <json-file> --if-revision <revision>, litzio check <copy>를 사용한다. 구조 변경 뒤 inspect로 경로·revision을 갱신한다. 적용·버리기는 사람이 리치오 비교 탭에서 한다.
- 새 문서: litzio create <new-file>, litzio inspect <file>, litzio apply-batch <file> --operations <json-file> --if-revision <revision>, litzio check <file> 순서로 작성·검사한다.
- 템플릿: litzio templates list --json --language <ko|en>, litzio templates read <id> --json --language <ko|en>, litzio create <new-file> --template <id> --language <ko|en>, litzio templates save <name> --from <file> --description <text>를 사용한다.
- CLI 생성에는 리치오 결과 카드·카드 Undo가 없으므로 경로·검사 결과를 텍스트로 보고한다. 셸 실행이 거부되면 Host 도구 등 허용된 경로를 사용한다.
