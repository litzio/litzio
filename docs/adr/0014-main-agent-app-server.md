# ADR-0014: Host가 소유하는 비서 공급자 연결

- Status: Accepted
- Decision date: 2026-11-02
- Last verified: 2026-11-13 — 현재 공급자 연결·대화 코드와 정적 대조. 실행 검증 없음.
- Authority: [#931 소유자 결정](https://github.com/litzio/litzio/issues/931), [#967 최소 버전](https://github.com/litzio/litzio/issues/967), #1053·#1091 공급자 추가와 선택.
- Partially supersedes: [ADR-0013](0013-ai-agent-task-service.md)의 상주 비서 도입 시 전용 Codex 홈을 만드는 조건.
- Partially superseded by: [ADR-0017](0017-bundled-client-and-official-ai.md)의 공식 AI·daemon 수명, [ADR-0021](0021-general-agent-assistant.md)의 직접 편집·권한·전용 도구 기준.

## 남아 있는 결정

1. Host가 비서 공급자 프로세스와 연결을 소유한다. Codex app-server와 Copilot ACP를 통해 실행하며 브라우저가 공급자 프로세스를 직접 시작하지 않는다.
   화면과 실행 소유권을 분리한다. 현재 수명은 ADR-0017의 daemon을 따른다.
2. Codex는 사용자의 기존 로그인·설정·지시문·세션을 재사용하며 별도 CODEX_HOME이나 사용자 설정 사본을 만들지 않는다.
   평소 Codex 사용과의 연속성을 유지하고 두 번째 로그인을 피한다.
3. 비서 작업 폴더는 앱 데이터의 `assistant` 폴더에 둔다. 제품 지시문과 사용 안내 스킬도 여기 제공한다.
   여러 폴더를 한 창에 여는 구조에 맞고 사용자 폴더에 임시 파일을 쌓지 않는다. 유지 이유와 재검토 기준은 ADR-0021 결정 6을 따른다.
4. Codex 최소 버전은 0.141.0이다. 사용하는 app-server 계약을 모두 갖춘 첫 버전을 기준으로 하며 필요한 계약이 바뀔 때만 올린다.
   최소 버전에서 모든 계정·모델의 실제 대화 성공을 보장한다는 뜻은 아니다.
5. Copilot을 비서 대화의 공급자로 제공하며 Agent·Plan을 선택할 수 있다. 전체 접근 여부는 별도 권한 설정으로 고른다.
   공급자 모드와 권한 선택을 구분한다.

## 대체 관계와 현재 동작

기존 문서의 텍스트 제안 전용 결정과 제한 권한의 Copilot 셸 거부는 ADR-0021로 대체됐다.
문서는 원본을 바로 수정하며, CLI·스킬을 기본으로 쓴다. 2026-11-13 #1360에서 창 연동 도구와 요청 통로도 제거했다.
AI 플러그인 활성화·해제에 따른 연결 수명은 ADR-0017의 공식 AI로 대체됐다.

권한 매핑·모델 선택 시점·질문·대화 재개·도구의 현재 동작과 한계는 [비서 계약](../design/main-agent-v1.md)에 둔다.
프로토콜 필드·route·검증 연대기를 별도의 아키텍처 결정으로 유지하지 않는다.

## 이력

[축소 전 본문](https://github.com/litzio/litzio/blob/422e0c1e5499678623a7f5d2be0ad28e4f90a132/docs/adr/0014-main-agent-app-server.md)에 당시 연결·설정·도구·검증 기록을 보존한다. 현재 요구사항이 아니다.
