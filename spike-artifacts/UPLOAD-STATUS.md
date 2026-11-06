# 업로드 시점 상태

2026-11-06 소유자 지시에 따라 추가 구현·검증·AI 호출을 중단하고 이 임시 브랜치만 업로드한다. PR·이슈·댓글·merge는 만들지 않는다. 기존 README는 앞선 실증 시점의 기록이다.

중단 직전 `server/interview-spike.ts`에 제한된 자연어 승인 판별 함수와 `/message`에서 기존 승인 경로로 보내는 분기를 추가했다. 승인 기록에 source/message를 추가했고, 기본 산출물 위치를 `spike-artifacts/followup/<timestamp>`로 바꿨다. 개발 Vite 설정은 별도 산출물 경로 환경 변수를 전달하도록 바뀌었다. 이 변경은 **미검증·미완료**다. UI는 아직 기존 노드 의견/승인 버튼 방식이며 새 `/message`와 연결되지 않았다. 640px fitView·minZoom·가독성, 폼 표시부터 시작하는 모션 시퀀스 보완은 착수하지 않았다. 변경을 되돌리거나 기능적으로 마무리하지 않고 그대로 보존했다.

앞선 실제 `gpt-6-luna / low` 5회·브라우저·형식 검사·파일 검사 결과는 당시 코드의 증거다. 위 중단 직전 변경의 검증 결과가 아니다. 이후 신규 AI 호출·기능 테스트·화면 촬영은 하지 않았다. 업로드 작업에서는 `git diff --check`, 공개 후보 검사와 프로세스 확인만 수행했다.

공개 범위는 임시 UI/Host adapter·테스트·개발 설정·lockfile, 합성 보고서, 합성 입력/결과 기록, 검사 결과, 기존 화면과 프레임 시퀀스, 실행 안내다. `session.json`의 provider 대화 식별자는 `synthetic-conversation`으로 치환했다. 질문·답·노드·댓글·revision·모델 결과와 문서 내용은 그대로다. 치환 전 원본은 로컬 `local-only/session-original.json`에 바이트 그대로 보존하며 업로드하지 않는다. 세션 기록은 provider 대화 재개용이 아니라 합성 실증·화면 재생용이다.

실제 사용자 절대 경로가 있는 `host/assistant/conversations.json`, 생성 CLI 번들·wrapper·환경 지침, fault fixture runtime, browser runner 결과 디렉터리, 원본 사본·공개 검사 임시 파일, PID 목록은 stage하지 않는다. 제외물은 이 폴더의 `.gitignore`에 명시했다. 원래 로컬 자료를 삭제하지 않았다. 캡처는 합성 연구실/행사와 앱 콘텐츠만 담은 기존 PNG이며 사용자 브라우저 주소창·계정·개인 문서를 포함하지 않는다.

업로드 시점에 전용 5196 포트 listener와 이 작업의 Vite 서버가 없음을 확인했다. 기존 실행 종료 근거는 `cleanup.json`이다. 브랜치와 worktree를 보존한다.
