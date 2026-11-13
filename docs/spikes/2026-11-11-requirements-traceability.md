# 2026-11-11 요구사항 추적과 ReqIF 내보내기

- Status: Historical
- Date: 2026-11-11 (브랜치 마지막 커밋일, KST)
- 결론: **미정** — 문서가 채택 여부와 후속 범위를 소유자 결정으로 남겼다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

표준 요구사항 문서(왼쪽)와 시스템 요구사항 문서(오른쪽)를 모두 평범한 Litzio 문서로 두고 문장 단위 추적이 성립하는지, ReqIF 1.2로 내보낼 수 있는지 확인한다.

## 무엇을 만들었나

- Core의 요구사항 블록(MyST 지시문 정식 형태), 문장 분리·해시 기반 앵커, 점검 7종, ReqIF 1.2 내보내기.
- Host 연산·HTTP 경로·CLI 명령과, 두 문서를 나란히 보며 채택/제외하는 비교 탭 및 요구사항 편집 블록.
- 표준 문서(IEEE Std 1547-2018 4–6장) 본문과 캡처는 저작권 때문에 저장소에 넣지 않았다.

## 결과·관찰

- 표준 문서의 규범 문장 265개(shall 219·may 45·should 1)를 대상으로 추적을 시험했다. 시스템 문서에서 표준 문서로 가는 연결은 요구사항 블록의 `:source:` 속성뿐이다.
- ReqIF는 XSD 검증과 StrictDoc 가져오기(한국어 본문 포함)를 확인했다. DOORS·Polarion 등은 시험하지 않았다.
- 한계: 문장 해시가 같으면 같은 문장으로 본다. 앵커는 최상위 단락만 지원하고 표·목록 항목은 스캔하지 않는다. 요구사항 본문은 일반 텍스트다. 상·하위 구조와 개정·승인 흐름은 열어 두기만 했다.

## 결론/후속

- 결론: **미정**. 문서가 채택 여부와 후속 범위를 소유자 결정으로 남겼다.
- 관련 이슈·PR: 확인한 것이 없다.

## 코드 위치

- 태그: [`spike/2026-11-11-requirements-traceability`](https://github.com/litzio/litzio/tree/spike/2026-11-11-requirements-traceability)
- 브랜치: [`spike/requirements-traceability`](https://github.com/litzio/litzio/tree/spike/requirements-traceability) (master 대비 커밋 3개)
- 마지막 커밋: [`24e7e95b`](https://github.com/litzio/litzio/commit/24e7e95b22be40a2a3672e451540cab79243ff6c)
- 당시 기록(태그 기준): [요구사항 추적 스파이크 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-11-requirements-traceability/docs/reviews/requirements-traceability-spike-2026-11.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
