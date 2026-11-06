# 동적 UI 인터뷰 → 흐름도 → 보고서 스파이크

> 이 문서는 최초 실증 시점의 기록이다. 업로드 시점의 미완료 변경·검증 한계·공개 범위는 [업로드 상태](UPLOAD-STATUS.md)를 먼저 확인한다.

2026-11-06. 임시 브랜치 `spike/dynamic-interview-flow`. 기준 SHA `8ffbb07599254aaee7a7c5d7e2cf5cfef19556a2`. 시작 시 변경 없음. 구현 모델은 `paseo inspect $env:PASEO_AGENT_ID --json`으로 확인한 Codex `gpt-6.1-sol`, high. 작업은 이 worktree 안에서만 수행했으며 이슈·PR·댓글·push·merge·추가 에이전트 생성은 하지 않았다. 코드는 검토 가능한 미커밋 변경으로 보존한다.

실제 모델이 주제에 맞는 질문 5개와 흐름도 5개 노드를 만들었다. 전체 폼 값 전달 → 같은 `prepare` 노드의 의견 2회 → 명시적 승인 → Core/Host 공식 문서 생성 → 디스크 재읽기까지 완주했다. 내용 품질의 최종 평가는 소유자가 수행한다.

## 시연

저장소 루트에서 PowerShell로 실행한다.

```powershell
pnpm install --frozen-lockfile
./spike-artifacts/start.ps1
```

`http://127.0.0.1:5196/interview.html`을 연다. 기존 Codex CLI 정상 로그인이 필요하다. 전용 개발 서버이며 제품 daemon·사용자 기본 공급자 설정을 바꾸지 않는다. 자연어로 보고서를 요청하고, 생성된 인터뷰를 채운 뒤 버튼 또는 대화의 `입력 완료`를 사용한다. 노드 클릭 또는 아래 노드 버튼으로 대상을 골라 의견을 보낸다. 마지막 승인 버튼을 눌러야 파일을 생성한다. 문서는 같은 작업 영역에서 기존 Tiptap `DocumentEditor`의 읽기 전용 preview로 열린다. 새 작업은 서버를 재시작한다. 재시작하면 UI 작업은 새로 시작하며 기존 보고서는 보존한다. 기존 `session.json`은 새 실제 요청 때 갱신되므로 검토 증거를 유지하려면 먼저 이 폴더를 별도로 보관한다.

서버 종료 전에 다음으로 비서 연결을 닫고 실행 터미널에서 Ctrl+C로 서버를 종료할 수 있다.

```powershell
Invoke-RestMethod http://127.0.0.1:5196/spike-api/shutdown -Method Post -ContentType application/json -Body '{}'
```

캡처는 서버 없이 [증거 갤러리](index.html)를 브라우저에서 열어 볼 수 있다. [생성 문서](documents/report-8615c3b3-c3ff-4833-94a3-c0376bfad4f6.md), [실제 요청·결과 snapshot](session.json), [호출 검증](verification.json), [파일 검사](file-verification.json)를 보존했다. session은 이번 합성 실험의 신규 대화만 기록한다. 사용자 기존 대화·인증 파일을 열거나 복사하지 않았다.

## 실제 시나리오와 근거

| 단계 | 입력과 결과 | 확인 범위 |
| --- | --- | --- |
| 자연어 요청 | 합성 한빛 연구실 도서 교환 행사, 주민 30명·2시간·10만원 | 실제 UI → 임시 adapter → 공식 Assistant Host → Codex 새 대화 |
| 인터뷰 | 목표·교환 방식·운영 역할·예산·성과/예외의 질문 5개를 모델이 생성 | 사전 질문 목록 없음, Zod 구조 검증, 앱 공통 Button/Input 사용 |
| 폼 제출 | 각 답에 합성 운영 정보 입력 후 대화로 `입력 완료` | 질문·답 전체가 taskId와 함께 같은 conversation의 다음 turn에 공급됨. 호출 입력과 서버 답 snapshot 일치 단언 |
| 흐름도 | 준비·접수·상태 확인·교환·성과 확인 | 실제 응답을 받은 뒤 표시. React Flow 노드·선·선택·drag·zoom, CSS 등장/선 그리기와 fitView |
| 첫 수정 | `prepare`, revision 2: 담당자 1명과 시작 전 체크리스트 추가 | 전달한 node ID·revision·직전 graph 일치, 기존 모든 ID 보존 |
| 둘째 수정 | `prepare`, revision 3: 분실 접수·행사 종료 전 확인 추가 | 첫 의견과 폼 전체도 계속 전달. 최종 보고서에 담당자·체크리스트·분실 처리가 포함됨 |
| 승인·보고서 | revision 4를 명시적으로 승인 | 승인 전에 문서 없음. 모델이 실제 보고서 blocks를 생성. adapter가 공식 `executeDocumentTool('create_document')` 호출 |
| 저장·표시 | 새 `.md`, revision 5 | Core parse/serialize/validateStructure, Host read_document, receipt revision 일치. 기존 이름 재생성 거부·SHA-256 불변. 기존 Tiptap renderer로 동일 재읽기 내용을 표시 |

