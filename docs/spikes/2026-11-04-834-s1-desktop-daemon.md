# 2026-11-04 S1: Desktop을 인증된 공유 daemon에 연결 (#834)

- Status: Historical
- Date: 2026-11-04 (브랜치 마지막 커밋일, KST)
- 결론: **채택(방향)** — ADR-0016(공유 로컬 daemon Host)이 이 S1 결과를 근거로 승인됐다. 코드는 병합하지 않았다.
- 범위: 스파이크 기록이다. 스파이크 코드는 master에 들어가지 않으며 현재 제품 계약이 아니다. 정책은 [스파이크 기록](README.md)을 따른다.

## 목적

같은 PC에서 Desktop과 브라우저가 하나의 인증된 공유 HTTP Host(daemon)를 쓸 수 있는지 확인한다.

## 무엇을 만들었나

- Desktop이 서버 먼저·Desktop 먼저 두 순서로 하나의 daemon에 연결하고, 동시 실행 시 단일 daemon을 유지한다. 브라우저·CLI는 인증된 Root 추가를 쓴다.
- daemon 탐색(`s1-discovery`), 인증 프록시(`s1-proxy`), Desktop 기능 차이와 버전 정책을 정리했다.

## 결과·관찰

- 판정: 같은 PC의 공유 HTTP Host로 연결할 수 있다. 다만 URL 교체만으로 통합이 끝나지 않는다. 휴지통 계약, 샘플 Root 수명, origin별 복구, daemon 종료 시 다른 클라이언트 처리 등이 남는다.
- 1단계 통합 비용은 "중간"으로 재평가했고, 이 S1 코드의 직접 병합은 권장하지 않았다.
- 기존 Core·CLI·Desktop 검사와 `browser:test http-host`가 통과했다.

## 결론/후속

- 결론: **채택(방향)**. ADR-0016(공유 로컬 daemon Host)이 이 S1 결과를 근거로 승인됐다. 코드는 병합하지 않았다.
- 관련 이슈·PR·문서: [Discussion #834](https://github.com/litzio/litzio/discussions/834) · [ADR-0016](../adr/0016-shared-local-daemon-host.md)

## 코드 위치

- 태그: [`spike/2026-11-04-834-s1-desktop-daemon`](https://github.com/litzio/litzio/tree/spike/2026-11-04-834-s1-desktop-daemon)
- 브랜치: [`spike/834-s1-desktop-daemon`](https://github.com/litzio/litzio/tree/spike/834-s1-desktop-daemon) (master 대비 커밋 1개)
- 마지막 커밋: [`252ff4c5`](https://github.com/litzio/litzio/commit/252ff4c5a7b3b9f25ca31940c3d1dfdb2df33716)
- 당시 기록(태그 기준): [S1 Desktop daemon spike 보고서](https://github.com/litzio/litzio/blob/spike/2026-11-04-834-s1-desktop-daemon/docs/reviews/s1-desktop-daemon-spike.md)

## 스크린샷

이 저장소(master)에 있는 스크린샷은 없다. 브랜치에 캡처가 있으면 위 태그 링크에서 볼 수 있다.
