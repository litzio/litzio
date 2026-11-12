# 2026-10-31 Docling 플러그인 런타임 (신뢰된 worker)

- Status: Historical
- Date: 2026-10-31 (브랜치 마지막 커밋일, KST)
- 결론: **보류** — 방향은 ADR-0012로 승인됐으나(2026-10-31, Discussion #767) ADR-0012가 "두 spike 구현을 채택하지 않는다"고 명시했다. 이후 플러그인 구조는 ADR-0020이 다시 정의했다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

데몬 없이 기존 Desktop Host와 독립 HTTP Host가 첫 신뢰 모듈(Docling worker)을 등록·실행·장애 격리·비활성화할 수 있는지 확인한다.

## 무엇을 만들었나

- 사용자 폴더 `~/.ieumdoc/modules`의 `registry.json`에 설치본과 활성 여부를 두고, 요청 UUID마다 `runs/<UUID>`와 `run.json` 영수증을 쓴다.
- `module register|enable|disable|list` CLI와 `GET/POST /api/docling-module`. `IEUMDOC_MODULE_RUNTIME=1`로 opt-in하고 새 요청마다 레지스트리를 다시 읽는다.
- 기존 `convertDoclingPdf`를 번들한 자식 프로세스로 실행한다. 권한은 선언이며 OS 샌드박스가 아니다.

## 결과·관찰

- 정상 변환은 합성 REST로만 통과했고 실제 Docling은 미검증이었다(로컬 8001 연결 거부).
- 프로세스 kill·시간 초과 격리, 원본 PDF/JSON 불변, 부분 출력 미공개, 요청 ID 중복 제거, 비활성화(진행 중 요청은 완료), Desktop·serve 양쪽, 공유 사용자 설치가 통과했다.
- 한계: 패키징된 Desktop·Edge 미실행, PID 재사용·원격 파일시스템·잠금 잔존 미해결, POSIX rename 경쟁 미해결.
- ADR-0011의 정적·동적 로딩 금지 결정과 충돌한다고 적었다.

## 결론/후속

- 결론: **보류**. 방향은 ADR-0012로 승인됐으나(2026-10-31, Discussion #767) ADR-0012가 "두 spike 구현을 채택하지 않는다"고 명시했다. 이후 플러그인 구조는 ADR-0020이 다시 정의했다.
- 관련 이슈·PR·문서: [Discussion #767](https://github.com/litzio/litzio/discussions/767) · [Discussion #834](https://github.com/litzio/litzio/discussions/834) · [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md) · [ADR-0020](../adr/0020-plugin-architecture.md)

## 코드 위치

- 태그: [`spike/2026-10-31-docling-plugin-runtime`](https://github.com/litzio/litzio/tree/spike/2026-10-31-docling-plugin-runtime)
- 브랜치: [`spike/docling-plugin-runtime`](https://github.com/litzio/litzio/tree/spike/docling-plugin-runtime) (master 대비 커밋 1개)
- 마지막 커밋: [`3d4cb6e1`](https://github.com/litzio/litzio/commit/3d4cb6e139313ab458f841f5c1514dadc3e21470)
- 당시 기록(태그 기준): [Docling runtime spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-10-31-docling-plugin-runtime/docs/reviews/docling-plugin-runtime-spike.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