문서 경로는 adapter가 격리된 `spike-artifacts/documents` 안으로 고정한다. 모델에는 read-only turn만 부여하며, 모델이 파일을 직접 쓰는 대신 사용자 승인 뒤 adapter가 공용 Host 작업을 호출한다. `RootAccess`와 exclusive create를 재사용한다. UI는 문서 의미나 Markdown parser를 구현하지 않는다.

## 검증과 비용

- 이번 구현·검증 경과 시간은 에이전트 시작 07:51:26 UTC부터 프로세스 정리 확인 08:03:27 UTC까지 약 12분이다. 병렬 작업자 없이 진행했다. 추가 유료 라이선스 구매는 없다.
- 실제 AI: Codex CLI `0.166.0`, 모델 요청·반환 모두 `gpt-6-luna`, reasoning `low`. 모델 내부 snapshot 버전은 응답에 없어 미측정. 07:56:29–07:58:30 UTC 사이 5 turn(질문 1·흐름 1·수정 2·보고서 1), 각 약 11–15초. 교정용 추가 AI 요청 없음. 모델 대기 중 임의 타이머로 성공 화면을 만들지 않았다.
- Provider가 제공한 context token usage는 31,149 → 33,784 → 37,377 → 41,222 → 45,255, limit 258,400이다. context 사용량이며 합산 청구 토큰이나 비용으로 해석할 수 없다. input/output/cache별 청구 사용량과 금액은 미측정이다. 구현 에이전트의 사용량/요금도 별도 측정하지 않았다.
- `pnpm browser:test interview-spike`: 최종 1 passed, 34.1초. 기존 persistent Chrome profile(체크아웃 hash), 전용 5196 포트. 첫 시도는 cold module load 동안 시작 검사가 먼저 끝났고 실제 호출 없음. 정상 준비 후 재시도에서 의견 반영 뒤 버튼이 비활성화되는 UI를 검사 코드가 잘못 기다렸으며, 대기 상태 소멸 확인으로 수정했다. 그 runner 소유 process tree를 종료하고 같은 신규 대화/완료된 모델 결과에서 이어서 실행했다. 성공 5회 외 중복 모델 호출은 없었다.
- `pnpm exec tsx --test apps/editor/test/interview-spike.test.ts`: 1 passed. deterministic fixture로 stale revision 거부, 기존 노드 ID 유실 결과 거부, 실패·취소 시 기존 graph/answers/comments 보존, 문서 미생성을 검증했다. 이 결과는 실제 AI 성공 증거가 아니다.
- `pnpm exec tsx spike-artifacts/verify-document.ts`: 공식 경로 재읽기·valid/canonical·덮어쓰기 거부·동일 SHA-256 확인.
- `pnpm --filter @litzio/editor typecheck`: 통과. 초기 editor만 의존성 설치한 상태에서는 Core/SDK 의존성이 빠져 실패했으며 workspace 전체 frozen install 후 해결했다. 기준을 완화하지 않았다. full suite·패키징·CI는 임시 스파이크 범위에서 실행하지 않았다.
- 실제 1440px 모션 12프레임, 모든 단계 1440/640 다크 캡처. 추가 `SPIKE_VISUAL_REPLAY=1`의 `pnpm browser:test interview-spike`는 저장된 실제 결과의 1440/640 모션 및 Tiptap 표시를 재생해 1 passed. 추가 모델 호출 없음. 갤러리는 실제 응답 촬영과 재생 촬영을 구분한다. 640px 문서 폭 초과 없음, reduced-motion animation 없음, 노드 버튼 Tab/Enter·선택 및 zoom/drag를 대표 확인했다. 모든 키보드/스크린리더 조합을 검증한 것은 아니다.

