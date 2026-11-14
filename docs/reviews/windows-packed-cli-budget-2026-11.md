# Windows packed CLI 검사 예산 측정

- Status: Historical
- Last verified: 2026-11-14 (GitHub merge_group job 로그의 JSON stage·npm timing과 검사 소스 직접 대조).
- Scope: #1645. 단일 60초 packaged 검사의 예산 진단. 제품 성능 목표나 일반 사용자 설치 시간의 보장은 아니다.
- Authority: 현재 실행 방법은 [검증 안내](../test/README.md), 검사 설계는 [테스트 설계 지침](../contributing/test-design.md)을 따른다.

## 표본과 원인

최근 성공한 제품 merge_group 네 실행의 Windows host/plugins 양쪽 job과 실패 실행의 양쪽 job을 비교했다. 아래 단위는 초다. 준비는 tarball 복사·npm 버전 조회, CLI는 설치 shim과 Node version/check/format, 플러그인은 scaffold부터 SDK·CLI 왕복·dependencies·bundle·private import 거절·unregister까지다. 마지막 열 앞의 나머지는 자산/비서 환경/두 Root 저장·lock 충돌·종료·정리다. 반올림으로 합계가 0.001초 다를 수 있다.

| run / Windows job | 준비 | offline npm | CLI | Host 시작 | 플러그인 전체 | 나머지 | 총합 | 60초 여유 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [43525834850](https://github.com/litzio/litzio/actions/runs/43525834850) / host | 0.282 | 10.404 | 4.649 | 1.137 | 18.672 | 1.659 | 36.802 | 23.198 |
| 같은 run / plugins | 0.197 | 8.436 | 3.788 | 0.850 | 14.922 | 1.269 | 29.462 | 30.538 |
| [43537301695](https://github.com/litzio/litzio/actions/runs/43537301695) / host | 0.262 | 11.886 | 4.404 | 1.083 | 20.667 | 1.567 | 39.869 | 20.131 |
| 같은 run / plugins | 0.327 | 14.527 | 4.044 | 0.963 | 37.369 | 1.719 | **58.949** | **1.051** |
| [43539675752](https://github.com/litzio/litzio/actions/runs/43539675752) / host | 0.291 | 10.001 | 4.151 | 1.226 | 20.370 | 1.986 | 38.025 | 21.975 |
| 같은 run / plugins | 0.274 | 9.447 | 4.224 | 1.173 | 18.948 | 1.876 | 35.943 | 24.057 |
| [43539905346](https://github.com/litzio/litzio/actions/runs/43539905346) / host | 0.237 | 10.232 | 5.297 | 1.072 | 17.726 | 1.722 | 36.287 | 23.713 |
| 같은 run / plugins | 0.267 | 9.260 | 4.227 | 1.190 | 17.745 | 1.853 | 34.542 | 25.458 |
| [43552160205](https://github.com/litzio/litzio/actions/runs/43552160205) / host (성공) | 0.208 | 11.876 | 3.518 | 0.921 | 20.396 | 1.519 | 38.439 | 21.561 |
| 같은 run / plugins (실패) | 0.307 | **49.514** | 4.461 | 1.168 | 20.333 | 2.027 | **77.811** | **−17.811** |

실패 run의 npm 자체 `command:install`은 48.940초이며 `idealTree:#root` 27.474초와 `reify:unpack` 21.427초가 대부분이다. 네트워크 없는 tarball 설치 경로의 이상치이고 Host 시작 지연은 아니다. 로그만으로 Windows 파일 검사·디스크·runner 경쟁 중 무엇이 원인인지는 확정하지 못했다. 성공 run도 58.949초이므로 재실행 성공만으로 해결됐다고 판단할 수 없다.

## 플러그인 개편 뒤 추가된 비용

개편 전 commit `422e0c1e`의 [43331340290](https://github.com/litzio/litzio/actions/runs/43331340290)은 같은 검사 본문이 Windows host 24.182초, plugins 24.650초였다. 당시에는 stage 계측이 없어 각 단계가 몇 초 증가했는지 직접 계산할 수 없다. 서로 다른 runner 결과를 제품 성능 회귀의 단독 증거로 쓰지 않는다.

소스 대조에서 `d42bfffb`는 포함 npm의 외부 라이브러리 설치·화면 bundle·node_modules 없는 실행을 추가했고, `52da087f`는 npm 준비를 일반 Host 시작에서 첫 dependencies 요청의 digest cache 준비로 옮겼다. `9260b192`는 플러그인에서 공식 CLI 왕복을 추가했다. 기존 기본 SDK 검사에 이 보호들이 더해졌지만 합산 60초는 유지됐다.

현재 dependencies 요청은 성공 표본에서 11.626~33.313초다. 성공 43537301695/plugins에서는 33.313초 중 npm 최초 추출이 30.192초이고, 실패 43552160205/plugins에서는 15.438초 중 추출이 13.468초다. **제품의 첫 외부 의존성 요청 자체가 cold npm cache 준비에 수십 초를 쓸 수 있다.** 이것은 별도 제품 경로 관찰이며, 이번 검사 예산 수정으로 빨라졌다고 주장하지 않는다. 이번 실패의 직접 이상치는 offline npm 설치 49.514초였다.

[#1511](https://github.com/litzio/litzio/issues/1511)은 `daemon start` 하위 명령의 종료 대기 실패다. 이번 Host 시작 1.168초는 성공 범위 0.850~1.226초 안이고 실패 지점도 다르므로 같은 원인이라는 증거가 없다. Windows runner 변동성이라는 일반 배경만 겹친다.

## 수정과 검증 범위

설치 한 번과 같은 파일·단일 Host를 공유하는 순차 suite로 나눴다. offline tarball 설치·shim·Node 문서 명령과, 실행 Host의 SDK/화면/자산/비서 환경/두 Root Save·lock·종료 계약은 각각 60초다. 기존 단언을 모두 유지하고 설치가 실패하면 Host를 시작하지 않는다. 기존 Host 시작 15초·lock 명령 10초·정지 fallback 7초는 바꾸지 않는다. suite의 최종 정리는 별도 15초 hook으로 제한한다(기존 정지 fallback 7초와 측정된 1초 미만 파일 정리 포함).

관측된 실패를 새 구간으로 나누면 설치·CLI 54.282초 / Host와 정리 23.529초다. 가장 긴 성공은 18.898초 / 40.051초다. 이 때문에 각 의미 구간의 기존 60초를 유지할 수 있다. 합산 제한만 일괄 늘리거나 재시도하지 않으며, subprocess·설치·Host 횟수도 늘리지 않는다. 동기 npm/CLI가 event loop를 막으면 Node watchdog은 반환 전에 실행되지 못하므로 설치 구간 끝에서도 같은 60초 예산을 직접 검사한다. 이는 제품 성능 기준이 아니며 동기 subprocess를 강제 선점하는 정책까지 추가하지 않는다.

로컬 Windows에서 공식 CLI package 후 분리한 packaged 검사 두 개가 통과했다(설치·CLI 약 5.7초, Host 약 15.8초, stage 총합 22.137초). 전체 typecheck 통과. 로컬 한 번의 통과는 CI 변동성 해소의 최종 증거가 아니며 PR의 Windows/Linux packaged 및 merge queue 결과가 필요하다. 제품 코드는 변경하지 않았다.
