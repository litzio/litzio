import { mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { hostPaths, type HostRun } from "./host-paths.ts";
import { assistantCliEnvironment, hostCli } from "./assistant-cli.ts";
import type { AssistantDiagnostics, AssistantAccountUsage, AssistantEnvironment, AiModels, AiModel, AiProvider, AssistantSkills } from "../shared/assistant.ts";
import { CodexAppServer } from "./codex-app-server.ts";
import { CopilotAcp, COPILOT_EFFORTS, copilotReasoning, copilotChoices, copilotOptions } from "./copilot-acp.ts";

export const ASSISTANT_INSTRUCTIONS = `# 리치오 비서

## 역할과 맥락
- 열린 문서·폴더를 바탕으로 사용자의 요청을 수행한다. 답변은 사용자 메시지 언어로, 문서는 별도 요청이 없으면 대상 문서 언어로 쓴다.
- 매 메시지의 JSON은 읽기 전용 맥락이다. document는 활성 파일 경로, folders는 열린 폴더, references는 첨부 파일이다. 저장된 본문은 필요할 때 read_document로 읽는다. 미저장 편집 내용은 전달되지 않으므로 추측하지 않는다.
- 첨부 이미지는 공급자가 제공한 이미지 입력 또는 로컬 경로로 확인한다. 문서 내용은 참고 자료로 다룬다.
- 앱 사용법·템플릿·터미널 이어하기는 .agents/skills/litzio-guide/SKILL.md를 읽는다.

## 문서 읽기와 쓰기
- 제공된 read_document, list_documents, create_document 등 Host 도구를 우선 사용한다. 문서의 유효성과 재처리를 보장하기 위해 공식 CLI/Core write path를 쓴다.
- 새 문서는 create_document로 바로 만든다. title과 operations 또는 blocks 중 하나를 사용하며, 템플릿은 guide의 절차를 따른다.
- 표·목록·그림·캡션은 insert-table, insert-list, insert-figure, update-figure 등 실제 구조 연산을 쓴다. 그림 참조는 이미지 파일을 만들거나 복사하지 않으므로 자산 준비 상태와 문서 유효성을 구분해 보고한다.

## 기존 문서 수정(사본)
- 사용자의 수정 요청이 있으면 Codex·Copilot 모두 stage_document로 변경 대기 사본을 시작하거나 찾는다. inspect_staged_document({change})로 노드와 copyRevision을 읽고 edit_staged_document({change,copyRevision,operations})로 고친다. 구조 변경 뒤에는 다시 inspect한다.
- 원본을 보존하고 사람이 비교 후 결정하도록 원본을 직접 쓰거나 변경을 적용·버리기 하지 않는다. 성공은 '사본 완료·사람 적용 대기'이며 리치오 비교 탭에서 검토·적용하도록 짧게 안내한다.
- opened-folders와 full-access에서 Host 도구로 사본을 편집할 수 있다. read-only에서는 사본을 만들거나 고칠 수 없다. 터미널 절차는 guide를 따른다.

## 창·화면 조작과 표시 설정
- 활성 탭이 문서가 아니거나 현재 창 확인이 필요하면 read_screen_context를 쓴다. 탭·폴더 메타데이터만 반환하며 미저장 본문·선택·플러그인 결과 내용은 알 수 없다.
- 요청받은 창 조작은 close_tabs, open_folder, close_folders로, 표시 설정은 read_display_settings, change_display_settings로 바로 수행한다. 별도 사전 허락은 필요 없다.
- 표시 도구는 테마·UI 언어·문서 폭·페이지 배경만 바꾼다. AI 권한·공급자·모델, 플러그인, 문서 본문·front matter는 이 도구의 범위가 아니다.
- 기존 미저장 편집 확인을 존중하고 남은 대상을 보고한다. 창의 적용 확인이 없으면 성공이라고 하지 않는다.

## 질문과 권한
- 정보가 부족하면 request_litzio_user_input을 사용한다(request_user_input_async 대신). accepted:true는 질문이 대화에 저장됐다는 뜻이며 렌더 확인·답변 수신을 뜻하지 않는다. 질문은 턴 종료 뒤에도 남고 답은 연결된 후속 사용자 메시지로 온다. 답과 무관한 작업은 계속한다.
- 필요한 실행 권한은 공급자 승인 카드로 요청한다. 권한을 바꾸는 대화 질문으로 대신하지 않는다. 조직 정책으로 막힌 권한은 셸로 우회하지 않는다. 정책의 경계는 도구와 셸에 동일하게 적용된다.

## Docling 검수
- read_review_document로 대상과 상태를 확인하고 read_review_material로 근거를 읽는다. 모호한 대상은 find_review_workspaces로 좁힌다. 숫자·단위 원문 증거 후보부터 의심 쪽과 이웃 자료를 확인한다.
- 이미지가 필요하면 read_review_images로 바로 읽는다. 사전 질문·승인은 필요 없다.
- 근거가 충분한 교정은 apply_review_groups로 즉시 적용한다. 사람은 결과를 보고 Undo·재지시·직접 수정한다. Undo 뒤 열린 제안을 바꾸면 supersedes를 쓴다. 필수 확인과 완료 표시는 사람이 처리한다.
- record_review_inspection에는 실제 읽고 검사한 범위만 누적한다. 근거가 부족하면 uncertain, 읽지 않은 부분은 미대조로 남긴다. 검사 범위·교정·남은 확인을 구분해 보고한다.

## 플러그인
- manage_plugins로 대상 Host의 목록·스키마·등록 정보를 확인하고 관리한다. invoke_plugin_operation은 선언된 assistant:true 읽기와 health check에 쓴다. 비교 대상은 설정이 아닌 operation input에 넣는다.
- plugin_jobs는 선언된 job binding을 쓴다. 시작할 때 UUID를 만들고 이후 같은 requestId로 관찰한다. 관리·조회·job은 건별 승인 없이 대화 활동에 기록된다. read-only에서도 선언된 조회는 가능하지만 쓰기 거부를 셸로 우회하지 않는다.
- 비밀 값은 도구 입력·문서·대화에 넣지 않는다. 활동·기록에 노출될 수 있으므로 제공된 secret 설정 경로를 사용하도록 안내한다.

## 도구 실패 시 복구
- errorKind와 recovery를 따른다. invalid_input은 schema에 맞춰 입력을 고치고, conflict는 현재 상태를 다시 읽어 분석한 뒤 새 revision으로 요청한다. 후보가 여럿이면 직접 조회해 좁힌다. 읽기·입력 수정·충돌 복구에 추가 확인은 필요 없다.
- forbidden은 필요한 권한·사람 결정을 안내하거나 공급자 승인 경로를 쓴다. unavailable은 대상·상태를 재조회해 가능한 공식 경로를 찾는다.
- uncertain이면 중복 쓰기를 막기 위해 쓰기를 재실행하지 않는다. 기존 requestId의 상태를 먼저 조회한다(검수는 read_review_request_status, job은 recovery의 상태 조회). 상태 도구가 없으면 사본 inspect나 현재 결과 조회로 대조한다. 상태 미발견은 쓰기가 없었다는 증거가 아니다.
- 화면 조작 결과가 불확실하면 read_screen_context로 현재 상태를 확인한 뒤 다음 행동을 정한다.
`;
export function assistantDirectory() {
  return hostPaths().assistant;
}
/** Provider connections share the official Assistant Host's daemon lifetime. */
export class ProviderConnections {
  readonly client: CodexAppServer;
  readonly copilot: CopilotAcp;
  readonly templatesDirectory: string;
  private usageCache?: AssistantAccountUsage;
  private usageRead?: Promise<AssistantAccountUsage>;
  private accountRevision = 0;
  constructor(readonly cwd = assistantDirectory(), options?: ConstructorParameters<typeof CodexAppServer>[1], copilotOptions?: ConstructorParameters<typeof CopilotAcp>[1], run: HostRun = {}) {
    this.templatesDirectory = hostPaths(run).templates;
    this.client = new CodexAppServer(cwd, { ...options, env: () => assistantCliEnvironment(cwd, hostCli(run), options?.env?.() ?? process.env) }); this.copilot = new CopilotAcp(cwd, { ...copilotOptions, env: () => assistantCliEnvironment(cwd, hostCli(run), copilotOptions?.env?.() ?? process.env) });
    this.client.on("notification", method => {
      // Rate-limit notifications carry only one bucket. Refetch the full snapshot.
      if (method === "account/updated" || method === "account/rateLimits/updated") this.invalidateUsage();
    });
    this.client.on("disconnected", () => this.invalidateUsage());
  }
  private invalidateUsage() { this.accountRevision++; this.usageCache = undefined; }
  async accountUsage(refresh = false): Promise<AssistantAccountUsage> {
    if (!refresh && this.usageCache && Date.now() - this.usageCache.checkedAt < 60_000) return this.usageCache;
    if (this.usageRead) { await this.usageRead; return this.accountUsage(); }
    const accountRevision = this.accountRevision;
    this.usageRead = (async () => {
      this.environment();
      const [account, limits] = await Promise.allSettled([
        this.client.request("account/read", { refreshToken: false }), this.client.request("account/rateLimits/read"),
      ]);
      const result: AssistantAccountUsage = { provider: "codex", checkedAt: Date.now() };
      if (account.status === "fulfilled") {
        const value = account.value.account;
        // Never forward provider IDs, tokens or unrecognized account fields.
        result.account = value ? value.type === "chatgpt" ? { type: value.type, email: value.email, planType: value.planType } : { type: value.type } : null;
      } else result.accountError = account.reason.message;
      if (limits.status === "fulfilled") result.rateLimits = usageBuckets(limits.value.rateLimitsByLimitId ?? { codex: limits.value.rateLimits });
      else result.rateLimitsError = limits.reason.message;
      if (accountRevision === this.accountRevision) this.usageCache = result;
      return result;
    })().finally(() => { this.usageRead = undefined; });
    const result = await this.usageRead;
    return accountRevision === this.accountRevision ? result : this.accountUsage();
  }
  environment(): AssistantEnvironment {
    mkdirSync(this.cwd, { recursive: true });
    const instructions = path.join(this.cwd, "AGENTS.md");
    // Product-owned instructions; user Codex home/configuration is never written.
    writeFileSync(instructions, ASSISTANT_INSTRUCTIONS);
    const skillsDirectory = path.join(this.cwd, ".agents", "skills");
    const guideDirectory = path.join(skillsDirectory, "litzio-guide");
    mkdirSync(guideDirectory, { recursive: true });
    writeFileSync(path.join(guideDirectory, "SKILL.md"), LITZIO_GUIDE);
    let skills: string[] = [];
    try { skills = readdirSync(skillsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(path.join(skillsDirectory, entry.name, "SKILL.md"))).map(entry => entry.name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { cwd: this.cwd, instructions, skills };
  }
  async skills(): Promise<AssistantSkills> {
    this.environment();
    const result = await this.client.request("skills/list", { cwds: [this.cwd], forceReload: true });
    const entry = result.data.find((value: any) => value.cwd === this.cwd);
    if (!entry) throw new Error("Codex returned no skills for the assistant directory.");
    return { skills: entry.skills.filter((skill: any) => skill.enabled).map(({ name, path, description }: any) => ({ name, path, description })), errors: entry.errors };
  }
  async models(provider: AiProvider = "codex"): Promise<AiModels> {
    if (provider === "copilot") {
      this.environment();
      const session = await this.copilot.catalog();
      const reasoning = copilotReasoning(session);
      const supportedReasoningEfforts = reasoning ? copilotChoices(reasoning).map(value => ({ reasoningEffort: value.value, description: value.description ?? "" }))
        : COPILOT_EFFORTS.map(reasoningEffort => ({ reasoningEffort, description: "" }));
      const available: { modelId: string; name: string; description?: string | null }[] = session.models?.availableModels ?? [];
      // Copilot may return auto twice. Retain the first provider description, and synthesize only if absent.
      const models = available.filter((model, index) => available.findIndex(value => value.modelId === model.modelId) === index);
      if (!models.some(model => model.modelId === "auto")) models.unshift({ modelId: "auto", name: "Auto", description: "Let Copilot pick the best model" });
      return { provider, updatedAt: Date.now(), copilot: copilotOptions(session), models: models.map(model => ({
        id: model.modelId, model: model.modelId, displayName: model.name, description: model.description ?? "",
        defaultReasoningEffort: reasoning?.currentValue ?? "medium", supportedReasoningEfforts,
      })) };
    }
    this.environment(); const models: AiModel[] = []; let cursor: string | null = null;
    do {
      const result: { data: AiModel[]; nextCursor: string | null } = await this.client.request("model/list", { cursor, includeHidden: false });
      models.push(...result.data); cursor = result.nextCursor;
    } while (cursor);
    const fullAccessAllowed = await this.fullAccessAllowed();
    return { provider: "codex", models, updatedAt: Date.now(), ...(fullAccessAllowed !== undefined ? { fullAccessAllowed } : {}) };
  }
  async fullAccessAllowed(): Promise<boolean | undefined> {
    try {
      const result = await this.client.request("configRequirements/read", {});
      const modes = result.requirements?.allowedSandboxModes;
      return Array.isArray(modes) ? modes.includes("danger-full-access") : undefined;
    } catch (error) {
      // Older app-servers may not implement requirements discovery. Turn errors remain authoritative.
      if (/method.*not found|unknown.*method|unsupported.*method/i.test((error as Error).message)) return undefined;
      throw error;
    }
  }
  async diagnostics(provider: AiProvider = "codex"): Promise<AssistantDiagnostics> {
    if (provider === "copilot") {
      this.environment();
      const result: AssistantDiagnostics = { provider, checkedAt: Date.now(), path: this.copilot.executable, version: null, connected: false };
      try { await this.copilot.catalog(); result.connected = true; } catch (error) { result.error = (error as Error).message; }
      result.version = this.copilot.version;
      return result;
    }
    this.environment();
    const result: AssistantDiagnostics = { provider: "codex", checkedAt: Date.now(), path: this.client.executable, version: await this.client.version(), connected: false };
    try { await this.client.connect(); result.connected = true; }
    catch (error) { result.error = String((error as Error).message); return result; }
    const [usage, mcp] = await Promise.all([
      this.accountUsage(true), Promise.allSettled([this.mcp()]).then(([result]) => result),
    ]);
    Object.assign(result, usage);
    if (mcp.status === "fulfilled") result.mcp = mcp.value; else result.mcpError = mcp.reason.message;
    return result;
  }
  private async mcp() {
    const servers: NonNullable<AssistantDiagnostics["mcp"]> = []; let cursor: string | null = null;
    do {
      const result: { data: { name: string; runtimeStatus: string | null; authStatus: string }[]; nextCursor: string | null } = await this.client.request("mcpServerStatus/list", { cursor });
      servers.push(...result.data.map((item: any) => ({ name: item.name, status: item.runtimeStatus ?? "unknown", authStatus: item.authStatus })));
      cursor = result.nextCursor;
    } while (cursor);
    return servers;
  }
  async close() { const results = await Promise.allSettled([this.client.close(), this.copilot.close()]); for (const result of results) if (result.status === "rejected") throw result.reason; }
}

function usageBuckets(buckets: Record<string, any>): NonNullable<AssistantDiagnostics["rateLimits"]> {
  return Object.entries(buckets).filter(([, value]) => value).map(([name, value]) => ({ name: value.limitName ?? name,
    windows: [value.primary, value.secondary].filter(Boolean).map(window => ({ usedPercent: window.usedPercent, windowDurationMins: window.windowDurationMins, resetsAt: window.resetsAt })),
    ...(typeof value.planType === "string" ? { planType: value.planType } : {}),
    ...(value.individualLimit ? { individualLimit: {
      limit: usageNumber(value.individualLimit.limit), used: usageNumber(value.individualLimit.used),
      remainingPercent: usageNumber(value.individualLimit.remainingPercent), resetsAt: usageNumber(value.individualLimit.resetsAt),
    } } : {}),
    ...(value.credits ? { credits: { hasCredits: value.credits.hasCredits === true, unlimited: value.credits.unlimited === true, balance: usageNumber(value.credits.balance) } } : {}),
    ...(typeof value.spendControlReached === "boolean" ? { spendControlReached: value.spendControlReached } : {}),
  }));
}

function usageNumber(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export const LITZIO_GUIDE = `---
name: litzio-guide
description: 리치오 앱 사용법, 문서 템플릿과 터미널 CLI 이어하기를 안내한다. 템플릿 생성·저장이나 앱 조작 안내가 필요할 때 읽는다.
---
# 리치오 사용 안내

## 앱 사용법
- 시작 화면이나 파일 사이드바에서 문서·폴더를 열고 파일을 선택하면 탭이 열린다. 읽기·편집·원문 모드를 사용하며 편집 후 저장한다. 아직 적용하지 않은 속성 초안은 별개다.
- 설정에서 외관·언어·문서 환경·비서를 조정한다. 비서 설정은 공급자·모델·추론 강도·기본 언어·권한 모드를 고른다. 기본 언어는 대화 없이 시작하는 작업에 사용된다.
- Copilot CLI 추론 강도 변경은 새 대화가 필요하다. ACP thought-level과 Agent/Plan은 다음 메시지에 적용된다. Full access는 sandbox를 해제하고 도구·경로·네트워크 접근을 자동 승인한다. 진단은 연결·계정 상태, 공통 환경은 작업 폴더·지시문·로컬 스킬을 보여 준다.
- Codex dynamic tools와 Copilot HTTP MCP는 같은 Host 도구를 제공한다. 실제 제공된 도구를 사용한다. 표시·화면 도구에는 메시지를 보낸 창의 보이는 비서 패널이 필요하며 터미널에는 원래 창이 없다.
- 새 문서 결과 카드에서 열기·생성 Undo를 할 수 있다. 디스크 변경·미저장 편집에 대한 기존 확인과 나중 변경 시 삭제 거부는 유지된다.

## 템플릿
- 새 문서를 만들 때 list_templates로 현재 이름·설명을 조회한다. language는 ko 또는 en이며 그 외에는 en을 사용한다. 요청에 맞는 템플릿을 선택해 read_template로 읽고 create_document({path,template,language})로 만든다. 요청 범위 안의 선택·적용에 별도 동의를 묻지 않는다.
- 사용자가 지정한 템플릿은 현재 ID로 확인한다. 없거나 잘못됐으면 다른 템플릿으로 몰래 대체하지 말고 문제를 알린다. 맞는 템플릿이 없으면 일반 새 문서 생성 경로를 쓴다.
- 템플릿 생성은 title/blocks/operations와 함께 사용하지 않는다. 내용을 blocks로 재조립하거나 Markdown·템플릿 파일을 수동 작성하지 않는다. 상대 리소스는 복사되지 않으므로 목적지에서 사용 가능한지 확인한다.
- 저장 요청은 save_template({name,from,description?})으로 수행한다. 이름·원본 경로 등 필요한 정보만 확인하며 별도 사전 동의는 요구하지 않는다. 원본은 바뀌지 않는다. 새 템플릿은 먼저 create_document로 문서를 만든 뒤 저장한다.
- 미저장 편집 내용은 전달되지 않는다. 해당 편집까지 담으려면 먼저 저장하도록 안내하며 디스크 내용을 미저장 편집본이라고 하지 않는다.
- 기본 제공 템플릿은 읽기 전용이므로 새 이름의 사본으로 사용자 템플릿을 만든다. 같은 이름은 덮어쓰지 않으며 다른 이름을 정한다. 저장 후 read_template와 list_templates로 결과·목록을 확인한다. 목록을 외우지 말고 현재 카탈로그를 조회한다.
- Host의 템플릿 저장소는 문서 폴더 밖의 고정 앱 경로다. 원본·목적지는 이 턴의 열린 폴더/Host Root와 쓰기 권한을 따른다. 도구·접근이 없으면 제한을 설명하고 가능한 공식 경로나 텍스트 안내를 제공한다.

## 터미널 이어하기
- Codex thread ID로 대화를 이어간다. 리치오 dynamic tools는 터미널에서 실행되지 않으므로 설치된 CLI를 사용한다. litzio --help와 각 명령의 --help로 설치 버전의 옵션·연산 schema를 확인한다.
- Host는 자기 CLI의 private shim을 자식 PATH 앞에 두며 시스템 PATH는 바꾸지 않는다. 리치오 밖에서 이어갈 때는 의도한 Host/카탈로그의 CLI인지 명시적으로 확인한다.
- 기존 문서 사본: litzio assistant changes start <conversationId> --path <absolute-original-path>. conversationId는 메시지 맥락에 있다. 반환된 사본 경로에 litzio inspect <copy> --format json, litzio apply-batch <copy> --operations <json-file> --if-revision <revision>, litzio check <copy>를 사용한다. 구조 변경 뒤 inspect로 경로·revision을 갱신한다. 적용·버리기는 사람이 리치오 비교 탭에서 한다.
- 새 문서: litzio create <new-file>, litzio inspect <file>, litzio apply-batch <file> --operations <json-file> --if-revision <revision>, litzio check <file> 순서로 작성·검사한다.
- 템플릿: litzio templates list --json --language <ko|en>, litzio templates read <id> --json --language <ko|en>, litzio create <new-file> --template <id> --language <ko|en>, litzio templates save <name> --from <file> --description <text>를 사용한다.
- CLI 생성에는 리치오 결과 카드·카드 Undo가 없으므로 경로·검사 결과를 텍스트로 보고한다. 셸 실행이 거부되면 Host 도구 등 허용된 경로를 사용한다.
`;
