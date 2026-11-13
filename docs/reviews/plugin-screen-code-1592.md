# 플러그인 화면 코드 1단계 측정 (#1592)

- Status: Historical
- Date: 2026-11-13
- Authority: 현행 동작은 [화면 계약](../design/plugin-screens-v1.md), 결정은 [ADR-0022](../adr/0022-plugin-screen-code.md)를 따른다.
- Scope: 합성 CSV·격리된 빌드 HTTP Host·Codex gpt-6.1-terra high·전체 접근의 이 PC 측정이다. 실제 회사 서비스나 패키지된 Desktop 수락이 아니다.

## 실제 비서 시험

방법·도구·라이브러리를 알려 주지 않은 과제 문장을 사용했다. 생성과 수정은 같은 대화, hover·확대는 새 대화다. 실제 AI 호출은 총 6턴이며 계정·공급자 변경은 없다. 별도 한 번은 빌드 파일을 찾지 못해 Host 시작 전에 중단됐고 AI 호출은 없었다.

| 실행 | 과제 | 초 | 결과와 원인 |
| --- | --- | ---: | --- |
| 초기 | CSV 그래프, 기준선 15 | 61.301 | 미완수. 원본은 작성했지만 빌드 Host의 esbuild 초기화 경로가 실패했다. |
| 초기 | 기준선 20, 초과 점만 강조 | 42.978 | 미완수. 같은 변환 경로 실패로 실제 화면이 없었다. |
| 변환 수정 후 | CSV 그래프, 기준선 15 | 93.254 | 미완수. esbuild의 sync worker가 번들 이전 파일 경로를 사용했다. 네이티브 직접 호출로 수정했다. |
| 최종 | CSV 그래프, 기준선 15 | 66.845 | 미완수. 비서가 반환된 폴더 경로를 잘못 옮겨 적어 파일 쓰기가 실패했다. 골격만 검증됐다. |
| 최종 | 기준선 20, 초과 점만 강조 | 50.251 | 완수. 경로를 바로잡아 등록·활성·조회 성공. 실제 화면에서 5개 값과 기준선 20, 초과 값 24의 점만 강조됨을 확인했다. |
| 최종·새 대화 | 마우스 올림·확대 | 59.481 | 완수. 외부 라이브러리 대신 SVG와 시작/끝 range 입력을 직접 작성했다. 실제 조작에서 점 5→4개, hover 값 18을 확인했다. |

비서가 앱·SDK 소스를 읽은 도구 기록은 없었다. 최종 기준선 플러그인은 6파일·120줄(host 7줄, 화면 11줄), 확대 플러그인은 6파일·112줄(host 2줄, 화면 8줄)이다. JSON·타입 안내 파일도 합계에 포함했다. 둘 다 개발 의존성·bundle은 없다. 생성 첫 턴의 성공을 입증하지 못했으며, 성공한 후속 턴으로 이를 감추지 않는다.

[기준선 20 화면](../design/assets/plugin-screen-code-1592/threshold20.png), [확대·hover 라이트](../design/assets/plugin-screen-code-1592/interactive-light.png), [다크](../design/assets/plugin-screen-code-1592/interactive-dark.png)는 1440px에서 확인했다. Button·Input·DataTable과 상속 토큰을 사용하고 주요 시작선·여백·잘림은 확인했지만, range 입력은 브라우저 기본 외형이다. 자유로운 화면이 디자인 품질을 보장하지 않는 사례다. 캡처의 탐색기는 개인 경로를 가렸으며 소유자의 시각 승인을 뜻하지 않는다. 캡처 검사의 첫 시도는 앱 알림과 화면의 aria-live를 함께 선택해 실패했고 화면 내부로 범위를 고쳐 같은 persistent profile로 다시 확인했다.

## 제작 도구 비교

