import type { BuilderAnswers, BuilderDecision, BuilderReply, BuilderRound, BuilderSpec, BuilderWidget } from "../shared/plugin-builder.ts";

/** Deterministic interview used for tests and when Codex is unavailable (LITZIO_PLUGIN_BUILDER_MODE=scripted). */
export type ScriptState = { answers: BuilderAnswers; answered: Set<string>; decisions: BuilderDecision[]; pinned: Map<string, { value?: string; status?: BuilderDecision["status"] }>; userMessage: string };
const opt = (value: string, label: string, description = "") => ({ value, label, description });
const first = (state: ScriptState, id: string, fallback = "") => state.answers[id]?.[0] ?? fallback;
const many = (state: ScriptState, id: string, fallback: string[]) => state.answers[id] ?? fallback;
const widget = (w: Partial<BuilderWidget> & Pick<BuilderWidget, "id" | "type" | "label">): BuilderWidget => ({ help: "", options: [], placeholder: "", defaults: [], required: false, ...w });
const labelOf = (w: BuilderWidget, value: string) => w.options.find(option => option.value === value)?.label ?? value;

const featureOptions = [opt("list", "이슈 목록 조회", "상태·라벨로 걸러 표로 봐요"), opt("detail", "이슈 상세·댓글", "본문과 최근 댓글"), opt("link", "문서에 이슈 링크 삽입", "문서 본문에 링크를 넣어요"), opt("write", "이슈 만들기·댓글 쓰기", "쓰기 기능")];
const columnOptions = [opt("number", "번호"), opt("title", "제목"), opt("state", "상태"), opt("author", "작성자"), opt("labels", "라벨"), opt("assignee", "담당자"), opt("comments", "댓글 수"), opt("updated", "수정일"), opt("created", "생성일")];

