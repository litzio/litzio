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

같은 스레드의 무한 실행은 앱을 멈출 수 있다. 예외 격리와 다르며, 모듈 전역 타이머·구독 정리는 플러그인 작성자의 책임이다.

## 2단계 — 제작·설치와 신분증 축소

기준은 같은 합성 CSV(time/value, 10·18·12·24·16)와 Codex gpt-6.1-terra high다. 계정·공급자를 바꾸지 않았고 총 7턴이다. 방법·도구·라이브러리 없이 과제만 주었다. CLI 배포 Host를 별도 데이터로 실행했고 설치된 앱·기존 daemon은 사용하지 않았다. 열린 폴더 권한으로 파일을 편집하고 manage_plugins install을 호출했다. 공급자 CLI로 설치를 직접 실행한 근거는 없다. CLI reset guard를 바꾸지 않았으며 제한 권한의 대안은 같은 Host install 작업을 호출하는 관리 도구다.

### 줄 수와 선택

1단계 실제 제작물은 6파일 112~120줄이었다. 내역을 재현할 수 있도록 이전 커밋의 **기본 screen scaffold**도 별도로 생성했다(6파일 94줄). 실제 비서가 수정한 결과의 줄 수와 골격의 줄 수는 다르다. 아래는 동일 screen 골격의 전후이며 빈 줄도 세되 마지막 개행은 추가 행으로 세지 않았다.

| 파일·항목 | 전 | 후 | 분류와 이유 |
| --- | ---: | ---: | --- |
| litzio-plugin.json | 62 | 7 | 신분증에 id/name/icon/실행·화면 위치와 공개 작업만 남김. schemaVersion/tier/publisher/version/requiresSdk 및 빈 contributes 배열은 내부 기본값으로 생략. 화면 전용 operation input/output schema와 screen id/title/primary 중복 선언 삭제. |
| package.json | 6 | 0 | 기본 화면에서는 삭제. host.mjs로 ESM을 지정. 외부 dependencies가 있을 때만 작성. |
| jsconfig.json | 15 | 0 | 코드 화면에서 삭제. 제작 안내에 context·React·ui·invoke 계약 제공. |
| plugin-sdk.d.ts | 6 | 0 | 코드 화면에서 삭제. 플러그인마다 복사하지 않음. |
| host.js → host.mjs | 1 | 13 | 실행 코드 유지. 기본값은 같으며 읽기 쉽도록 여러 줄로 표시. |
| screen.jsx | 4 | 11 | 화면 코드 유지. 읽기 쉽도록 여러 줄로 표시. |
| 합계 | 94 / 6파일 | 31 / 3파일 | 선언·타입 부담 89→7줄. 줄 수를 줄이려고 실행·화면 코드를 압축하지 않음. |

실제 분리 권한 시험의 그래프는 3파일 41줄, 표는 3파일 42줄, 마지막 새 대화의 그래프는 3파일 48줄(host 24, 신분증 1, 화면 23)이었다. 비서가 신분증 JSON을 한 줄로 쓴 결과도 그대로 셌다. package.json과 타입 파일이 없다. 기본 골격과 실제 결과 모두 목표 파일 수에 들어간다.

### 턴별 결과

| 실행 | 과제 | 초 | 결과·원인 |
| --- | --- | ---: | --- |
| 초기 1 | 기준선 15 그래프 생성 | 84.370 | 설치·활성 성공. 브라우저 확인 전. 열린 폴더가 Host 설정 폴더까지 포함하여 제한 권한 근거로는 제외. |
| 초기 2 | 기준선 20·초과 점 강조 | 13.962 | 수정·재설치 성공. 같은 대화. |
| 초기 3 | 새 대화, 표·필터·합계 | 58.110 | 설치 성공. 위와 같은 권한 시험 한계. |
| 분리 권한 1 | 기준선 15 그래프 생성 | 58.901 | 첫 턴 설치·조회 성공. 촬영 스크립트의 Origin 헤더 누락으로 catalog 응답을 잘못 읽어 브라우저 확인 실패. 제품 실패로 은폐하거나 화면 성공으로 계산하지 않음. |
| 분리 권한 2 | 기준선 20·초과 점 강조 | 26.047 | 수정·설치와 브라우저 5행 확인 성공. 실제 화면에서 24 점 강조 확인. |
| 분리 권한 3 | 새 대화, 표·필터·합계 | 55.269 | 설치·브라우저 5행과 합계 80 표시 성공. 필터 조작은 별도 확인 범위. |
| 최종 새 대화 1 | 기준선 15 그래프 생성 | 63.022 | **첫 턴 성공**. 설치 후 실제 화면에서 5개 점과 기준선 15·표 확인. Origin을 보완한 브라우저 실행 통과. |

분리 권한 시험은 CSV 폴더만 열고 Host 설정 폴더를 그 밖에 두었다. install의 파일·위치 오류, 수정 재실행과 비공개 handler의 CLI/assistant 거부는 Host 회귀에서 별도로 확인했다. 비서는 화면을 보지 못했다고 응답했고, 위 화면 판정은 시험자가 실제 브라우저에서 확인한 결과다. 첫 시험의 후속 성공으로 첫 화면 확인 실패를 감추지 않는다.