직접 추가한 의존성은 `@xyflow/react ^12.12.1`(현재 lock 12.12.1, MIT)이다. 새 transitive 패키지는 `@xyflow/system 0.0.84`, `classcat 5.0.5`, `zustand 4.5.7`이며 기존 d3 패키지를 재사용한다. pnpm은 기존 shadcn/MCP SDK의 optional peer snapshot에 이미 있던 `@cfworker/json-schema` 연결도 갱신했다. 유료 Pro 기능은 사용하지 않았다. 기능은 [ReactFlow](https://reactflow.dev/api-reference/react-flow)와 [Controls](https://reactflow.dev/api-reference/components/controls)의 공개 API를 사용한다.

## 임시 구조와 제품화 판단

현재 D4는 assistant material context·출처 경로이며, 입력 인터뷰/편집 흐름도는 현재 generated-view 카탈로그가 아니다. 이 스파이크는 기존 명세를 몰래 확장하지 않고 별도 HTML/Vite 진입점으로 만들었다. 제품 구현 완료나 ADR parity 완료를 뜻하지 않는다.

- UI 작업은 `apps/editor/src/dev/interview/`, 임시 요청·revision·승인 adapter는 `apps/editor/server/interview-spike.ts`, 개발 진입점은 `interview.html`·`interview.config.ts`다. `test/browser/run.ts`에는 이 명시적 스파이크 시나리오만 별도 config로 보내는 분기를 추가했다. 기본 stable suite는 바꾸지 않았다.
- 앱/Host가 작업 ID·revision·입력·댓글·승인·취소를 소유하고 모델은 제한된 JSON 데이터만 만든다. 공통 Button/Input, 제품 token·Pretendard·Lucide, 기존 Tiptap renderer를 재사용했다. 다중 줄 입력·노드 캔버스·모션만 이 임시 화면의 표현이다. 새 폼/흐름 부품을 공용 카탈로그·Core 스키마·Host 작업·CLI에 편입할지는 후속 결정이다.
- 현재 임시 UI는 기존 App/AssistantPanel/문서 탭에 꽂혀 있지 않다. 기존 문서 세션의 Save·Undo·복구·결과 카드 guarded Undo, CLI 인터뷰 parity, 저장 뷰·즐겨찾기, 여러 Host·탭·재시작 복원은 미구현이다. report 자체는 native 문서라 기존 Litzio에서 열 수 있다. 제품화 때 새 작업의 Host 공용 계약·CLI, 노드 identity/편집·삭제 정책, 결과 카드/승인/취소/불확실한 파일쓰기 상태를 정해야 한다.
- 노드 좌표는 작은 그래프용 격자 배치다. 모델이 만든 노드와 edge를 쓰지만 DAG 자동 layout·분기 충돌 해소·연결선 직접 편집·노드 직접 rename·파일에 graph 의미 저장은 제공하지 않는다. drag 좌표는 UI에서만 유지하며 새 모델 revision 때 배치를 다시 한다. 선이 겹칠 수 있다.
- 폼은 전체 필수 multiline 텍스트 입력이다. 주제별 질문은 AI가 정하지만 숫자/날짜/선택/조건부 입력 타입은 아직 지원하지 않는다. 일반 대화는 시작·입력 완료·선택 노드 의견의 범위다. 자유로운 다중 의도 라우팅, 입력 완료 동의어, 보고서 이후 수정 대화는 미구현이다.
- 실패·취소 후 이전 내용은 보존한다. schema/provider 오류 자동 재시도와 repair는 없다. UI reload 전 미제출 draft와 서버 재시작 복원은 보장하지 않는다. `session.json`은 증거 snapshot이며 제품 persistence가 아니다. 장기 작업·큰 데이터·실제 개인 문서·원격 Host·인증 만료·모든 실패의 브라우저 UI 통합은 검증하지 않았다.

소유자 후속 결정은 인터뷰/흐름도 catalog 편입 여부, 기존 메인 작업 탭/비서 대화와의 연결 방식, 노드 의견·revision 저장 수명, 최종 보고서에 흐름도를 어떤 native 의미로 남길지다. 이번 결과는 이 경로의 개념적·기술적 연결 가능성을 보이며 제품화 완료를 뜻하지 않는다.

정리한 소유 프로세스·포트의 최종 확인은 [cleanup.json](cleanup.json)에 기록한다. worktree와 임시 브랜치는 보존한다.
