import { z } from "zod";

/**
 * Plugin builder spike: the only things the assistant may ask the client to render.
 * A closed set of four form widgets, decision cards and plan nodes/edges. There is no
 * UI DSL, layout language, HTML or code: the bundled client owns every pixel.
 * Relation to #1341/#767: this is the "협의형" (agree-on-a-spec) use case only; the
 * removed view_catalog/propose_view/saved-view machinery is not reintroduced.
 */
export const PLUGIN_BUILDER = { route: "/api/plugin-builder" } as const;
export const BUILDER_TEMPLATES = ["github-issues", "other"] as const;
export const ISSUE_COLUMNS = ["number", "title", "state", "author", "labels", "assignee", "comments", "updated", "created"] as const;
export const DECISION_FIELDS = ["", "target", "auth", "repo", "scope", "features", "state", "labels", "assignee", "columns", "limit", "other"] as const;

const text = (max: number) => z.string().trim().max(max);
const slug = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
export const widgetSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/),
  type: z.enum(["single", "multi", "text", "toggle"]),
  label: text(80).min(1),
  help: text(200),
  options: z.array(z.strictObject({ value: z.string().regex(/^[^\s][^\n]{0,59}$/), label: text(60).min(1), description: text(120) })).max(10),
  placeholder: text(80),
  /** single: [value]; multi: values; text: [text]; toggle: ["true"|"false"]. */
  defaults: z.array(text(120)).max(10),
  required: z.boolean(),
}).superRefine((widget, ctx) => {
  const choice = widget.type === "single" || widget.type === "multi";
  if (choice && widget.options.length < 2) ctx.addIssue({ code: "custom", message: "choice widget needs 2+ options" });
  if (!choice && widget.options.length) ctx.addIssue({ code: "custom", message: "only choice widgets have options" });
  if (choice && widget.defaults.some(value => !widget.options.some(option => option.value === value))) ctx.addIssue({ code: "custom", message: "default is not an option" });
  if (widget.type === "single" && widget.defaults.length > 1) ctx.addIssue({ code: "custom", message: "single has one default" });
});
export const roundSchema = z.strictObject({
  title: text(60), intro: text(300), step: z.number().int().min(0).max(9), totalSteps: z.number().int().min(0).max(9),
  widgets: z.array(widgetSchema).max(6), notice: text(240),
}).refine(round => new Set(round.widgets.map(widget => widget.id)).size === round.widgets.length, "duplicate widget ids");
export const decisionSchema = z.strictObject({
  id: z.string().regex(/^D[0-9]{1,2}$/), title: text(40).min(1), value: text(160).min(1),
  status: z.enum(["confirmed", "open", "proposed"]), reason: text(160),
  /** Which plan-spec field this decision governs; "" for none. */
  field: z.enum(DECISION_FIELDS),
});
export const nodeSchema = z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/), label: text(40).min(1), detail: text(80),
  kind: z.enum(["user", "plugin", "settings", "api", "result", "health", "document"]) });
export const edgeSchema = z.strictObject({ from: z.string(), to: z.string(), label: text(30) });
export const specSchema = z.strictObject({
  template: z.enum(BUILDER_TEMPLATES), pluginName: text(40), pluginId: z.union([slug, z.literal("")]),
  repo: z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100})?$/),
  auth: z.enum(["none", "token"]), state: z.enum(["open", "closed", "all"]),
  labels: text(120), assignee: text(60),
  columns: z.array(z.enum(ISSUE_COLUMNS)).max(9), pageSize: z.number().int().min(1).max(30),
  openQuestions: z.array(text(120)).max(6),
});
export const planSchema = z.strictObject({
  summary: text(300), nodes: z.array(nodeSchema).max(10), edges: z.array(edgeSchema).max(14), spec: specSchema,
}).superRefine((plan, ctx) => {
  const ids = new Set(plan.nodes.map(node => node.id));
  if (ids.size !== plan.nodes.length) ctx.addIssue({ code: "custom", message: "duplicate node ids" });
  if (plan.edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to))) ctx.addIssue({ code: "custom", message: "edge references unknown node" });
});
export const replySchema = z.strictObject({
  message: text(400).min(1), phase: z.enum(["interview", "plan"]), round: roundSchema,
  decisions: z.array(decisionSchema).max(16), plan: planSchema,
}).superRefine((reply, ctx) => {
  if (reply.phase === "interview" && !reply.round.widgets.length) ctx.addIssue({ code: "custom", message: "interview needs widgets" });
  if (reply.phase === "plan" && (reply.plan.nodes.length < 3 || !reply.plan.spec.pluginName)) ctx.addIssue({ code: "custom", message: "plan needs nodes and a spec" });
  if (new Set(reply.decisions.map(decision => decision.id)).size !== reply.decisions.length) ctx.addIssue({ code: "custom", message: "duplicate decision ids" });
});

