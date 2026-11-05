# 비서 플러그인 제작 예행연습 (2026-11-05)

- Status: Historical
- Last verified: 2026-11-05 — Windows 실제 Codex app-server와 격리 HTTP Host에서 실행. 외부 Jira·secret·K1·설치 제품 검증이 아니다.
- Current authority: [플러그인 1단계 계약](../design/plugin-stage1-v1.md).
- Scope: 제작 키트의 모델별 이행 능력 확인. 소유자 지시로 최저가 모델 원칙의 예외를 적용해 gpt-6.1-sol도 비교했다.

동일 요청: “간단한 인사말 작업 플러그인을 만들어 붙여줘.” 두 실행 모두 각각 새 임시 작업 폴더와 대상 Host origin을 함께 주었다. product AssistantConversations의 번들 제작 문맥, manage_plugins, 공식 CLI shim과 Host 작업을 사용했다. 권한은 full-access이며 전역 설정·사용자 데이터는 바꾸지 않았다. 모델별 fresh conversation·artifact·Host이며 종료 때 app-server·플러그인 자식·HTTP listener를 닫았다. tool 횟수는 Codex 실행 항목(exec- ID)의 shell·patch·dynamic tool 호출 합이며 제품 활동 요약의 중복 항목은 제외한다. 시간은 모델 조회·대화 시작부터 완료 polling까지다. 단일 사례이며 일반 성능 비교가 아니다.

| 모델 | 추론 | 시간 | 도구 호출 | 완료·실패 단계 | validate 오류 뒤 자체 수정 |
| --- | --- | --- | --- | --- | --- |
| gpt-6-luna | low | 86.4초 | 13 | scaffold→validate→register→trust→enable→CLI invoke 성공, 한국어 인사말 확인 | 오류가 발생하지 않아 관측하지 못함 |
| gpt-6.1-sol | catalog 기본값 low | 61.6초 | 15 | 같은 흐름 성공. 입력 예제 추가 후 다시 validate·list·trust·reload·invoke까지 수행 | validate 오류는 없었음. digest 변경은 스스로 재신뢰·reload하여 회복 |

두 모델은 shell 경로/작업 디렉터리 확인에서 일부 실패 뒤 스스로 경로를 고쳤다. 실제 인사말 반환은 각 최종 응답뿐 아니라 CLI 호출 결과와 Host의 trusted/enabled/running 상태로 확인했다. 오류 수정 능력 확인을 위해 검증 오류를 인위적으로 끼워 넣지는 않았다. 따라서 “validation 오류 후 자체 수정 성공”으로 보고하지 않는다. 자동 회귀는 handler 누락·미선언 handler·schema 오류·literal 반환 불일치 거부를 별도로 소유한다.

최초 시험은 health control 없는 HTTP Host를 잘못 구성해 두 모델 모두 CLI의 protocol preflight에서 막혔다(Luna 72.1초, Sol 90.0초). 이 결과는 성공으로 바꾸지 않고 시험 구성 결함으로 구분했다. 당시 Luna는 신뢰 후 artifact 안에 예제 파일이 생겨 digest가 달라진 상태도 남았다. health control을 추가한 새 Host로 재시험했다. 관측에 따라 스킬에 “호출 입력 JSON은 artifact 밖에 두기, 모든 수정 후 validate/list/trust/reload, 실제 결과 확인 전 성공 주장 금지”를 보강했다.

실제 시험은 로컬 tmp/authoring/rehearse.ts와 모델별 JSON·로그에 남겼으며 원문 대화는 제품 계약이나 CI 자동 시험으로 편입하지 않는다. 필수 CI·제품 설치·다른 OS의 증거를 이 시험으로 대신하지 않는다.