function roundConnect(state: ScriptState): BuilderRound {
  const widgets = [
    widget({ id: "auth", type: "single", label: "인증 방식", help: "공개 저장소는 토큰 없이 읽을 수 있어요. 토큰은 비공개 저장소나 요청 한도가 필요할 때만 써요.", required: true,
      options: [opt("none", "공개 API만 (토큰 없음)", "비밀값을 저장하지 않아요"), opt("token", "개인 액세스 토큰(PAT)", "비공개 저장소 · 높은 요청 한도")], defaults: [first(state, "auth", "none")] }),
    widget({ id: "repo", type: "text", label: "저장소", help: "owner/name 형식이에요.", placeholder: "litzio/litzio", required: true, defaults: [first(state, "repo", "litzio/litzio")] }),
    widget({ id: "features", type: "multi", label: "필요한 기능", options: featureOptions, defaults: many(state, "features", ["list", "link"]) }),
  ];
  return { title: "연결 방식", intro: "먼저 어떤 GitHub 데이터에 어떻게 연결할지 정할게요.", step: 1, totalSteps: 3, widgets, notice: "토큰은 Host에만 저장되고 문서에는 남지 않아요." };
}
function roundToken(state: ScriptState): BuilderRound {
  return { title: "토큰 사용 확인", intro: "D2에서 토큰(PAT)을 쓰기로 바뀌어서, 기술적으로 확인할 것이 생겼어요.", step: 2, totalSteps: 4, notice: "현재 Linux Host는 플러그인 비밀값 저장을 지원하지 않아요(Windows Host 전용). 이 Host에서는 토큰 플러그인을 켤 수 없어요.", widgets: [
    widget({ id: "tokenScope", type: "single", label: "토큰 권한 범위", required: true, options: [opt("read", "읽기 전용 (repo:read)", "이슈 조회만"), opt("write", "쓰기 포함", "이슈 생성·댓글")], defaults: [first(state, "tokenScope", "read")] }),
    widget({ id: "tokenFallback", type: "toggle", label: "이 Host에서는 공개 API만으로 먼저 만들까요?", help: "켜면 토큰 없이 만들고 토큰 지원은 미정으로 남겨요.", defaults: [first(state, "tokenFallback", "true")] }),
  ] };
}
function roundFilters(state: ScriptState, step: number, total: number): BuilderRound {
  return { title: "조회 조건", intro: "어떤 이슈를 기본으로 보여 줄지 정해요.", step, totalSteps: total, notice: "", widgets: [
    widget({ id: "state", type: "single", label: "기본 상태", required: true, options: [opt("open", "열린 이슈만"), opt("closed", "닫힌 이슈만"), opt("all", "전체")], defaults: [first(state, "state", "open")] }),
    widget({ id: "labels", type: "text", label: "라벨 필터", help: "쉼표로 구분해요. 비우면 걸러내지 않아요.", placeholder: "bug, enhancement", defaults: [first(state, "labels", "")] }),
    widget({ id: "assignee", type: "text", label: "담당자 필터", help: "GitHub 사용자 이름. 비우면 모두예요.", placeholder: "SWBaek", defaults: [first(state, "assignee", "")] }),
    widget({ id: "prs", type: "toggle", label: "풀 리퀘스트도 포함", help: "GitHub 이슈 API는 PR도 함께 돌려줘요.", defaults: [first(state, "prs", "false")] }),
  ] };
}
function roundColumns(state: ScriptState, step: number, total: number): BuilderRound {
  const edited = [...state.pinned.keys()].map(id => state.decisions.find(d => d.id === id)).filter(Boolean) as BuilderDecision[];
  const labelsEdited = edited.find(d => d.field === "labels");
  const defaults = many(state, "columns", ["number", "title", "state", ...(labelsEdited ? ["labels"] : []), "updated"]);
  const widgets = [
    widget({ id: "columns", type: "multi", label: "표에 보일 열", required: true, options: columnOptions, defaults }),
    widget({ id: "pageSize", type: "single", label: "한 번에 보일 개수", help: "인증 없는 GitHub API는 시간당 60회까지라 작게 시작해요.", options: [opt("10", "10개"), opt("20", "20개"), opt("30", "30개")], defaults: [first(state, "pageSize", "20")] }),
  ];
  const notice = labelsEdited ? `D${labelsEdited.id.slice(1)} 수정(${labelsEdited.title}: ${labelsEdited.value})을 반영해 '라벨' 열을 기본으로 켰어요.` : "";
  return { title: "표시 열", intro: edited.length ? `당신이 바꾼 결정(${edited.map(d => d.id).join(", ")})은 그대로 두고 남은 것만 물을게요.` : "표에 어떤 정보를 보일지 정해요.", step, totalSteps: total, widgets, notice };
}

const upsert = (list: BuilderDecision[], next: BuilderDecision) => { const index = list.findIndex(d => d.id === next.id); if (index < 0) list.push(next); else list[index] = next; };
const featureText = (state: ScriptState) => many(state, "features", ["list"]).map(v => labelOf({ options: featureOptions } as BuilderWidget, v)).join(", ") || "없음";

