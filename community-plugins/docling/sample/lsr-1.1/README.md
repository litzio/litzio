# LSR 1.1 보관 자료

출처: 소유자 제작 합성 자료. 관련: [#1450](https://github.com/litzio/litzio/issues/1450), [Docling 플러그인](../../README.md).

이 정본은 입력 PDF와 작성자 기대 구조의 고정본이다. `ground_truth`는 작성자가 변환 전에 정의한 기대 구조이며 **Docling 출력의 정답이나 품질 합격선이 아니다**. 공식 규격이나 일반적인 변환 정확도의 대표 표본으로 해석하지 않는다. 이 폴더는 보관 용도이며 CI·테스트·채점 도구·변환 실행을 제공하지 않는다.

## 포함 파일

- `LSR-1.1-standards.pdf`: 13쪽 합성 가상 규격 입력.
- `LSR-1.1-standards-no-bookmarks.pdf`: 북마크 유무를 비교하기 위한 입력.
- `LSR-1.1-standards-answer-key.pdf`: 작성자 기대 구조를 주석으로 표시한 참고 PDF.
- `ground_truth/standards.json`, `ground_truth/standards-no-bookmarks.json`: 각 입력의 작성자 기대 구조. 원본의 schema 표기와 provenance는 그대로 유지한다. provenance에 언급된 생성 스크립트는 이 보관본에 포함하지 않는다.
- `converted/document.json`, `converted/conversion-record.json`: 기존 실험에서 재사용한 Docling 결과와 변환 기록. API 상태·변환 시각은 미수집이며, 13쪽 모두에 항목이 있음을 기록한다. 전체 항목의 의미 정확도나 누락 없음을 보증하지 않는다.
- `LICENSES.md`, `resources/fonts/*-LICENSE.txt`: 원본 라이선스와 폰트 고지.
- `SHA256SUMS`: 이 파일 자체를 제외한 보관 파일의 SHA-256과 폴더 기준 상대 경로.

## 설계 범위

북마크와 제목 계층·목차·부록, 본문과 제목의 구분, 복잡한 표와 셀 수식, 위첨자·페이지/표 주석의 범위, 부등호·소수·부호·단위, 페이지를 넘는 표와 문단, 다단 이름 목록, 원문 오탈자 보존, 그림·그래프와 캡션, 수식 번호의 연결 등을 담는다. 이 항목들은 합성 입력의 설계 범위이며 변환 성공을 뜻하지 않는다.

## 라이선스와 보관 경계

합성 내용과 작성자 주석·기대 구조는 CC0 1.0 Universal이다. 원문 [LICENSES.md](LICENSES.md)를 함께 보존한다. 그 문서의 스크립트 MIT 고지는 원본 묶음에 대한 설명이며 이 폴더에는 스크립트가 없다. 폰트에는 별도 [DejaVu](resources/fonts/DejaVu-LICENSE.txt), [Noto CJK](resources/fonts/Noto-CJK-LICENSE.txt) 고지가 적용된다. 별도 폰트 바이너리는 포함하지 않는다.

전체 reference ZIP, 보고서, 별도 페이지 이미지, 제3자 규격 자료는 포함하지 않는다. JSON 안의 embedded 이미지는 Docling 출력 그대로 보존한다. 기존 PDF·기대 구조·고지는 체험용 샘플로 배포된다. CLI는 지정 커뮤니티 플러그인의 명시적 공급 파일 목록만 복사하고 Desktop은 그 CLI 산출물을 사용하므로 새 converted/는 배포되지 않는다. 새 화면 기능은 제공하지 않는다.

측정·실험에서는 [고정 변환 결과 재사용 지침](../../README.md#측정실험용-고정-변환-결과)을 따른다.

## 개정

입력 PDF나 작성자 기대 구조를 개정할 때는 이 버전을 덮어쓰지 않고 새 버전 폴더를 만든다. 새 폴더에 해당 입력·기대 구조·라이선스 고지를 함께 보관하고 SHA-256 목록도 새로 작성한다.
