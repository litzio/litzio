# 큰 문서의 국소 정규 쓰기

[#1983](https://github.com/litzio/litzio/issues/1983)의 검증 질문은 이미 승인된 정규 MyST 원문에서 최상위 블록 하나를 바꾸고 이웃까지 다시 읽어도 전체 정규 쓰기의 승인, 바이트, 의미와 경계가 유지되는가다.

## 만든 것

- `local.ts`는 파서의 줄 위치를 UTF-8 바이트 범위로 바꾸고 양옆 구분자와 의미 지문을 기억한다. MyST가 단일 자식 지시문을 펼칠 때 없애는 바깥 위치만 스파이크 옵션으로 원래 파서에서 가져온다.
- 정규 원문과 revision에 묶인 지도에서, 기존 Core 연산과 직렬화기로 블록 하나를 쓴다. 편집 블록과 양옆을 MyST로 다시 읽고 유형, 범위 및 의미가 같을 때 후보 바이트와 갱신한 지도를 만든다. 전체 경로를 선택한 경우의 별도 후보는 진단에만 사용한다.
- `cases.ts`는 시드 1983의 기계 편집과 시드 19831125의 검수 편집을 만든다. `run.ts`는 편집마다 전체 Core 연산, 네이티브 확인, 전체 다시 읽기, 두 번째 쓰기의 바이트 안정성을 대조한다. 두 바이트열이 같으면 전체 경로의 파싱 결과를 재사용해 국소 모델과 경계·의미를 비교한다. 안정성 검사는 기존 Core 작성기 그대로 실행한다.

## 재현

```powershell
pnpm install --frozen-lockfile
pnpm exec tsx scripts/spike-local-canonical-write/run.ts
pnpm exec tsx scripts/spike-local-canonical-write/run.ts --chain
pnpm exec tsx scripts/spike-local-canonical-write/run.ts --time
```

`SPIKE_WORKERS`로 대조 프로세스 수를 지정할 수 있다. 시간 측정은 대조 프로세스를 모두 종료한 뒤 별도로 실행한다. 공개 PDF도 포함하려면 [플러그인의 표본과 변환 코드](https://github.com/litzio/plugins/tree/0f06da6f2ad5760af14431ec02d55b612d86bdc2/plugins/document-import)를 임시 폴더에 복사하고 그 폴더에서 `npm ci --ignore-scripts`를 실행한다. 원본 플러그인 폴더는 읽기만 했다.

```powershell
pnpm exec tsx scripts/spike-local-canonical-write/convert-public.ts <plugin-copy> <output.md>
$env:SPIKE_PDF_MARKDOWN = "<output.md>"
pnpm exec tsx scripts/spike-local-canonical-write/run.ts
```

PDF 실험은 추출·권장 쪽 제외·변환·작성 입력과 Core 문서 작성을 사용한다. 그림은 상대 경로를 넣고 이미지 바이트를 만들지 않는다. `SPIKE_SUITE=pdf`로 변환본만 따로 대조할 수 있다.

## 결과와 한계

`--chain`은 12회 편집에 대해 전체 바이트, 전체 의미, 새로 읽은 범위 지도의 일치를 확인한다. 마지막 미주 호출을 지우면 양옆 파싱만으로는 먼 곳의 미주 삭제를 놓치는 반례도 확인한다.

공개 PDF 변환본 87블록에서 편집 1,892건 중 441건이 국소 경로를 통과했고 그중 불일치가 0건이었다. 합성 문서와 공개 표본의 결과를 일반 입력으로 확대하려면 미주·링크 정의·이름표·번호, 문서 단위 재시도와 블록 경계의 원거리 효과를 설명해야 한다. 제품에서의 HTTP 저장, 파일 교체, 편집기 수집과 실제 사용 적중률은 범위 밖이다.

## 현재 결정과 어긋나는 점

이 실험은 국소 확인만으로 후보 바이트를 만들어 전체 왕복을 수행하는 공식 경로와 대조한다. 실행 범위는 스파이크의 메모리 안에 있는 사본이다.

## 추천

승인된 Host 결과를 재사용하는 1단계를 먼저 구현한다. 이후 본문 한 줄 문단과 표 칸의 글자·인라인 수식을 전체 쓰기가 최종 판단하는 병행 대조로 검증하는 것을 권한다.
