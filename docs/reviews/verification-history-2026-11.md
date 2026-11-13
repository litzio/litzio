# Verification — 검증 이력

- Status: Historical
- Moved: 2026-11-13
- Last verified: 2026-11-13 (원문 이동과 현재 계약 링크 확인; 과거 실험 재실행 없음).
- Authority: 당시 검증 기록. 현재 규칙은 [원래 계약](../test/README.md)을 따른다.

당시 수치·캡처·실행 범위와 한계를 보존한다. 현재 요구사항이나 현재 기능의 증명이 아니다.

## Evidence and history

### Settings initial-focus race (#541)

Run 40297651538 attempt 1, job 121487564515, artifact `editor-browser-ci-logs-2`
fails at the 390px Korean-to-English pass: the Sidebar's **Open folder…** click, after
`language('en')`, times out at 15000ms. Input event 70 sends Escape to **Settings**,
not the language select; events 71–73 move focus to **Expand sidebar**. The failure
state and screenshot show a closed sidebar and no visible dialog. The click trace
never resolves its target or reports pointer interception. This is an initial-focus
readiness race, not evidence of a lingering modal backdrop or failed final focus.

`selectOption` can finish without focusing the select while Base UI still owes its
animation-frame initial focus. Escape on the opener then also dismisses the phone
sidebar. Holding that actual focus call reproduces the original click timeout; the
fixed readiness assertion stays pending until release and the full scenario passes.
Replacing the wait with an immediately resolved promise fails the pending assertion.
All existing typography, geometry and document-preservation assertions remain.

### Focus and selection race investigation (#489)

The downloaded run artifacts (input events, browser state, trace and console errors) distinguish
test readiness from product selection handling in the three fixed paths. Console/page errors
were empty in these preserved failures.

| Scenario / artifact | Cause and classification | Regression boundary |
| --- | --- | --- |
| `bibliography-connection`, run 40248680852 / job 121335724273 | Test wait: Remove unmounted the citation form, leaving BODY focused. Ctrl+Z at 3392.4ms (event 142) preceded editor focus at 3393.6ms (145), so no Undo transaction ran. | Hold Remove's queued animation-frame callbacks; wait for actual editor focus before Undo. References and Undo assertions are unchanged. |
| `document-title`, run 40252460131 / first attempt | Product/engine defect: after Add a title focused H1, the delayed 20ms focus check could overwrite the paragraph's native caret before selectionchange read it. The retained state stayed at H1 position 1 (133–138). | Hold that actual engine callback and release it at paragraph mouseup. The check must respect the later pointer; the original empty-title removal and clean-document assertions remain. |
| `citations`, run 40246268525 / job 121328398849 | Test wait: the #448 helper could mistake the closing Reload modal's enabled buttons and retained focus for an interactive discard prompt. It returned before final focus reached File actions (134); Backspace went to that button (135). | A prompt must still have `data-open`. Hold the final File actions focus and assert Reload has not returned, then retain the exact canonical-byte comparison. |