export function decisionsAfter(state: ScriptState, key: string): BuilderDecision[] {
  const list = state.decisions.map(d => ({ ...d }));
  const put = (d: BuilderDecision) => { if (!state.pinned.has(d.id)) upsert(list, d); };
  if (key === "connect") {
    const token = first(state, "auth", "none") === "token";
    put({ id: "D1", title: "대상 서비스", value: "GitHub Issues (github.com)", status: "confirmed", reason: "요청에서 명시했어요.", field: "target" });
    put({ id: "D2", title: "인증", value: token ? "개인 액세스 토큰(PAT)" : "공개 API만 · 토큰 없음", status: token ? "proposed" : "confirmed", reason: token ? "비공개 저장소가 필요하다고 답했어요." : "공개 저장소는 비밀값 없이 읽을 수 있어요.", field: "auth" });
    put({ id: "D3", title: "저장소", value: first(state, "repo", "litzio/litzio"), status: "confirmed", reason: "직접 입력한 대상이에요.", field: "repo" });
    put({ id: "D4", title: "범위", value: many(state, "features", []).includes("write") ? "읽기 + 쓰기" : "읽기 전용", status: many(state, "features", []).includes("write") ? "open" : "proposed", reason: many(state, "features", []).includes("write") ? "쓰기는 토큰과 확인 절차가 필요해서 더 정해야 해요." : "쓰기 기능을 고르지 않았어요.", field: "scope" });
    put({ id: "D5", title: "기능", value: featureText(state), status: "confirmed", reason: "선택한 기능이에요.", field: "features" });
    if (many(state, "features", []).includes("link")) put({ id: "D6", title: "문서에 링크 삽입", value: "미정 · 표의 번호 링크로 대신", status: "open", reason: "플러그인 SDK에는 문서 삽입 기여 지점이 아직 없어요.", field: "other" });
  }
  if (key === "token") {
    const fallback = first(state, "tokenFallback", "true") === "true";
    if (fallback) put({ id: "D2", title: "인증", value: "공개 API만 · 토큰 없음", status: "confirmed", reason: "Linux Host는 플러그인 비밀값을 저장하지 못해요.", field: "auth" });
    put({ id: "D7", title: "토큰 권한", value: first(state, "tokenScope", "read") === "read" ? "읽기 전용" : "쓰기 포함", status: fallback ? "open" : "proposed", reason: fallback ? "토큰 지원은 나중으로 미뤄요." : "Windows Host에서 PAT를 쓸 경우예요.", field: "other" });
  }
  if (key === "filters") {
    const labels = first(state, "labels", ""), assignee = first(state, "assignee", "");
    put({ id: "D8", title: "상태 필터", value: ({ open: "열린 이슈", closed: "닫힌 이슈", all: "전체" } as Record<string, string>)[first(state, "state", "open")] ?? "열린 이슈", status: "confirmed", reason: "기본 조회 상태예요.", field: "state" });
    put({ id: "D9", title: "라벨 필터", value: labels || "없음", status: labels ? "confirmed" : "proposed", reason: labels ? "입력한 라벨만 보여요." : "필터 없이 모두 보여요.", field: "labels" });
    put({ id: "D10", title: "담당자 필터", value: assignee || "없음", status: assignee ? "confirmed" : "proposed", reason: assignee ? "입력한 사용자만 보여요." : "담당자로 거르지 않아요.", field: "assignee" });
    put({ id: "D11", title: "풀 리퀘스트", value: first(state, "prs", "false") === "true" ? "포함 요청 · 이번 생성기는 이슈만" : "제외 · 이슈만", status: first(state, "prs", "false") === "true" ? "open" : "confirmed", reason: "GitHub 이슈 API는 PR도 돌려줘서 걸러야 해요.", field: "other" });
  }
  if (key === "columns") {
    put({ id: "D12", title: "표시 열", value: many(state, "columns", []).map(v => labelOf({ options: columnOptions } as BuilderWidget, v)).join(" · "), status: "confirmed", reason: "표에 보일 열이에요.", field: "columns" });
    put({ id: "D13", title: "표시 개수", value: `${first(state, "pageSize", "20")}개`, status: "confirmed", reason: "인증 없는 요청 한도(시간당 60회)를 아껴요.", field: "limit" });
  }
  return list;
}

export function specFromState(state: ScriptState): BuilderSpec {
  const labels = first(state, "labels", "");
  return { template: "github-issues", pluginName: "GitHub 이슈", pluginId: "github-issues", repo: first(state, "repo", "litzio/litzio"), auth: first(state, "auth", "none") === "token" && first(state, "tokenFallback", "false") !== "true" ? "token" : "none",
    state: (["open", "closed", "all"].includes(first(state, "state", "open")) ? first(state, "state", "open") : "open") as BuilderSpec["state"], labels, assignee: first(state, "assignee", ""),
    columns: many(state, "columns", ["number", "title", "state", "updated"]) as BuilderSpec["columns"], pageSize: Number(first(state, "pageSize", "20")) || 20,
    openQuestions: ["문서에 이슈 링크를 삽입하는 기능은 SDK 기여 지점이 생길 때 다시 정해요."] };
}

