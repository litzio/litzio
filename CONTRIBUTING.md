# Contributing to Litzio

## Project status

Litzio는 **초기 검증** 단계다. 현재 소스는 `0.0.3-beta.1` Beta 후보이며 [준비 기록](docs/releases/v0.0.3-beta.1.md)을 따른다. 최신 공개 버전은 `0.0.2` Stable이다. 직전 공개 버전은 `0.0.2-beta.10`이다. 소스 버전은 [Desktop package.json](apps/desktop/package.json), 최신 공개 결과는 [Stable 배포 기록](docs/releases/v0.0.2.md)을 참고한다. 일반 사용자 설치는 [README](README.md#windows-desktop), 개발자 빌드와 릴리즈는 아래 절차를 따른다. Visual Editor의 Vite 개발 실행도 유지한다. 공개 API와 문서 지원 범위는 바뀔 수 있다.

제품 브랜드·아이콘·배포 식별자는 [패키저용 안내](docs/guides/branding.md)와 `brand.ts`를 따른다. 공식 기본값은 Litzio이며 이전 공개 Beta의 데이터/업데이트 경로를 이전하지 않는다.

## Development requirements

- Node.js `>=24.22.1 <25`
- pnpm `12.5.1` (`package.json`의 `packageManager`)

## Setup

저장소 루트에서 실행한다. 아래는 전체 확인 명령이며, 작업별 로컬 필수 검증은 [Verification matrix](#verification-matrix)를 따른다.

```bash
pnpm install --frozen-lockfile
pnpm docs:check
pnpm typecheck
pnpm test
pnpm --filter @litzio/editor build
```

`pnpm editor`로 개발용 Visual Editor를 시작하고 `http://127.0.0.1:5173`을 연다. `pnpm browser:test`는 매번 빈 포트로 자기 서버를 시작한다. 기존 dev server에 붙이는 디버깅은 `LITZIO_BROWSER_URL`을 명시한다. 선택 실행과 수동 확인은 [검증 안내](docs/test/README.md), Windows의 profile/session 규칙은 [Windows browser automation](docs/contributing/windows-browser-automation.md)을 따른다. 작업 후 직접 시작한 서버와 세션을 정리한다.

## Before changing code

[AGENTS.md](AGENTS.md), [문서 색인](docs/README.md), 관련 Accepted ADR과 Implemented design contract를 먼저 읽는다. 상태와 충돌 판정은 [문서 거버넌스](docs/contributing/documentation-governance.md)를 따른다.

## Architecture boundaries

- 영속적인 문서 의미 변경은 editor-neutral Core operation이 소유한다. [ADR-0015](docs/adr/0015-shared-host-operations.md)에 따라 새 사용자 기능은 Host 공용 작업으로 정의하고 얇은 CLI command를 함께 제공하며, 비서에 필요하면 같은 정의로 도구를 만든다. Editor 전용 interaction은 CLI parity 대상이 아니다.
- Editor는 Markdown 의미를 따로 구현하지 않고 Core의 read model과 operation을 사용한다. CLI도 얇은 인터페이스로 유지한다.
- Tiptap/ProseMirror 타입과 문서 모델은 `apps/editor` 안에 둔다. 하나의 문서 편집 상태를 사용한다.
- `apps/editor/server`의 stateless 파일 handler는 Vite, Desktop, HTTP Host가 공유한다. 제품 backend나 장기 persistence 결정으로 확대하지 않는다.
- 지원하지 않는 의미를 보존할 수 없으면 공식 write path는 fail-closed로 거부한다.

상세 제약은 [AGENTS.md](AGENTS.md#architectural-constraints)와 [ADRs](docs/README.md#architecture-decisions)가 기준이다.

## Contribution workflow

- 하나의 문제에 하나의 응집된 PR을 만든다. 관련 issue가 있으면 연결한다.
- `master`는 repository ruleset `Protect master` (ID `24910269`)로 보호한다. 2026-10-26에 읽기 전용 API로 확인한 설정은 active, bypass 대상 없음, GitHub required approval count 0, `required_review_thread_resolution=true`다. 직접 push, force push, 삭제는 거부되고 PR은 아래 merge queue 절차로 병합한다. Queue와 필수 검사 설정은 [Enqueue](#enqueue)를 따른다. 규칙을 바꿀 때는 API로 확인하고 이 설정 기록도 함께 갱신한다.
- 가장 작고 단순한 변경을 우선하고, 확인되지 않은 필요를 위한 abstraction이나 infrastructure를 추가하지 않는다.
- current behavior를 바꾸면 관련 design document도 같은 PR에서 갱신한다. 새 문서는 [docs index](docs/README.md)에 직접 연결한다.
- historical review의 당시 결과를 현재 계약처럼 고쳐 쓰지 않는다. 상태와 현재 authority를 링크한다.
- 실패 원인을 숨기거나 테스트 기준을 약화해 통과시키지 않는다.

### Review and sequential merge

모든 PR은 다음 순서를 따른다. 구현은 독립 worktree에서 병렬로 진행할 수 있으며, 통합 담당자가 승인된 PR을 GitHub merge queue에 넣는다. Queue가 최신 master와 앞선 PR을 합친 결과를 검증하고 순서대로 병합한다. Queue는 2026-10-26부터 활성화되어 있다([#537 검증 기록](https://github.com/litzio/litzio/issues/537)).

1. PR의 정확한 현재 head에서 PR용 필수 CI aggregate가 성공해야 한다. PR은 품질·Linux browser·Linux HTTP를 검사하며 Windows 검사는 merge queue에서 경로 규칙에 따라 실행한다. 이전 head의 성공으로 대신하지 않는다. master가 이동했다는 이유만으로 최신 master를 PR branch에 직접 merge하거나 다시 검토받을 필요는 없다.
2. 승인은 PR의 위험에 따라 두 가지 중 하나로 한다(2026-10-30 소유자 결정). 어느 쪽이든 구현자 자신의 판단은 승인을 대신하지 않는다.
   - **독립 검토:** 아래 위험 PR은 구현에 참여하지 않은 별도 agent가 최종 diff, 관련 계약과 검증 근거를 독립 검토한다. PR 댓글에 reviewer agent 식별자, `APPROVE` verdict와 검토한 정확한 전체 head SHA를 기록한다. 위험 PR은 editor schema·직렬화·저장 경로, 미저장 draft·복구, 셸 구조 변경, 성능·상태 경합, 문서 데이터를 바꾸는 Core 연산, 보안·릴리스·CI workflow 변경이다.
   - **통합 담당자 확인:** 그 밖의 PR(작은 UI·CSS·문구, 테스트만, 문서만 등)은 구현하지 않은 통합 담당자가 diff, 계약 갱신, 테스트 단언 약화 여부와 검증 근거(시각 변경은 캡처)를 직접 확인하고, 확인 사항과 head SHA를 PR 댓글로 기록한다.
   승인 전에 [Git parsed-trailer 검사](#ai-commit-provenance)로 PR 고유 commit 전체(작성된 merge 포함)의 provenance와 같은 head의 CI 검사 통과를 확인한다.
3. GitHub required approval count 0은 GitHub 서버의 승인 수 설정이며, 위 승인 기록을 생략한다는 뜻이 아니다. 같은 GitHub 계정을 사용하는 agent는 PR 작성자 자신의 PR에 GitHub approve review를 제출할 수 없다. PR 댓글의 승인 기록은 운영상 승인 근거이며 GitHub의 approved review로 계산되지 않는다.
4. 통합 담당자는 enqueue 직전에 PR head가 승인 기록의 SHA와 같은지, 해당 head의 필수 CI가 모두 통과했는지, review thread가 모두 해결되었는지 확인한다. 하나라도 충족하지 않으면 queue에 넣지 않는다. Queue는 최신 master와 합친 결과의 전체 diff에 경로 규칙을 적용하고 필수 aggregate 검사를 실행한다.
5. 수정 commit, 수동 conflict 해결, queue가 보고한 충돌 때문에 필요한 master merge 등으로 PR head SHA가 달라지면 기존 승인을 그대로 재사용하지 않는다. 새 head의 필수 CI는 항상 다시 통과해야 한다. 승인은 바뀐 내용에 따라 다시 받는다.
   - 제품 코드나 테스트 단언이 바뀐 위험 PR은 별도 agent의 새 `APPROVE`를 받는다.
   - 충돌 해결(`git show --remerge-diff <merge>`에서 양쪽 변경 보존 외의 변경이 없음), 문서만의 변경, 단언을 바꾸지 않는 테스트 대기 조건 보완은 통합 담당자가 그 diff를 직접 확인하고 새 head SHA로 확인 기록을 남겨 재승인을 대신한다.
   Queue 실패도 일반 CI 실패처럼 artifact부터 확인하여 원인을 조사한다. PR head가 그대로라면 master 이동이나 queue 재구성만으로 재승인을 요구하지 않는다.

### Enqueue

Ruleset `Protect master`의 `merge_queue` 설정은 merge method `MERGE`, build concurrency 5, group size 최소/최대 1/5, 최소 대기 0분, `ALLGREEN`, check timeout 60분이다. 2026-10-30 소유자 승인으로 동시 build와 group 최대를 1에서 5로 올렸다(API로 확인). 여러 PR이 대기하면 queue가 앞선 PR을 포함한 group을 병렬로 검증해 함께 병합하고, group이 실패하면 GitHub가 나누어 다시 검증한다. 경로 규칙은 group 전체 diff에 적용된다. 필수 검사는 `Core, CLI, Editor, and browser regressions`이며, queue가 켜져 있는 동안 strict up-to-date (`strict_required_status_checks_policy`)는 OFF다. Queue를 비활성화할 때는 strict를 다시 ON으로 설정한다.

위 2단계의 승인 PR 댓글은 다음 형식으로 남긴다. 통합 담당자 확인은 첫 줄을 `Integrator check: <agent-id> (no independent review: <위험 PR이 아닌 이유>)`로 쓰고 확인한 사항을 덧붙인다.

```text
Reviewer agent: <reviewer-agent-id>
Verdict: APPROVE
Head SHA: <full-approved-head-sha>
Required CI: PASSED
Unresolved review threads: NONE
```

위 4단계 확인 후 저장소 루트에서 아래 Bash 명령의 `<N>`과 `<approved-sha>`를 PR 번호와 승인된 전체 head SHA로 바꿔 실행한다. `expectedHeadOid`가 승인 이후 head 변경을 거부한다. `gh pr merge`는 이 저장소에서 허용하지 않는 auto-merge (`enablePullRequestAutoMerge`)를 시도하므로 사용하지 않는다.

```bash
id=$(gh pr view <N> --json id --jq .id)
gh api graphql -f query='mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position state}}}' -f id="$id" -f oid=<approved-sha>
```

Queue의 PR 번호·순서·상태·검증 head와 `merge_group` 실행은 다음 읽기 전용 명령으로 확인한다. Queue의 `headCommit.oid`와 run의 `headSha`를 대조하고 해당 실행의 결과·artifact를 확인한다.

```bash
gh api graphql -f query='query{repository(owner:"litzio",name:"litzio"){mergeQueue(branch:"master"){entries(first:100){nodes{position state pullRequest{number} headCommit{oid}}}}}}'
gh run list --event merge_group --json databaseId,headSha,status,conclusion,url
```

충돌이나 CI 실패로 PR이 queue에서 제거되면 해당 실행의 로그·artifact부터 조사한다(`gh run view <run-id>`, `gh run download <run-id>`). 재등록은 위 4–5단계를 따른다. Head를 수정해야 하면 새 head의 필수 CI와 5단계에 맞는 승인 기록을 갖춘 뒤 다시 enqueue한다.

의존성 패치 목록과 갱신 절차는 [Dependency patch register](docs/contributing/dependency-patches.md)를 따른다.

## Verification matrix

PR은 품질 검사와 Linux Editor browser(8 shard)·Linux HTTP를 실행한다. Linux HTTP는 CLI package·offline 설치와 production Host 연결을 보호하므로 유지한다. 품질의 정책·문서·typecheck·build job과 Linux unit foundation·editor 두 job은 병렬로 실행하며, 두 unit 묶음의 합은 기존 `pnpm test`와 같다.

Windows Desktop unit foundation·editor, Windows HTTP host·plugins, Desktop package+verify+packaged+uninstall, Stable·Beta update는 merge queue와 전체 master fallback에서 경로 규칙에 따라 실행한다. Published 0.0.2 Stable은 릴리스 전용이다. 2026-11-12 CVE-2026-111497로 beta.9 이하 설치 자산을 삭제하여 공개 기준을 beta.6에서 beta.10으로 바꿨고, 이번 후보에서는 최신 공개 Stable 0.0.2로 갱신했다. Windows 전용 결함은 PR 단계가 아니라 queue에서 드러나므로 queue 실패 시 수정·재검토·재진입 비용이 생긴다. queue의 전체 핵심 검사와 모든 단언은 유지한다. PR에서 Windows CI를 수동 실행하는 workflow_dispatch 경로는 없다. 필요하면 기존 로컬 검증 명령을 쓰며 새 수동 workflow는 추가하지 않는다.

테스트 작성·확대와 PR 기록 기준은 [테스트 설계 지침](docs/contributing/test-design.md)을 따른다.

로컬에서는 변경의 고유한 위험에 맞는 관련 패키지 테스트·browser 시나리오를 지정해 실행한다. 영향 범위가 여러 계층에 걸치는 경우가 아니면 전체 `pnpm test`와 전체 `pnpm browser:test`는 로컬 필수가 아니다. 아래 표는 로컬 최소 검증이며, PR head의 PR용 필수 CI aggregate와 Windows를 포함한 queue용 aggregate가 각각 성공해야 한다.

CLI/Desktop `package`, `test:packaged`, release/artifact 검증, 설치·업데이트 회귀와 다른 OS 검증은 해당 패키징·설치/업데이트·배포 경계를 변경한 경우가 아니면 필수 CI에 맡긴다. [CI](.github/workflows/ci.yml)는 항상 quality job의 정책·문서 검사를 실행한다. 문서·아래 정책 도구 allowlist만 바뀐 PR과 merge group은 문서 검사·checker 테스트, diff/whitespace, issue forms·등록 정책, AI provenance 회귀·event commit 검사와 CI 경로 분류 테스트만 실행한다. 나머지는 Linux unit 두 묶음·typecheck·Editor build를 실행하며 추가 job은 아래 경로 규칙과 이벤트 범위로 선택한다. master push는 같은 SHA의 성공한 `merge_group` CI가 확인되면 제품 검사를 생략하고 캐시만 갱신한다. 확인할 수 없으면 전체 실행한다. 실제 GitHub 업데이트·서명·수동 확인은 이 CI의 보장 범위가 아니므로 해당 변경·릴리즈의 별도 절차를 유지한다.

| Change type | Required verification |
| --- | --- |
| Documentation only | `pnpm docs:check`, `git diff --check` |
| Issue forms / registration tooling | `pnpm issues:forms --check`, `pnpm issues:test`, `pnpm docs:check`, `git diff --check` |
| Commit provenance tooling / policy | `node --test scripts/commit-provenance.test.mjs`, `pnpm docs:check`, `git diff --check`; 실제 commit의 Git parsed trailers 확인 |
| CI 실행 정책 / workflow 설정 | `node --test scripts/ci-quality-mode.test.mjs scripts/ci-execution-policy.test.mjs`, workflow 문법 검사, `pnpm docs:check`, `git diff --check`; 변경한 job의 PR CI 결과·단계 시간 확인. 패키징·설치/업데이트 검사는 CI에서 실행 |
| Browser 시나리오 / 캡처 변경 | 관련 `pnpm browser:test <scenario>`, `pnpm typecheck`, `pnpm docs:check`, `git diff --check`; 자동 판정에 쓰이지 않는 성공 캡처·촬영 전용 순회는 `--screenshots` 수동 실행으로 분리 |
| Browser shard / fixture 설정 | `node --test scripts/ci-quality-mode.test.mjs scripts/ci-execution-policy.test.mjs`, `pnpm --filter @litzio/editor exec tsx --test test/browser-fixtures.test.ts`, `pnpm docs:check`, `git diff --check`; PR의 실제 shard CI 결과 확인 |
| Core semantics | Core tests, `pnpm typecheck`, 관련 canonical round-trip/거부 regression |
| CLI | Core/CLI tests, `pnpm typecheck`, 실제 파일 write 및 실패 시 원본 보존 |
| Editor logic | Editor tests, `pnpm typecheck`, `pnpm --filter @litzio/editor build` |
| Host/save behavior | 관련 browser regression과 실제 파일 Save → Reload/충돌 검증 |
| HTTP Host / CLI distribution | 관련 HTTP boundary tests와 production `pnpm browser:test http-host` (실제 Save → Reload/충돌). 공유 handler 변경은 관련 handler tests와 Vite browser 회귀도 로컬 실행하며 Desktop packaged 회귀는 CI에 맡김. CLI 배포 경계 변경 시 CLI package + offline `test:packaged`도 로컬 실행; Windows/Linux 검증은 CI |
| Visual change | `layout-rules` / `quiet-document` 검사와 같은 상태의 Before/After 근거 ([절차](docs/test/README.md#reviewing-a-visual-change)) |
| Dependency change | frozen install, audit/reachability 검토, 영향받는 계층의 전체 관련 regression. MyST·markdown-it/patch/lockfile/parser 설정 변경은 `pnpm --filter @litzio/core test:smartquotes`도 실행 |
| Desktop/update/release | 관련 Desktop tests/typecheck·browser 회귀. 패키징·배포 경계 변경 시 clean Windows package + artifact verification·`test:packaged`도 로컬 실행; updater/installer 변경 시 actual install/update regression도 실행. 해당 경계 변경이 없으면 패키징·설치/업데이트 회귀는 CI |

문서 checker를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다. 검증 명령의 자세한 사용법은 [검증 안내](docs/test/README.md)에 있다.

quality의 제품 검사 생략은 [ci-execution-policy.mjs](scripts/ci-execution-policy.mjs)가 문서 allowlist와 정책 도구 allowlist를 합쳐 판정한다. 문서 allowlist는 [ci-quality-mode.mjs](scripts/ci-quality-mode.mjs)의 루트 `*.md`, `.github` 바로 아래 `*.md`, `docs/**`의 `md/png/jpg/jpeg/gif/svg/webp/ico/pdf/json`이다. 정책 도구 allowlist는 아래에 명시한 경로만 허용하며, 그 외 tooling·설정·제품 fixture Markdown은 전체 quality를 유지한다. `ci-quality-mode.mjs`의 `docs_only` 출력은 문서 전용 판정으로 유지하며 제품 단계는 changes의 `quality` 출력으로 선택한다. 삭제도 변경 경로에 포함하고 rename의 이전·이후 경로를 모두 검사한다. PR은 merge-base diff(`base...head`), merge group은 event payload의 전체 tree diff(`merge_group.base_sha..head_sha`)로 판정한다. diff를 계산할 수 없거나 경로가 비어 있으면 전체 실행한다. `master` push에는 경로만으로 생략을 적용하지 않는다.

정책 도구 allowlist와 확인한 실행 소비자는 다음과 같다. 이 경로들은 제품 빌드·테스트에서 import하거나 실행하지 않는다. CI quality의 항상 실행하는 문서·이슈·정책 검사는 그대로 유지한다.

- `scripts/issues.mjs`, `scripts/issue-policy.mjs`, `scripts/issue-policy.test.mjs`, `scripts/check-issue-event.mjs`: 루트 `issues:*`·`issue:create`, 이슈 정책 테스트와 `.github/workflows/issue-policy.yml`이 소비한다.
- `.github/ISSUE_TEMPLATE/{bug,decision,enhancement,task,config}.yml`: GitHub 이슈 작성 화면이 소비하며, `config.yml` 외 네 폼은 `issues:forms --check`도 검사한다. 디렉터리 전체를 새 allowlist로 확장하지 않는다.
- `scripts/check-docs.ts`, `scripts/check-docs.test.ts`: `docs:check`와 CI의 checker 회귀 검사가 소비한다.
- `scripts/ci-execution-policy.mjs`, `scripts/ci-execution-policy.test.mjs`, `scripts/ci-quality-mode.mjs`, `scripts/ci-quality-mode.test.mjs`: changes·quality의 선택/whitespace 처리와 항상 실행하는 정책 회귀 검사가 소비한다.
- `.agents/skills/**`, `.claude/skills/**`: agent의 지침·오케스트레이션 도구와 Claude 진입점이다. 제품 runtime과 빌드는 로드하지 않는다.

CI 경로 규칙의 기준은 changes job이 호출하는 [ci-execution-policy.mjs](scripts/ci-execution-policy.mjs)이며, 다음 표는 요약이다. PR과 merge group은 같은 분류 함수를 사용한다. 여러 PR이 묶인 group도 전체 diff의 합집합으로 선택하고, 삭제와 rename 양쪽 경로를 포함한다. 혼합 변경은 각 경로가 선택하는 job의 합집합이며, **미분류 경로가 하나라도 있으면 전체 제품 실행**한다. `test/**`는 일괄 생략하지 않는다. smartquotes 의존성 검사는 아래 별도 조건을 따른다.

| PR / merge group 변경 경로 요약 | quality 외 추가 검증 |
| --- | --- |
| `docs/**`, 루트·하위 `*.md`, `.github/ISSUE_TEMPLATE/**`만 변경 | 없음 (아래 패키지·공용 경로에 속하는 Markdown은 해당 경로 규칙 우선) |
| 위 정책 도구 allowlist (이슈·문서·CI 정책 스크립트와 명시된 폼, `.agents/skills/**`, `.claude/skills/**`) | 없음 (전체 변경이 문서·정책 allowlist에 속하면 제품 quality도 생략) |
| 각 패키지의 `package.json` | 소속 패키지 규칙 |
| `packages/cli/**` | http, desktop (CLI bundles official AI; Desktop bundles the CLI) |
| `apps/editor/**`, `packages/core/**`, `packages/file-commit/**` | browser, http, desktop |
| `packages/plugin-sdk/**`, `plugins/onedrive/**`, `community-plugins/**` (Markdown 제외) | browser, http, desktop; 플러그인 전용 변경은 업데이트·제거 전수·레이아웃 전수 제외 (`package.json` 포함) |
| 위 세 플러그인 경로의 `*.md`만 변경 | 추가 job 없음; 제품 quality는 유지 |
| `apps/desktop/**` | desktop + `test:update`·`test:uninstall` |
| Editor의 업데이트 화면(`apps/editor/shared/desktop-bridge.ts`, `apps/editor/src/shell/SettingsDialog.tsx`, `apps/editor/src/shell/MessageArea.tsx`) | desktop + `test:update`·`test:uninstall` (Editor 파일은 Editor 규칙도 함께 적용) |
| 공용 설정·도구 (`brand.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**`, 루트 `tsconfig*`, `.github/workflows/**`, allowlist 외 `scripts/**`) 또는 미분류 경로 | browser, http, desktop + `test:update`·`test:uninstall` |

공식 AI는 Editor Host·UI/shared 계약에 속하며 기존 Editor 경로 규칙으로 검증한다. 현재 플러그인은 ADR-0019·0020을 따른다. SDK는 Host와 같은 browser·http·desktop 검사를 유지한다. `vite-plugins`는 실제 OneDrive를 활성화하고 공통 브라우저 scenario 준비 코드는 Docling fixture를 직접 읽으므로 OneDrive·community-plugins도 browser를 유지한다. production HTTP의 `http-plugins`는 Docling·Jira 소스를 읽고 앱 공통 설정·조회 화면을 검증한다. 세 경로는 Desktop 설치 payload의 입력이므로 queue의 package·대표 제거도 유지한다. 설치 구성 파일인 `packages/cli/scripts/plugin-sdk.ts`, `apps/editor/server/plugins/designated-plugins.ts`, `apps/editor/server/plugins/artifact-digest.mjs`의 기존 전체 제거 분류는 바꾸지 않는다. `.agents/skills/**`는 제품 빌드·실행 입력이 아니므로 추가 제품 job을 선택하지 않는다. 다른 경로와 섞이면 기존 합집합 규칙을 적용하며 소속 패키지 규칙을 유지한다.

패키지 내부 Markdown은 fixture나 배포 입력일 수 있어 패키지 경로 규칙을 적용한다. 위 세 플러그인 경로의 Markdown은 품질만 선택하는 예외다. browser는 Editor 8개 shard로 stable 시나리오를 정확히 한 번씩 실행한다. 목록 순서의 순환 분배를 사용하며 각 shard의 배정은 CI 로그에 출력한다. http는 PR에서는 Linux 전체 묶음, queue/전체 master에서는 추가로 Windows host(`http-host http-plugins`)·plugins(`plugin-jobs plugin-views`) 두 묶음에서 각각 CLI package·`test:packaged`·HTTP browser 회귀를 실행한다. 각 runner의 checkout·daemon·포트·fixture는 독립되며 HTTP crash recovery도 각 묶음에서 유지한다. desktop이 선택되면 clean package·release 자산 검증·`test:packaged`와 대표 제거(silent empty·user·foreign)는 항상 실행한다. Save/Reload·crash recovery·reset 보호는 유지한다. Beta 로컬 feed 설치·업데이트는 기존 `update`, 독립 Stable job은 기존 `fullLifecycle` 출력으로 선택한다. 전체 제거는 같은 보수적 설치 경로 분류를 사용하는 `fullRemoval`로 선택한다. 설치·업데이트 코드, 공유 빌드 입력, unknown 경로는 전체 제거를 실행하며, `update=false`인 빌드 입력 단독 변경도 전체 제거를 선택한다. 나머지 interactive·owner·helper·environment 조합은 일반 변경에서 생략한다. Published 0.0.2 Stable은 PR·merge queue에서 실행하지 않고 릴리스 전 검사에만 남긴다. release workflow와 직접 실행은 전체 제거가 기본이며, Published·Stable·Beta·전체 제거의 성공이 게시를 차단한다. 이 설치·업데이트 e2e는 Editor의 Settings·업데이트 알림·Desktop bridge를 직접 조작하므로 해당 파일도 `update` 대상이다. `App.tsx`의 재시작 거부 판단처럼 그 밖의 Editor 변경은 browser `desktop-updates`(mock bridge)와 Desktop packaged 회귀로 검증하고, 실제 설치·업데이트는 `update` 대상 변경 또는 전체 실행 fallback에서 확인하고, 제거는 위 범위를 따른다. Editor와 CLI는 Core/File commit을 공유하고, Desktop은 Editor 코드와 Host를 직접 사용하며 HTTP용 CLI package도 Editor를 빌드하므로 이 의존 경로를 함께 검증한다.

설치·업데이트·제거의 전체 실행 경로는 `scripts/ci-execution-policy.mjs`의 `lifecycleFullPaths`에 둔다. 공용 설정·의존성·workflow·allowlist 외 scripts 및 미분류 경로, 위 세 플러그인 경로를 제외한 패키지 `package.json`(전체 제거; Stable은 기존 `update=true` 범위 내), `apps/desktop/installer/**`, `apps/desktop/scripts/**`, Desktop updater/channel/서명/preferences/main/preload 및 CLI 소유권·제거·환경 코드는 전체다. Desktop이 복사하는 CLI 배포의 빌드 구성 입력도 `desktopBuildInputs`에 명시한다: `packages/cli/scripts/build.ts`, `apps/editor/vite.config.ts`와 CLI/Core/file-commit/Editor의 `tsconfig.json`. 배포 고지 입력인 `apps/editor/public/licenses/**`도 포함한다. 이 입력만 바뀔 때 기존 `update=false`는 유지하지만 전체 제거는 실행하며, 업데이트 대표 경로와 혼합되면 Stable도 전체로 승격한다. 제거 전용 `removalBuildInputs`에는 SDK 번들 설정 `packages/cli/scripts/plugin-sdk.ts`, 배포물 목록 `apps/editor/server/plugins/designated-plugins.ts`, OneDrive 공급 digest 생성 입력 `apps/editor/server/plugins/artifact-digest.mjs`를 둔다. Desktop이 직접 복사하는 `apps/editor/samples/**`도 전체 제거 대상이다. 이 추가 입력은 단독·대표 경로와 혼합된 변경 모두 전체 제거를 선택하지만 Stable·Beta 선택은 넓히지 않는다. Desktop 안에서는 `src/host-protocol.ts`, `src/explorer.ts`, `src/first-document.ts`와 각각의 `test/*.test.ts`만 대표 경로로 분류하며 나머지·새 경로는 전체다. Editor의 위 업데이트 화면 세 파일은 대표 경로다. 혼합 diff는 전체 조건을 우선한다. IPC 응답 누락·renderer 예외·CLI 소유권 손상은 Beta 설치 fixture의 별도 하위 검사에서 한 번 검증하며 dirty 문서 차단과 실제 Save·설치·데이터 보존 경로도 별도 결과를 남긴다.

레이아웃·native caption 조합은 별도 `fullLayout`으로 선택한다(#1009 F08). `LITZIO_TEST_LAYOUT_SCOPE=representative`일 때만 대표 조합이며, 미설정·그 밖의 값은 전체다. CI의 Editor browser와 Desktop packaged 단계가 이 값을 전달한다. Release workflow는 미설정으로 전체를 유지한다. 전체 경로는 `scripts/ci-execution-policy.mjs`의 `layoutFullPaths`: Editor shell/shared, 공용 `src/components/ui/**`, `src/lib/utils.ts`·`src/ui/primitives.tsx`, theme/i18n/locales/preferences, shortcuts/document-tabs/ui-message, PluginSettings/PluginTab/plugin-ui/plugin-ui-registry, 공용 CopyButton, `public/theme-init.js`, App/main 진입점, HTML, P6와 공유하는 `desktopBuildInputs` 전체(Editor Vite/tsconfig와 CLI·plugin 전이 build/config 포함), Editor CSS/SCSS(`src/dev/**` 제외), 두 레이아웃 시나리오, Desktop 전체(새 main/preload/titlebar/window-control 입력 포함), manifest(위 세 플러그인 경로 제외)·lockfile·공유 build/workflow/script 및 미분류 경로다. 혼합 diff는 전체가 우선한다. 설치·업데이트의 `fullLifecycle`과 분리하여 CSS 변경이 Stable 설치·제거 전수 검사를 불필요하게 선택하지 않는다. 대표 실행도 최소 640px, 큰 폭 1440px, 도킹/좁은 sidebar/control 경계, 콘텐츠 폭·overflow·키보드 focus·대비, 실제 maximize/restore와 픽셀 negative control을 유지한다. 전체 조합의 세부 보호는 [Layout Rules](docs/design/editor-layout-rules-v1.md)와 [Desktop distribution](docs/design/desktop-distribution-v1.md)을 따른다.

smartquotes 대형 검사는 기본 Core suite에서 분리한 `pnpm --filter @litzio/core test:smartquotes`로 #11의 설치된 패치를 검증한다. `package.json`, `packages/core/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**`, parser/tokenizer 설정을 소유한 `packages/core/src/myst/`의 `parse.ts`·`serialize.ts`·`footnote.ts`·`literal-syntax.ts` 또는 해당 검사 파일 변경 때 선택한다. manifest는 MyST·markdown-it 버전 선언을, lockfile은 전이 의존성을 포함한다. 새 parser/tokenizer 설정 파일을 추가하면 이 선택 목록도 함께 갱신한다. diff/API를 확인할 수 없어 전체 실행할 때도 포함한다. 일반 Core의 따옴표 원문 보존 및 공개 parser의 URL·HTML 보안 검사는 계속 기본 suite에서 실행한다. 패치 제거 조건은 [Parser security boundary](docs/design/parser-security-v1.md)를 따른다.

master push 중복 판정은 이 저장소의 `ci.yml` workflow runs API에서 `event=merge_group`, `head_sha=github.sha`, `status=completed`, `conclusion=success`인 실행을 찾는다. 성공 run URL과 생략/전체 실행 사유를 changes 로그에 남긴다. 성공 기록 없음, 권한·네트워크·응답 오류는 전체 제품 검사·browser·HTTP·Desktop·update/uninstall·smartquotes로 되돌아간다. release workflow는 이 재사용 정책을 적용하지 않는다.

캐시는 key뿐 아니라 ref scope와 path에 따른 cache version도 구분된다([GitHub cache reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)). 실제 master 캐시 목록과 [pnpm/action-setup v6 구현](https://github.com/pnpm/action-setup/blob/v6/src/cache-restore/run.ts)을 확인한 결과 pnpm key는 `pnpm-cache-<runner.os>-<arch>-<hashFiles(pnpm-lock.yaml)>`, 경로는 `pnpm store path`다. Linux Playwright key는 `Linux-playwright-<hashFiles(pnpm-lock.yaml)>`, 경로는 `/github/home/.cache/ms-playwright`다. queue/PR scope에만 새 key가 저장되면 master 캐시를 대신하지 못하므로, 중복 생략 push는 Linux(동일 Playwright 컨테이너)·Windows `cache-warm` matrix에서 frozen install을 수행하고 Linux Chromium만 설치/캐시한다. 제품 검사·패키징은 실행하지 않는다. Windows는 pinned electron-builder의 다운로드 함수로 Electron·NSIS·리소스 도구 캐시를 채운다. Desktop 다운로드 캐시는 실제 Electron 기본 폴더 `%LOCALAPPDATA%/electron/Cache`와 `ELECTRON_BUILDER_CACHE`를 보관하며, OS·아키텍처·고정 Electron/electron-builder 버전으로 키를 만든다. 정확한 키가 없으면 같은 OS·아키텍처의 최신 v2 캐시를 복원한다. Electron은 고정 npm 패키지의 공식 `checksums.json`을 기존 다운로드 검증 함수에 전달하여 매번 원격 SHASUMS를 받지 않고 동일 SHA-256 검증을 유지한다. queue/전체 master 실행은 기존 Desktop job에서, 중복 생략 master push는 Windows `cache-warm`에서 저장한다. lockfile 또는 잠긴 Playwright 버전 변경은 새 key로 master scope에 저장되고, 동일 key는 복원한다. 전체 실행 fallback에서는 기존 quality/browser/HTTP/Desktop job이 캐시를 유지한다.

필수 aggregate 검사 `Core, CLI, Editor, and browser regressions`는 changes와 quality의 성공을 요구하고, 이벤트·경로 정책이 선택한 quality-unit/browser/http/http-windows/desktop/desktop-unit/desktop-stable/desktop-beta/cache-warm은 반드시 성공해야 하고, 선택하지 않은 job만 skipped여야 한다. 실패·취소는 통과하지 않는다. Queue에서도 정확히 같은 검사 이름을 보고한다. 같은 PR에 새 커밋을 push하면 이전 CI 실행을 취소하며, `master` push와 `merge_group` 실행은 이벤트·head SHA별로 유지하고 서로 취소하지 않는다.

Linux Editor 8개 shard와 HTTP browser job은 공식 `mcr.microsoft.com/playwright:v1.64.0-noble` 컨테이너를 **OS 의존성 제공용**으로 사용한다. 이미지의 CJK/Korean 글꼴을 포함한 의존성을 재사용하며 CI에서 apt를 실행하지 않는다. `@playwright/cli`의 transitive 버전과 맞춘 `1.64.0-alpha-1789764292000` 고정은 유지한다([채택 근거](docs/reviews/reduction-2026-10-10.md#단위-6-runner-채택-근거)). 해당 alpha 이미지가 없으므로 이미지에 포함된 stable 브라우저(`/ms-playwright`)는 사용하지 않는다. `PLAYWRIGHT_BROWSERS_PATH=/github/home/.cache/ms-playwright`로 분리하고 lockfile 키의 캐시를 복원한 뒤 `pnpm exec playwright install chromium`만 실행한다. 이 설치는 2분 제한이며 `--with-deps`를 사용하지 않는다. 기존 CI 경로 테스트가 lockfile의 prerelease 꼬리를 제외한 base 버전과 두 Linux 이미지 태그의 일치를 검사한다.

컨테이너는 기본 root 사용자와 `--ipc=host --init`를 사용한다. checkout action의 기본 safe.directory 설정을 유지하고, Node.js `24.22.2`과 pnpm `12.5.1`을 기존 action으로 설정한다. GitHub가 매핑한 HOME과 workspace/temp 경로를 사용하므로 기존 artifact 경로를 유지한다. runner는 headless Chromium이며 xvfb 실행은 필요 없다. Windows job은 기존 설치형 Chrome과 persistent profile을 사용한다. 이 선택은 테스트 판정·재시도·timeout·8개 shard 배정과 docs-only/merge queue 동작을 바꾸지 않는다.

## HTTP Host builds

`pnpm --filter @litzio/cli package`는 Node CLI 번들과 production Editor를 `packages/cli/dist/*.tgz`로 만든다. `pnpm --filter @litzio/cli test:packaged`는 checkout 밖에 offline 설치해 Node만으로 실행·저장·종료를 검사한다. 이어 `pnpm browser:test http-host`가 production Host를 직접 시작하고 정리한다. Vite 시나리오와 한 호출에 섞지 않는다.

PR의 Linux 및 queue/전체 master의 Windows/Linux CI는 이 세 검사를 수행하되 tarball은 Artifact로 보관하지 않는다. Windows의 Editor·CLI 단위/통합 검사는 Desktop unit foundation·editor 두 묶음(합쳐서 전체 `pnpm test`)에서 실행한다. queue/전체 master의 경로 정책은 `http ⇒ desktop`을 보장하므로 HTTP job의 중복 실행 없이 Windows 보호를 유지한다. 실패 시 browser diagnostics를 OS·묶음별 고유 artifact 이름으로 7일 보관한다. 로컬에서는 관련 boundary tests와 HTTP browser 회귀를 실행한다 (`pnpm --filter @litzio/cli build` 선행). `package`·`test:packaged`는 CLI 패키징·배포 경계를 변경할 때 실행한다. 공개 registry 게시·버전 release는 수행하지 않는다. 설치/실행과 원격 프록시 전제는 [HTTP Host contract](docs/design/http-host-v1.md)를 따른다.

## Windows Desktop builds and releases

**준비.** Windows가 필요하다. Node와 pnpm 요구 버전은 [Development requirements](#development-requirements)를 따른다.

**설치 프로그램 만들기.** 저장소 루트에서 순서대로 실행한다.

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @litzio/desktop package`
3. `apps/desktop/release/`에서 설치 파일을 확인한다. 이름은 `<executableName>-Setup-<version>.exe` 형식이며 공식 기본값은 `Litzio-Setup-<version>.exe`다.

개발용 빌드는 게시하지 않으며 (`publish: never`), `CSC_LINK`가 없으면 서명하지 않는다. `package`는 생성된 release 폴더를 비운 뒤 빌드한다. 산출물 `apps/desktop/build/`와 `apps/desktop/release/`는 Git에 포함하지 않는다.

**설치 없이 실행만 볼 때.** `pnpm --filter @litzio/desktop build`를 실행한 뒤 `pnpm --filter @litzio/desktop start`로 staging app을 실행한다.

**선택: 결과물 검증.** `v<version>`에는 `apps/desktop/package.json`의 `version`을 넣는다.

```bash
pnpm --filter @litzio/desktop exec tsx scripts/verify-release.ts --tag v<version>
pnpm --filter @litzio/desktop test:packaged
```

**작업용 PC에서 하지 말 것.** `test:update`와 `test:uninstall`은 일회용 CI 전용이다. 자세한 조건은 [Windows Desktop 회귀 검증](docs/test/README.md#windows-desktop-regression)을 따른다.

현재 소스는 `0.0.3-beta.1` Beta 후보이며 [준비 기록](docs/releases/v0.0.3-beta.1.md)을 따른다. 최신 공개 버전은 `0.0.2` Stable이다. 직전 공개 버전은 `0.0.2-beta.10`이다. 소스 버전은 [Desktop package.json](apps/desktop/package.json), 최신 공개 결과는 [Stable 배포 기록](docs/releases/v0.0.2.md)을 참고한다. 과거 기록은 [배포 기록 목록](docs/releases/)에 보존한다.

최신 공개 배포는 `0.0.2` Stable이다. Beta 설치본의 최초 실행 기본 채널은 Beta, Stable 설치본은 Stable이다. 유효하게 저장된 사용자 선택은 버전이 바뀌어도 유지한다. 2026-11-12 소유자 결정에 따라 Stable/Beta 모두 `unsigned` 게시 모드를 사용할 수 있으며 서명 없음 경고를 유지한다.

패키징·설치/업데이트·배포 경계를 변경하지 않은 작업에서는 package·자산 검증·packaged 회귀와 대표 install/update/removal 회귀를 필수 Windows Desktop CI에, Published와 전체 제거 조합을 위 경로·릴리스 정책에 맡기고, 관련 tests/typecheck·browser 회귀를 로컬 실행한다.

Windows Desktop unit 두 묶음은 합쳐서 release build와 동일한 전체 단위 테스트(`pnpm test`)를 실행해 Windows 경로·실패 주입 회귀를 merge queue와 전체 master fallback에서 검사한다.

merge-group/전체 master push CI는 unsigned package 생성·release 자산 검증·packaged 회귀와 경로 정책이 선택한 설치/업데이트·제거 검사를 유지하되 개발용 installer를 업로드하지 않는다. 브랜드 설정으로 선택한 사용자 제거 로그는 Windows의 다른 드라이브 root와 섞이지 않게 `desktop-uninstall-logs` artifact로 분리한다. 실패 진단은 packaged profile의 `logs/desktop.log*`, `recovery-proof.json`, `reset-proof.json`, 업데이트 시험 버전의 `latest.yml`·`beta.yml`, 제거 검사의 `*-dialogs.txt`·`*-cleanup.txt`와 실제 `%LOCALAPPDATA%\litzio\uninstall-logs\*.tmp` 진단만 7일 보관한다. 실행 로그와 직접 시작 측정치는 Actions 로그에서 확인한다. 실행 파일·blockmap·설치 트리·브라우저 profile·cache 전체는 진단에 포함하지 않는다. 작은 native caption 화면 근거는 성공·실패 모두 7일 보관한다. 게시 권한이나 release job은 없다.

첫 beta.1은 당시 CI 자산을 별도로 검증하여 수동 공개했다. 다음 Beta부터는 [Desktop release workflow](.github/workflows/desktop-release.yml)를 master에서 수동 실행한다. 이 workflow의 `desktop-release` Artifact는 installer·blockmap·채널 manifest와 게시 재검증 입력인 `win-unpacked/`를 14일 유지한다. Release 자산·전역 retention·queue 동시성과 CI 실행/성공 기준은 이 업로드 정책의 변경 대상이 아니다.

| Mode | 동작 |
| --- | --- |
| `verify` (기본) | 태그·빌드·테스트·자산 검증/Artifact만 실행. 게시하지 않음 |
| `unsigned` | 정확한 `vX.Y.Z` Stable 또는 `vX.Y.Z-beta.N` Beta 공개. 인증서 불필요(2026-11-12 소유자 결정); 첫 줄 unsigned 경고 유지 |
| `signed` | 기존 Authenticode 인증서/publisher 검증을 통과한 Stable 또는 Beta만 공개 |

컨트롤러는 dispatch의 master SHA에서 실행하며, tag 코드 실행 전에 기존 tag와 master ancestry·Desktop 버전을 검증한다. 검증한 commit SHA로 빌드하고 게시 직전 remote tag도 재확인한다. Installer/app의 전체 PE FileVersion, metadata 버전·파일명·SHA-512·크기, builder로 재계산한 blockmap을 검증한다. Beta는 `prerelease=true`, `latest=false`, `beta.yml`만 공개한다. Stable은 `prerelease=false`, `make_latest=true`, `latest.yml`만 공개한다.

모든 release 모드는 기존 CI 결과를 재사용하지 않고 검증한 tag commit에서 Editor browser 회귀 전체를 Linux 8개 shard(`pnpm browser:test --shard=N/8`)로 다시 실행한다. CI와 같은 Playwright 컨테이너·고정 Chromium 설치·브라우저 캐시·한글 폰트 확인을 사용하며 shard별 제한은 35분이다. `fail-fast: false`로 나머지 shard도 끝까지 실행하고, 실패 시 Vite 로그와 browser diagnostics를 shard별 artifact에 보존한다. 게시 job의 `needs: [preflight, browser, build]`와 기본 성공 조건으로 모든 shard와 Windows build가 성공해야 게시할 수 있다. 하나라도 실패·취소되면 게시하지 않는다.

게시 job만 `contents: write`를 가지며 `desktop-release` environment를 사용한다. 2026-10-28 소유자 결정으로 별도 게시 승인을 없애고 실제 GitHub environment의 required reviewer를 제거했다. API로 required reviewer·wait timer가 없고 custom deployment branch policy가 `master` branch 한 개만 허용함을 확인했다. 릴리스 요청의 명시적 승인과 master에서의 수동 workflow 실행은 유지하며, 검증 성공 후 게시 job은 추가 승인 없이 진행한다. 다음 게시 전에도 실제 환경 규칙을 확인한다. Signed 모드는 이 환경에 `WINDOWS_CSC_LINK`(PFX/인증서 참조), `WINDOWS_CSC_KEY_PASSWORD`도 필요하다. 인증서/키/토큰은 source에 넣지 않는다. 환경·secret 설정과 workflow 실행은 명시적 승인 범위에서 수행한다. 이전 beta.2 게시는 이 변경 전에 소유자 요청에 따른 agent의 reviewer 승인으로 진행했다([기록](docs/releases/v0.1.0-beta.2.md)).

인증된 paginated Release 목록에서 기존 공개 Release와 Draft를 모두 거부한다. 생성 응답의 ID로 새 Draft에 세 자산을 올리고 서버의 정확한 자산 집합·uploaded 상태·size·SHA-256·tag/channel을 확인한 뒤 마지막 요청으로 공개한다. 업로드/검증 실패는 Draft로 남기고 자동 삭제·덮어쓰기·재시도하지 않는다. 마지막 공개 요청의 응답이 소실되면 공개 여부를 확인해야 하므로 `Publication confirmation required`와 ID를 보고한다.

공개 `0.0.2-beta.2`의 실제 GitHub `0.0.2-beta.1 → 0.0.2-beta.2` 설치·업데이트는 소유자 결정으로 미실행·미검증이다. 공식 배포 첫 시도 성공과 공개 자산 대조 결과는 [#659 배포 기록](docs/releases/v0.0.2-beta.2.md)에 보존한다.

공개 `0.0.2-beta.3`의 실제 GitHub `0.0.2-beta.2 → 0.0.2-beta.3` 설치·업데이트는 이 PC의 설치 상태를 바꾸지 않는다는 제약으로 **미실행·미검증**으로 남긴다. 공식 배포 첫 시도 성공과 공개 자산 대조 결과는 [#690 배포 기록](docs/releases/v0.0.2-beta.3.md)에 보존한다.

공개 `0.0.2-beta.4`의 실제 GitHub `0.0.2-beta.3 → 0.0.2-beta.4` 설치·업데이트는 이 PC의 설치 상태 보존 제약으로 **미실행·미검증**으로 남긴다. 공식 배포 첫 시도 성공과 공개 자산 대조 결과는 [#758 배포 기록](docs/releases/v0.0.2-beta.4.md)에 보존한다.

**제품 이름 변경(IeumDoc → Litzio)으로 앱 ID·설치·데이터 경로가 바뀌어, IeumDoc beta.4 설치본은 Litzio로 자동 업데이트되지 않습니다. 새로 설치해야 하며 IeumDoc 데이터·설정·복구 기록은 이전되지 않습니다.**

실제 GitHub harness의 대상은 같은 Litzio 브랜드의 `0.0.2 → 0.0.3-beta.1`이다. Beta 후보는 아직 게시 전이며 opt-in harness는 실행하지 않았고 업데이트 검증 결과가 아니다([배포 기록](docs/releases/v0.0.2.md)). 이 PC의 설치 상태 보존 제약으로 실제 GitHub 설치·업데이트는 **미실행·미검증**이다.

다음 Stable/Beta 발행 순서: 버전 변경과 로컬 후보 검증 → 명시적 원격 승인 → 변경 push/CI/master 반영 → 실제 환경 보호 확인 → 검증된 master commit에 해당 버전 tag 게시 → master에서 해당 tag와 `unsigned` 또는 `signed`로 수동 실행 → 모든 빌드·테스트·자산 검증 성공 후 추가 environment 승인 없이 게시 → 공개 결과와 [실제 GitHub 업데이트 검증](docs/test/README.md#real-github-beta-update) 확인 → 한국어 Release 본문·릴리즈 기록 갱신. README에는 정확한 공개 버전이나 설치 파일 이름을 반복하지 않고 Releases 목록으로 안내한다. README는 제품 목적·지원 플랫폼·설치 절차·호환성 경계가 바뀔 때만 갱신한다. 게시 모드도 전체 검증을 실행하므로 동일 후보의 `verify`와 게시 빌드를 연속으로 반복할 필요는 없다. 게시 여부를 결정하기 전 산출물만 검토하려면 `verify`를 사용한다. 0.0.2-beta.1의 공개·철회 결과와 실제 GitHub 업데이트 미검증 범위는 [릴리즈 기록](docs/releases/v0.0.2-beta.1.md), 동작 계약은 [Desktop contract](docs/design/desktop-distribution-v1.md)를 참고한다. 이미 공개된 tag나 자산은 재작성하지 않는다.

Unsigned Stable/Beta의 SHA-512/SHA-256은 무결성 검증이다. 악의적인 게시자가 파일과 manifest를 함께 바꾸는 경우에 대한 게시자 인증이 아니다. Unsigned 경로는 Authenticode 인증을 제공하지 않으며, Signed 경로의 인증서 검증을 해제하지 않는다.

## Issue and PR guidance

[이슈 작성 안내](docs/contributing/issues.md), [issue templates](.github/ISSUE_TEMPLATE/), [PR template](.github/pull_request_template.md)을 사용한다. 실행한 검증과 결과, 실행하지 않은 검증의 이유를 PR에 기록한다.

## AI commit provenance

필수 trailer 형식과 구현자 기록 의무는 [AGENTS.md](AGENTS.md#ai-commit-provenance)를 따른다. 두 필수 키는 **최종 연속 trailer 블록에 각각 정확히 한 번** 있어야 한다. 본문과 블록 사이에는 빈 줄을 두고, trailer 사이에는 빈 줄을 넣지 않는다. 행이 본문에 보이는 것만으로는 충분하지 않다. Git이 실제로 두 값을 읽어야 한다.

예외: GitHub merge queue가 생성한 merge commit은 플랫폼 생성 commit이며 AI trailer를 넣지 않는다. Provenance는 validator가 검사하는 PR 고유 commit에 남는다. Agent가 수동 작성한 merge commit(예: PR branch에 master merge)은 여전히 필수 trailer 대상이다.

```text
fix: preserve machine-readable provenance

Describe the change here.

AI-Agent: Codex
AI-Model: openai/gpt-6.1-sol
```

이 모델 값은 예시다. 현재 구현에 실제 사용한 agent/model을 확인한 뒤 기록하며, 검증기는 값을 생성하거나 진실성을 추정하지 않는다.

Use a single analyzable identifier, not a display name: `<provider>/<model>`.

Examples:

```
xai/grok-4.6
openai/gpt-6.1-sol
openai/gpt-5.6-luna
openai/gpt-5.6-terra
openai/gpt-6-astra
```

If a vendor's official identifier differs from this repository's
identifier, use the repository canonical form above and keep it stable.
This repository's canonical identifier for Grok 4.6 is `xai/grok-4.6`.

If review provenance is needed, use a separate, optional trailer, for example:

```
AI-Reviewed-By: openai/gpt-5.6-sol
```

PowerShell에서는 메시지를 UTF-8 파일로 작성한다. 각 trailer를 별도의 `git commit -m` 인자로 넘기면 Git이 빈 줄로 구분된 문단을 만들므로 금지한다. 다른 shell에서도 메시지 파일을 사용한다.

```powershell
@'
fix: describe the change

Describe the change here.

AI-Agent: Codex
AI-Model: openai/gpt-6.1-sol
'@ | Set-Content -LiteralPath commit-message.txt -Encoding utf8
node scripts/commit-provenance.mjs message commit-message.txt
git commit --file commit-message.txt
git log -1 --format='%H%n%(trailers:only)'
```

메시지 파일은 staging하지 않고 작업 후 삭제한다. **매 commit 생성 직후와 push 전에** 마지막 명령 결과에서 `AI-Agent`와 `AI-Model`이 각각 정확히 한 번, 실제 구현 값으로 출력되는지 확인한다. raw `%B` 출력, 정규식 검색, hook 통과만으로 대체하지 않는다. 문제가 있으면 push/승인을 중단하고 수정한다. 공유된 과거 이력을 이 검사 때문에 임의로 다시 쓰지 않는다.

**검토자는 승인 전에** 최신 base를 fetch한 뒤 다음 명령으로 PR 고유 commit 전체의 SHA와 Git parsed trailers를 확인한다. 작성된 merge commit도 확인한다. AI metadata가 있는 각 commit에 필수 키가 정확히 한 번씩 읽히는지, 값이 구현자·실제 모델인지 확인하고 검토 head의 CI 성공을 확인한다.

```powershell
git fetch origin master
git log origin/master..HEAD --format='%H%n%(trailers:only)'
```

`.githooks/commit-msg`와 CI quality는 같은 [validator](scripts/commit-provenance.mjs)의 `git interpret-trailers --parse` 결과로 누락·중복·빈 값·모델 형식·블록 밖 metadata를 검사한다. Git의 [trailer 형식](https://git-scm.com/docs/git-interpret-trailers)을 재구현하지 않는다. AI provenance가 전혀 없는 사람 commit과 선택적인 `AI-Reviewed-By`, 다른 정상 trailer는 허용한다. 검증기는 사람이 작성한 commit인지 또는 모델 기록이 사실인지 자동 판별하지 않는다.

CI는 `event <event-name> <event.json>`으로 PR event의 `pull_request.base.sha..pull_request.head.sha`를 검사한다. base에서 이미 도달 가능한 기존 이력과 GitHub의 synthetic merge는 제외하지만 PR에서 작성된 merge commit은 포함한다. `merge_group`에서는 enqueue 전에 PR 고유 commit이 검증되었으므로 provenance 범위 검사를 명시적으로 건너뛴다. GitHub 생성 queue merge commit에 AI trailer를 요구하지 않는다. event JSON은 파일로 읽으며 shell 명령에 값을 삽입하지 않는다. push event에는 과거 master 이력의 provenance 감사를 추가하지 않는다.

Hook은 선택 설치이며 CI 검사의 대체물이 아니다. Node.js와 Git이 필요하다. Enable the shared hooks in a local clone with:

```
git config core.hooksPath .githooks
```

## License of contributions

By submitting a contribution, you agree that it may be distributed under the [MIT License](LICENSE) used by this repository.

Node 24.22.1은 CVE-2026-111497 수정 하한이며 CI는 24.22.2를 사용한다. 로컬 개발 PC와 별도 CLI/Host의 Node는 사람이 직접 갱신하고 실행 중인 daemon을 재시작해야 한다. Desktop 갱신으로 시스템 Node가 바뀌지는 않는다. [런타임별 영향과 검증 경계](docs/design/http-host-v1.md#node-runtime-security-baseline-2026-11-11)를 참고한다.