The table selection reset is tracked separately in [#502](https://github.com/litzio/litzio/issues/502).
`table-authoring` remains identical to master, including its failure-only diagnostics. No wait is
added to conceal that reset, and this PR does not claim to fix it.

The final bibliography proof checks that the helper remains pending while BODY has focus: the
same test fails with an immediate-return helper and passes with the real focus wait. The title
scenario holds the actual post-focus callback until paragraph mouseup, and citations holds the
closing Reload focus handoff. These checks retain the original assertions and existing timeouts.

Run 40076829146 for #421 has no input-events recording. Its trace confirms Undo succeeded and
Redo left the citation present, but cannot establish the key target or history transaction at
failure. Citation authoring's Redo assertions remain unchanged. #421 and the separate fast text-caret synchronization issue #416 are
not claimed fixed by #489.

`figure-draft-race`의 미주 case는 본문을 한 번 클릭한 직후 native anchor/focus가 모두 클릭한 본문 text offset에 있고 collapsed이며 EditorView focus가 유지되는지 대기 없이 단언한다. 즉시 engine snapshot도 결과에 보존한다. 이후 기본 assertion 제한시간 안에서 같은 native 위치·focus와 정확한 engine TextSelection이 일치하면 곧바로 입력하고, 본문 삽입 위치·미주 전체 노드 불변·readonly 복귀 및 기존 Save/Reload를 검사한다. 다른 네 case의 즉시 engine 단언은 유지한다. 이는 [#416 소유자 결정](https://github.com/litzio/litzio/issues/416#issuecomment-6494573226)의 경계에 따른 [#811](https://github.com/litzio/litzio/issues/811)의 테스트 관찰 조정이며, CI의 native/engine 불일치 구간에서 실제 입력이 안전하다고 입증하거나 제품을 수정한 것은 아니다. #839부터 문서가 안내 표시로 움직이지 않으므로 다섯 독립 case는 서로 다른 본문 내부 offset을 클릭한다. 이전 case와 같은 좌표를 500ms 안에 반복해 ProseMirror가 double/triple click으로 묶는 것을 피하며, 각 위치의 정확한 caret·입력 단언은 유지한다. 추가 클릭·selection 지정·강제 flush·sleep이나 timeout/retry 변경은 사용하지 않는다.

### Cross-reference regression history (#407)

`cross-reference`는 삭제 안내의 한국어 검사에서 복구 기록이 실제 커밋된 상태를 만든다. #407은 Undo 뒤 Apple 단축키 검사를 위한 페이지 Reload 전에 그 문서의 복구 기록 제거를 기다리도록 했다. 당시에는 Undo 완료 뒤에도 기록이 남은 채 Reload하면 탭 복원이 복구 dialog를 제안하여 Sidebar의 Files가 접근성 조회에서 제외될 수 있었다(#405).

### Real GitHub Beta update history

2026-10-25 게시된 `0.1.0-beta.1`의 실제 공개 `0.0.1-beta.4 → 0.1.0-beta.1` 업데이트가 통과했다(검증 확인: 2026-10-25/26). 정확한 버전 감지·다운로드 검증, 일반 종료 시 설치 없음, IPC 실패·renderer 오류·dirty 상태의 재시작 거부, Save → 설치 → 재실행, FileVersion과 preferences·Beta 채널·user-data canary·네이티브 Markdown 보존을 확인했다. 첫 시도는 공개 beta.4의 `Ready`를 lowercase `ready`로 기다려 업데이트 전에 실패했고, 한국어 Windows에서 갱신 앱의 한국어 UI도 하네스에 영향을 주었다(#449). #450의 영어 UI 고정·대소문자 무시 대기 후 재실행은 통과했다. 같은 수정으로 한국어 Windows의 로컬 `test:packaged`도 9/9 통과했으며, 테스트 소유 설치·registry·app data·cache·process는 정리했다. 당시 자산과 상세 결과는 [0.1.0-beta.1 릴리즈 기록](../releases/v0.1.0-beta.1.md)에 보존한다. 이 Release·자산·원격 tag는 이후 #632에서 철회되었으며, 이 과거 성공은 현재 `0.0.2-beta.3`의 실제 GitHub 업데이트 검증이 아니다.

2026-10-15 beta.4 게시 후 실제 `beta.3 → beta.4` 공개 업데이트도 통과했다. 공개 자산과 설치·재실행·문서/설정 보존 결과는 [beta.4 릴리즈 기록](../releases/v0.0.1-beta.4.md)에 있다. 당시 공개 beta.3은 네이티브 문서 이전 버전이라 앞쪽 Frontmatter를 본문 블록처럼 편집하므로, beta.3에서 출발하는 실제 공개 업데이트 경로만 표식 없는 Markdown을 사용했다. 이 beta.3 전용 fixture 예외는 현재 대상에는 적용되지 않는다.

2026-10-14 beta.3 게시 후 실제 `beta.2 → beta.3` 공개 업데이트도 통과했다([beta.3 릴리즈 기록](../releases/v0.0.1-beta.3.md)).

2026-10-12 승인된 beta.2 게시 후 실제 `beta.1 → beta.2` 공개 업데이트 검증이 통과했다. 공개 바이너리와 GitHub Provider를 사용한 결과는 [릴리즈 기록](../releases/v0.0.1-beta.2.md)에 있다.

### Host recovery execution history (#296 PR3)

2026-10-16 local execution established Windows x64 packaged Desktop and production HTTP/Chrome.
Required CI (including Linux HTTP) remains necessary before issue closure; no installer/update,
publication or other-platform completion is implied. Compact machine-readable evidence records
process IDs/profile/origin and assertions in `tmp/desktop-e2e/recovery-proof.json` and the HTTP
test's `tmp/browser-results/http-recovery-*/host-recovery-proof.json` (also attached to the test).

The prior final-v3 two-page
ticket p95 around 2.4s remains a limitation, not a recording deadline.
This prior measurement was documented on 2026-10-16 in [the Host recovery verification commit](https://github.com/litzio/litzio/commit/ef1c09a63002827a38f2ea230e134c973cdb9344); the [recovery contract](../design/editing-session-save-v1.md#local-recovery-records-296-pr2) identifies it as a known limitation, not a guarantee or a new PR3 measurement.