export function scriptedReply(state: ScriptState): BuilderReply {
  const empty: BuilderRound = { title: "", intro: "", step: 0, totalSteps: 0, widgets: [], notice: "" };
  const tokenWanted = [...state.pinned.entries()].some(([id, edit]) => state.decisions.find(d => d.id === id)?.field === "auth" && /토큰|PAT|token/i.test(edit.value ?? "") && !/없|불필요|no /i.test(edit.value ?? ""));
  const wantsToken = first(state, "auth", "none") === "token" || tokenWanted;
  const steps = wantsToken && !state.answered.has("token") ? 4 : 3;
  let key: string, round: BuilderRound, message: string;
  if (!state.answered.has("connect")) { key = "connect"; round = roundConnect(state); message = "먼저 연결부터 정해야 해요. 몇 가지만 여쭤볼게요."; }
  else if (wantsToken && !state.answered.has("token")) { key = "token"; round = roundToken(state); message = tokenWanted ? "D2를 토큰으로 바꿔 주셔서 질문을 바꿨어요. 이 Host에서의 한계부터 확인할게요." : "토큰을 고르셨네요. 이 Host의 제약부터 확인할게요."; }
  else if (!state.answered.has("filters")) { key = "filters"; round = roundFilters(state, steps - 1, steps); message = "이제 어떤 이슈를 기본으로 보여 줄지 정해요."; }
  else if (!state.answered.has("columns")) { key = "columns"; round = roundColumns(state, steps, steps); message = "마지막으로 표 모양만 정하면 돼요."; }
  else {
    const spec = specFromState(state);
    const nodes = [
      { id: "user", label: "사용자", detail: "비서에게 질문하거나 화면에서 조회", kind: "user" as const },
      { id: "plugin", label: "GitHub 이슈 플러그인", detail: `community · ${spec.repo}`, kind: "plugin" as const },
      { id: "settings", label: "설정", detail: "저장소만 저장 · 토큰 없음", kind: "settings" as const },
      { id: "api", label: "GitHub REST API", detail: `GET /repos/${spec.repo}/issues`, kind: "api" as const },
      { id: "result", label: "결과 표", detail: spec.columns.slice(0, 4).join(" · "), kind: "result" as const },
      { id: "health", label: "연결 확인", detail: `GET /repos/${spec.repo}`, kind: "health" as const },
    ];
    const edges = [{ from: "user", to: "plugin", label: "조회" }, { from: "settings", to: "plugin", label: "저장소" }, { from: "plugin", to: "api", label: "fetch" }, { from: "api", to: "result", label: "이슈 JSON" }, { from: "plugin", to: "health", label: "점검" }];
    return { message: "충분히 모였어요. 개발 계획을 만들었으니 확인하고 승인해 주세요.", phase: "plan", round: empty, decisions: state.decisions.map(d => ({ ...d })),
      plan: { summary: `${spec.repo}의 ${spec.state === "open" ? "열린" : spec.state === "closed" ? "닫힌" : "모든"} 이슈를 토큰 없이 읽기 전용으로 보여 주는 플러그인이에요.`, nodes, edges, spec } };
  }
  const decisions = state.decisions.map(d => ({ ...d }));
  return { message, phase: "interview", round, decisions, plan: { summary: "", nodes: [], edges: [], spec: { ...specFromState(state), pluginName: "", pluginId: "" } } };
}
export function scriptedRoundKey(round: BuilderRound): string {
  return round.title === "연결 방식" ? "connect" : round.title === "토큰 사용 확인" ? "token" : round.title === "조회 조건" ? "filters" : "columns";
}