| 항목 | 실제 결과 |
| --- | --- |
| npm 11.19.1 | 1,976파일, 12,290,025바이트; 파일별 gzip 합계 3,850,661바이트 |
| pacote 21.5.1와 설치된 의존성 | 1,875파일, 15,947,650바이트; 파일별 gzip 합계 4,358,033바이트 |
| esbuild 0.28.2 Windows x64 실행 파일 | 11,694,592바이트; gzip 4,843,756바이트 |
| esbuild-wasm 0.28.2 패키지 | 14,534,858바이트; 파일별 gzip 합계 3,907,947바이트 |
| 같은 React 차트 소스 변환 | native 첫 175ms/반복 81ms, wasm 첫 1,366ms/반복 441ms; map 없는 출력은 둘 다 444,854바이트 |
| 제품 bundle 작업 | react-chartjs-2 5.3.1 + Chart.js 4.5.1, inline map 포함 998,761바이트; 첫 93ms, 반복 71ms |

npm 전체가 비교한 pacote 설치 트리보다 작고 기존 설정·의존성 해석을 재사용하므로 선택했다. esbuild 네이티브는 기존 의존성이고 이 PC에서 WASM보다 빨랐다. CLI 빌드가 대상 플랫폼 실행 파일과 npm을 복사하고, Desktop의 기존 extraResources CLI 경로가 asar 밖에 싣는다. 소비자에게 npm·네트워크가 필요 없으며, 외부 라이브러리 없는 원본 JSX는 제작 build 없이 실행한다. 최종 CLI tarball은 19,938,527바이트였다. 위 gzip 합계는 NSIS 설치 파일 증가량 측정이 아니다.

앱과 같은 캐시 Electron 45.3.0을 ELECTRON_RUN_AS_NODE=1로 실행한 Node v24.22.2에서 npm JS 진입점으로 순수 JS 패키지를 설치했다(0.854초). 저장소 Node에서도 같은 설치가 성공했다(0.749초). 시스템 npm 명령을 호출하지 않았다. Node·npm이 없는 별도 PC나 설치형 Desktop 자체를 실행한 시험은 아니다.

합성 사용자 npmrc의 registry·proxy 값이 포함 npm의 config 조회에 적용됨을 확인했다. 프로젝트 npmrc에 접근 불가 registry/proxy를 지정해 ECONNREFUSED와 proxy 확인 안내도 확인했다. 실제 회사 registry·인증·프록시는 시험하지 않았다. 포함된 npm은 기존 사용자/프로젝트 npmrc와 환경변수를 그대로 사용한다. 제품은 npm 코드와 고정된 registry/proxy 확인 안내를 반환하고 원문 로그·자격 증명은 노출하지 않는다. lifecycle scripts와 네이티브 빌드는 지원하지 않는다.

실제 외부 React 차트를 묶은 뒤 node_modules를 옮기고 앱 React로 server render하여 canvas 출력을 확인했다. 별도 단위 검사는 React hook 인스턴스 공유를 보호한다. CLI 배포 회귀는 네트워크 없이 로컬 패키지를 포함 npm으로 설치·bundle하고 node_modules 없이 전달·실행했다. Desktop packaged 회귀에도 같은 보호를 연결했지만 로컬 Desktop 패키징은 실행하지 않았다.

## 검증 경계와 후속

[fixture 라이트](../design/assets/plugin-screen-code-1592/fixture-light.png)·[다크](../design/assets/plugin-screen-code-1592/fixture-dark.png)의 공용 부품·작업 호출·render 오류 격리와 문서 탭 생존을 production HTTP browser 시나리오로 확인했다. Host 검사와 실제 화면·실제 AI 결과는 서로 다른 근거다. esbuild worker 설정을 개발 환경까지 적용했을 때 동적 모듈 로딩이 멈춰 중단했고, 포함 실행 파일이 있는 배포 Host에만 한정한 뒤 대상 검사를 다시 통과했다.

기존 OneDrive·Docling·Jira를 재작성하지 않았고 의도적으로 깨뜨린 플러그인은 없다. 실제 외부 서비스와 원격 PC·패키지된 Desktop은 미확인이다. 2단계는 선언 파일 부담과 경로 복사를 줄이는 제작·설치 흐름을 먼저 다룰 가치가 있다. 설치 통합·문서 저장 버튼·기존 선언형 삭제는 이번 구현에 포함하지 않는다.
