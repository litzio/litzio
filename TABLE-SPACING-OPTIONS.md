# 표 간격 선택 자료 — #1481

이 자료는 실제 화면의 배치 검토용 시안이다. 수락 검증이나 Edit 변경 승인이 아니다. 부분 1은 PR #1635, 부분 2는 제품 코드 변경 없이 검사 중 CSS 주입으로 비교했다.

| 선택 | 방식 | 높이 | 판단 |
| --- | --- | --- | --- |
| 가 | 편집 도구 자리 상시 예약 | 기준 | 현재 Edit 계약 유지. 가장 안전한 기본안 |
| 나 | 번호 행 유지, 손잡이·추가 버튼을 가장자리에 겹침 | 1440 표본에서 표당 66px 감소 | 글자·캡션·메타데이터와 겹침 여부를 더 다듬은 뒤 선택 필요 |
| 다 | hover/focus 때만 여백 확대 | 상태마다 변함 | 누르려던 내용이 움직여 #1625·#1626 유형 재발 가능. 비추천, 구현 안 함 |

추천: 읽기 전용 여백 제거를 먼저 독립 리뷰하고, Edit는 가를 유지한다. 나의 아래쪽만 줄이는 변형을 다음 검토 후보로 삼는다. 열 손잡이는 가로 스크롤 안쪽, 행 손잡이는 바깥쪽에 있으므로 padding만 줄이는 시안으로 제품 완성도를 판정할 수 없다.

## 측정과 캡처

새 합성 문서는 맨 위 표, 바로 앞 문단, 캡션 표, 연속 표, 마지막 넓은 표를 포함한다. 1440/640, light/dark에서 Read before/after 및 Edit a/b 각각 hidden/shown/menu/scrolled를 촬영했다. before는 수정 전 padding을 스타일로 되돌린 비교이며 이전 빌드 실행은 아니다. 시안 나에서는 기존 번호 행을 유지했다.

- `tmp/table-spacing-1481/{theme}-{width}-{read|visual}-{before|after|a|b}-{hidden|shown|menu|scrolled}.png`
- `tmp/table-spacing-1481/measurements.json`: 표 높이, padding, 도구 위치와 visibility/opacity
- `tmp/table-spacing-1481/capture.browser.js`: 재현 본문. runner의 quiet-document 본문을 임시 교체해 실행한 뒤 원본 복구
- Read 1440 표본: 211→135px, 넓은 표 299→223px (각 76px 감소)
- Edit 1440 표본: 211→145px, 넓은 표 299→233px (각 66px 감소)

## 관찰과 제한

번호·레이블 행은 유지한다. 나안의 상단 손잡이는 표 머리글 가장자리에 걸친다. 아래 추가 버튼은 캡션 다음에 배치되는 기존 geometry를 그대로 쓰므로 캡션 위 테두리로 이동한 완성 구현과 같지 않다. hidden은 포인터와 DOM focus를 바깥으로 옮긴 상태이나 기존 셀 선택이 도구 active를 유지할 수 있다. 각 PNG는 실제 보이는 상태를 확인해야 한다. scrolled는 scrollLeft 최대 요청이며 실제 overflow가 없는 표에서 가로 이동을 입증하지 않는다.

## 채택 시 계약과 검사 영향

`table-interaction-v1.md`의 editable reserved-row, preceding-prose/column-tools/captions overlap 방지 문장을 변경해야 한다. `editor-visual-language-v1.md`의 showing tools never shifts document text 원칙은 유지한다. table-authoring의 상단 도구/열 손잡이/캡션 위치 단언, 키보드 Tab/Escape reveal, 넓은 표 target/scroll, block hover와 caption-selection 검사를 재검토해야 한다. 의미/Core/CLI 변경은 필요 없다.

## 겹침 측정 추가 (실제 DOM Range와 hit test)

1440 light 나안 shown/menu/keyboard에서 첫 열 손잡이가 `Name` 글자 범위와 약 40.41×3px, 둘째 열 손잡이가 `Value`와 약 38.72×3px 겹친다. 겹친 중심점의 elementFromPoint는 버튼을 반환하여 그 지점의 글자는 직접 누를 수 없다. 번호·레이블 행과 둘째 손잡이는 최대 94.52×14px의 범위가 겹치며 그 중심점은 metadata 쪽이 받는다. 이 경우 반대로 손잡이 일부가 가려진다. 이는 글리프 잉크 픽셀 분석이 아니라 브라우저 텍스트 Range 직사각형 기준이다. 모든 테마/폭/상태별 원시 결과는 measurements.json의 overlap에 있다.

키보드 상태는 첫 열 손잡이를 focus한 뒤 실제 Tab을 한 번 누른 상태다. discovery 전체 경로의 수락 시험을 대신하지 않는다. 나안의 표시·숨김과 keyboard에서 같은 높이를 유지하지만 위의 겹침은 남는다. 앞 문단·캡션 텍스트와 도구의 직접 겹침은 이 표본의 Range 검사에서 발견되지 않았다. 메타데이터 행을 보존한 결과이며 모든 문서에서 겹침이 없다는 보장은 아니다.

시각 자체 점검: Read light 1440에서 문단·캡션·연속 표를 읽을 수 있고 계정/로컬 경로 없는 본문 PNG를 확인했다. Edit dark 640 메뉴는 표 본문을 가리는 기존 팝오버 영역을 포함한다. 나안은 머리글과 metadata 겹침 때문에 그대로 채택하지 않는 것을 추천한다. 이전 탐색 실행에서 만든 계정 포함 전체 창 PNG는 공개 자료로 사용하지 않는다. 위의 본문 파일명 패턴은 마지막 재촬영본을 사용한다.

로컬 검증: table-authoring, table-cell-editing, table-caption, layout-rules 4/4 통과. 캡처 본문은 별도 순회 통과. PR head의 CI 통과와 구분한다.

후속 소유자 지시에 따라 Edit 시안 추가는 중단했다. 이 파일은 조사 전 이미 생성한 배치 실험 기록이며 추천은 TABLE-TOOLS-REFERENCE.md의 조사 결과를 우선한다. 새 변형은 만들지 않았다.