export type BuilderWidget = z.infer<typeof widgetSchema>;
export type BuilderRound = z.infer<typeof roundSchema>;
export type BuilderDecision = z.infer<typeof decisionSchema> & { userEdited?: boolean };
export type BuilderPlan = z.infer<typeof planSchema>;
export type BuilderSpec = z.infer<typeof specSchema>;
export type BuilderReply = z.infer<typeof replySchema>;
export type BuilderAnswers = Record<string, string[]>;
export type BuilderDecisionEdit = { id: string; value?: string; status?: BuilderDecision["status"] };
export type BuilderTurnRequest = { action: "turn"; sessionId?: string; intent: "start" | "answers" | "revise"; message?: string; answers?: BuilderAnswers; edits?: BuilderDecisionEdit[] };
export type BuilderBackend = { mode: "codex" | "scripted"; model?: string; effort?: string; fallbackReason?: string };
export type BuilderTurnResult = Omit<BuilderReply, "decisions"> & { sessionId: string; turn: number; decisions: BuilderDecision[]; backend: BuilderBackend; turnMs: number };
export type BuilderInstallStep = { id: string; label: string; ok: boolean; detail?: string };
export type BuilderApproveResult = { ok: boolean; pluginId?: string; steps: BuilderInstallStep[]; directory?: string; sample?: { total?: number; truncated: boolean; rows: Record<string, string>[] }; limitation?: string; howTo: string[] };

const optionJson = { type: "object", additionalProperties: false, required: ["value", "label", "description"], properties: { value: { type: "string" }, label: { type: "string" }, description: { type: "string" } } };
const widgetJson = { type: "object", additionalProperties: false, required: ["id", "type", "label", "help", "options", "placeholder", "defaults", "required"], properties: {
  id: { type: "string" }, type: { type: "string", enum: ["single", "multi", "text", "toggle"] }, label: { type: "string" }, help: { type: "string" },
  options: { type: "array", items: optionJson }, placeholder: { type: "string" }, defaults: { type: "array", items: { type: "string" } }, required: { type: "boolean" } } };
const str = { type: "string" };
/** OpenAI strict structured-output form of replySchema: every property required, no unions. */
export const REPLY_JSON_SCHEMA = { type: "object", additionalProperties: false, required: ["message", "phase", "round", "decisions", "plan"], properties: {
  message: str, phase: { type: "string", enum: ["interview", "plan"] },
  round: { type: "object", additionalProperties: false, required: ["title", "intro", "step", "totalSteps", "widgets", "notice"], properties: {
    title: str, intro: str, step: { type: "integer" }, totalSteps: { type: "integer" }, widgets: { type: "array", items: widgetJson }, notice: str } },
  decisions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "value", "status", "reason", "field"], properties: {
    id: str, title: str, value: str, status: { type: "string", enum: ["confirmed", "open", "proposed"] }, reason: str, field: { type: "string", enum: [...DECISION_FIELDS] } } } },
  plan: { type: "object", additionalProperties: false, required: ["summary", "nodes", "edges", "spec"], properties: {
    summary: str,
    nodes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "detail", "kind"], properties: { id: str, label: str, detail: str, kind: { type: "string", enum: ["user", "plugin", "settings", "api", "result", "health", "document"] } } } },
    edges: { type: "array", items: { type: "object", additionalProperties: false, required: ["from", "to", "label"], properties: { from: str, to: str, label: str } } },
    spec: { type: "object", additionalProperties: false, required: ["template", "pluginName", "pluginId", "repo", "auth", "state", "labels", "assignee", "columns", "pageSize", "openQuestions"], properties: {
      template: { type: "string", enum: [...BUILDER_TEMPLATES] }, pluginName: str, pluginId: str, repo: str, auth: { type: "string", enum: ["none", "token"] },
      state: { type: "string", enum: ["open", "closed", "all"] }, labels: str, assignee: str,
      columns: { type: "array", items: { type: "string", enum: [...ISSUE_COLUMNS] } }, pageSize: { type: "integer" }, openQuestions: { type: "array", items: str } } } } },
} } as const;
