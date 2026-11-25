# ADR-0023: 표 칸 줄바꿈과 표 주석

- Status: Accepted
- Decision date: 2026-11-25
- Authority: [#1973 소유자 결정](https://github.com/litzio/litzio/issues/1973), [AGENTS.md](../../AGENTS.md)
- Related: [ADR-0002](0002-document-persistence-semantic-ownership.md), [ADR-0006](0006-native-document-boundary.md)

엔지니어링 문서에서 칸의 줄 구분과 표 바로 아래의 주석은 표의 의미다. Core가
이 정보를 표와 함께 저장하고, 편집기와 CLI가 같은 읽기 모델과 연산을 사용한다.

1. 한 행의 머리글과 직사각형 격자는 기존 파이프 표로 저장한다.
2. 인라인 줄바꿈은 칸 안의 `<br>`로 저장한다. 같은 `{table}` 지시문에서
   격자 뒤의 문단은 표에 속한 MyST legend다. 캡션은 지시문 첫 줄에 둔다.
   주석의 원문 표시는 글자로 남는다. 표 주석은 본문 미주 번호에 참여하지 않는다.
3. 병합이나 칸 안 블록이 필요한 복잡한 표는 `{table}` 안의 HTML 표 부분 집합을
   별도 단계에서 설계한다. 표 주석의 소유권은 격자 표현과 독립적이다.

정규 표기, 입력·출력과 편집 동작은 [표 계약](../design/table-caption-v1.md#cell-breaks-and-table-notes-1973)을 따른다.