[최종 생성 첫 턴·기준선 15](../design/assets/plugin-screen-code-1592/stage2-first15.png), [기준선 20·24 강조](../design/assets/plugin-screen-code-1592/stage2-threshold20.png), [표·합계](../design/assets/plugin-screen-code-1592/stage2-table.png)는 1440px 라이트다. 개인 경로·계정 영역을 가렸고 캡처를 직접 확인했다. 공통 버튼·입력·표와 상속 토큰을 사용하지만 SVG·카드의 세부 디자인 품질이나 소유자 시각 승인을 뜻하지 않는다.

### 정한 것과 이유·검증 경계

- 별도 manifest 버전 협상 대신 최소 신분증을 기존 내부 manifest로 정규화했다. 과도기 기존 선언형 경로를 재사용하기 위한 가장 작은 변경이다. 한 플러그인에서 두 방식을 섞는 것은 거부한다.
- 비공개 handler의 효과를 선언하지 않으므로 실패 receipt는 uncertain으로 처리한다. 공개 작업은 기존 effect·schema·receipt를 따른다.
- 외부 dependencies 다운로드는 기존 명령을 유지하고 install이 필요한 bundle을 재생성한다. 기본 JSX에는 다운로드·bundle 파일이 필요 없다.
- 새 UI·디자인 부품·화면의 문서 저장은 추가하지 않았다. 패키지된 Desktop·원격 PC·실제 외부 서비스·회사 registry/proxy는 미확인이다. 기존 선언형 플러그인 소스는 바꾸지 않았다.


### Windows queue packaged 검사 시간 보완

queue run 43363194407에서 Windows host·plugins 양쪽의 packaged CLI 검사가 기존 60초 제한을 넘겨 취소됐다(관측 67.5초). 타이머는 tarball 생성 뒤의 npm 설치부터 Host·외부 플러그인·두 Root 저장·정리까지를 합친 값이다. 단순 재시도로 처리하지 않았다.

같은 PC의 Windows Node 24.22.2/npm 11.14.1에서 각 실행마다 별도 빈 npm cache와 보존 자료 폴더를 사용했다. tarball은 2,516파일·19,938,792바이트였으며 포함 npm은 1,976파일이다. CLI package 작업 전체는 23.14초, 이미 빌드된 dist의 tarball 생성만 별도 실행한 시간은 5.99초였다. 두 값은 test의 60초 타이머 밖이다.

| 단계 | 원래 위치 인수 설치 | 의존성 사전 선언 설치 |
| --- | ---: | ---: |
| 오프라인 npm 설치 | 14.00초 | 9.34초 |
| npm idealTree:userRequests (설치 시간에 포함) | 4.55초 | 0.00초 |
| npm idealTree:#root (설치 시간에 포함) | 4.48초 | 4.23초 |
| npm reify:unpack (설치 시간에 포함) | 4.06초 | 4.14초 |
| shim | 0.32초 | 0.31초 |
| Node version/check/format | 1.28초 | 1.27초 |
| Host 시작 | 1.19초 | 1.18초 |
| 포함 npm으로 로컬 라이브러리 설치 | 1.09초 | 1.09초 |
| bundle | 0.10초 | 0.11초 |
| 두 Root 저장·기여·환경 확인 | 0.37초 | 0.38초 |
| daemon lock 충돌 | 1.10초 | 1.10초 |
| 전체(자료 폴더 보존, 정리 제외) | 22.02초 | 17.32초 |

테스트 프로젝트 package.json에 같은 file tarball 의존성을 미리 선언하고 npm install --offline으로 설치해 중복 manifest 해석을 제거했다. 실제 npm 설치·Windows shim·SDK·외부 라이브러리 설치와 bundle·저장·충돌·종료 보호를 모두 유지한다. 제한은 우선 60초 그대로이며 CI에는 단계 시간과 npm 내부 시간을 출력한다. 관련 테스트/공용 fixture 변경은 기존 Windows HTTP 두 job을 PR에서도 선택하고 aggregate가 이를 요구한다.

#1597 기준과 #1599 head를 대조하면 이 packaged 테스트·외부 fixture·배포 build 구성은 바뀌지 않았고 npm install/bundle 호출 횟수도 같다. #1599의 새 install 작업은 이 fixture가 호출하지 않는다. 따라서 새 설치 작업의 중복 활성화가 이 timeout 원인이라는 근거는 없다. 포함 npm의 많은 파일을 가진 tarball을 여러 번 해석·추출하는 기존 작업량이 크며, #1599 이전 queue에서도 48.6/57.3초였다. 실패 run에는 단계 출력이 없어 그 67.5초의 세부 배분은 확정하지 않는다. 일반 사용자도 이 payload 설치 비용을 지불하지만 이번 수정은 테스트의 중복 해석을 줄인 것이며 제품 설치 자체가 빨라졌다고 주장하지 않는다. 실제 Windows CI 측정과 통과 여부는 PR의 후속 검증 기록을 따른다.
