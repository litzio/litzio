import { z } from "zod";

const id = z.string().min(1).max(512), text = z.string().min(1).max(10000);
const hash = z.string().regex(/^[a-f0-9]{64}$/), page = z.number().int().positive();
const opaque = z.record(z.string(), z.unknown());
const unique = <T>(items: T[]) => new Set(items).size === items.length;
const assistantReviewSchema = z.strictObject({ actor: id, reason: text });
export const humanReviewSchema = z.strictObject({ actor: id, reason: text, confirmed: z.literal(true) });
export const reviewInspectionStateSchema = z.enum(["not-inspected", "uncertain", "no-issue"]);
export const reviewScopeSchema = z.strictObject({ pages: z.array(page).min(1).max(10000).refine(unique), targets: z.array(id).max(10000).refine(unique) });
const inspectionScope = reviewScopeSchema.extend({ pages: z.array(page).max(10000).refine(unique) });
const region = z.strictObject({ page, bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]), ref: id });
export const reviewGroupTargetSchema = z.strictObject({
  id, locator: opaque, pages: z.array(page).max(10000), regions: z.array(region).max(10000), before: z.unknown(),
  evidence: z.array(z.strictObject({ observation: text, materialRef: id, materialHash: hash, inspector: id, scope: reviewScopeSchema })).min(1).max(1000),
  patch: z.strictObject({ expectedBefore: z.unknown(), expectedContentRevision: hash, operations: z.array(opaque).max(2000), after: z.unknown(), supported: z.boolean(), deferredReason: text.nullable() })
    .refine(patch => patch.supported ? patch.operations.length > 0 && patch.deferredReason === null : patch.deferredReason !== null, "Executable patches or an explicit deferral reason required"),
  inspection: reviewInspectionStateSchema,
  proposal: z.enum(["proposed", "approved", "rejected", "superseded"]),
  result: z.enum(["applied", "regeneration-required", "uncertain"]).nullable(),
  resolved: z.boolean(),
  history: z.array(z.strictObject({ id, action: z.enum(["approved", "rejected", "undone", "superseded"]), at: z.iso.datetime(), human: humanReviewSchema.nullable(), assistant: assistantReviewSchema.optional(), requestId: z.uuid(),
    result: z.enum(["applied", "regeneration-required", "uncertain"]).nullable(), inverseOperations: z.array(opaque).max(2000), undoOf: id.nullable(),
    supersededBy: z.strictObject({ groupId: id, targetIds: z.array(id).min(1).max(10000).refine(unique) }).optional(),
  }).refine(event => event.action === "superseded" ? event.human === null && !event.assistant && !!event.supersededBy : (event.human !== null && !event.assistant || event.human === null && !!event.assistant && event.action === "approved") && !event.supersededBy, "Supersede links and attributed correction decisions are separate evidence")).max(10000),
});
export const reviewGroupSchema = z.strictObject({
  id, reasonCode: id, reason: text, provider: id, providerVersion: id, sourceRevision: hash, contentRevision: hash,
  createdAt: z.iso.datetime(), runId: id, representativeTargetId: id, representativeReason: text,
  splitFrom: id.nullable(), targets: z.array(reviewGroupTargetSchema).min(1).max(10000),
}).superRefine((group, ctx) => {
  if (!unique(group.targets.map(t => t.id)) || !group.targets.some(t => t.id === group.representativeTargetId)) ctx.addIssue({ code: "custom", message: "Unique targets and a representative in the group required" });
});
export const requiredReviewCheckSchema = z.strictObject({
  id, kind: z.enum(["picture", "table"]), locator: opaque, pages: z.array(page).max(10000), regions: z.array(region).max(10000),
  disposition: z.enum(["supported", "unsupported", "excluded", "furniture"]), derivedFrom: z.array(id).max(10000),
});
const inspection = z.strictObject({ runId: id, lens: id, contentRevision: hash, scope: inspectionScope, state: reviewInspectionStateSchema, evidence: text });
export const reviewInspectionKindSchema = z.strictObject({
  kind: id, required: z.boolean(), scope: inspectionScope, extracted: z.boolean(),
});
const checkRecord = z.strictObject({ targetIds: z.array(id).min(1).max(10000).refine(unique), contentRevision: hash,
  result: z.enum(["no-issue", "uncertain"]),
  method: z.enum(["direct", "approved-comparison"]), human: humanReviewSchema, runId: id.nullable(),
  approvedRun: z.strictObject({ requestId: z.uuid(), scope: reviewScopeSchema, contentRevision: hash, completed: z.literal(true), resultRecorded: z.literal(true) }).nullable(), at: z.iso.datetime() });
const bodyComparison = z.strictObject({ contentRevision: hash, scope: reviewScopeSchema, state: z.enum(["not-compared", "partial", "compared"]), selected: z.boolean(), withdrawn: humanReviewSchema.nullable(), runId: id });
export const reviewLedgerSchema = z.strictObject({
  version: z.literal(1), revision: id,
  inventory: z.strictObject({ contentRevision: hash, pages: z.array(page).min(1).max(10000).refine(unique), targets: z.array(id).max(10000).refine(unique),
    lenses: z.array(reviewInspectionKindSchema).min(1).max(100).refine(kinds => unique(kinds.map(k => k.kind))), requiredChecks: z.array(requiredReviewCheckSchema).max(10000), complete: z.boolean() }).nullable(),
  groups: z.array(reviewGroupSchema).max(10000), inspections: z.array(inspection).max(10000), checks: z.array(checkRecord).max(10000), comparisons: z.array(bodyComparison).max(10000),
  approval: z.strictObject({ ledgerRevision: id, contentRevision: hash, snapshotHash: hash, human: humanReviewSchema, at: z.iso.datetime() }).nullable(),
}).superRefine((ledger, ctx) => {
  if (!unique(ledger.groups.map(g => g.id)) || ledger.inventory && !unique(ledger.inventory.requiredChecks.map(c => c.id))) ctx.addIssue({ code: "custom", message: "Duplicate review identity" });
  if (ledger.inventory?.lenses.some(kind => kind.scope.pages.some(p => !ledger.inventory!.pages.includes(p)) || kind.scope.targets.some(t => !ledger.inventory!.targets.includes(t)))) ctx.addIssue({ code: "custom", message: "Inspection kind outside inventory" });
});
export type ReviewLedger = z.infer<typeof reviewLedgerSchema>;
export type ReviewGroupTarget = z.infer<typeof reviewGroupTargetSchema>;
export const emptyReviewLedger = (): ReviewLedger => ({ version: 1, revision: "initial", inventory: null, groups: [], inspections: [], checks: [], comparisons: [], approval: null });

export const reviewLedgerChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("groups-propose"), groups: z.array(reviewGroupSchema).min(1).max(1000),
    supersedes: z.array(z.strictObject({ groupId: id, targetIds: z.array(id).min(1).max(10000).refine(unique), replacementGroupId: id })).max(1000).default([]) }),
  z.strictObject({ kind: z.literal("groups-apply"), groups: z.array(reviewGroupSchema).min(1).max(1000),
    supersedes: z.array(z.strictObject({ groupId: id, targetIds: z.array(id).min(1).max(10000).refine(unique), replacementGroupId: id })).max(1000).default([]),
    actor: z.union([humanReviewSchema.extend({source:z.literal("human")}), assistantReviewSchema.extend({source:z.literal("assistant")})]) }),
  ...(["groups-approve", "groups-reject", "groups-undo"] as const).map(kind => z.strictObject({ kind: z.literal(kind), groupId: id, targetIds: z.array(id).min(1).max(10000).refine(unique), remainderGroupId: id.optional(), human: humanReviewSchema.nullable(), assistant: assistantReviewSchema.optional(), resolvesIssue: z.boolean().default(false) }).refine(c => c.human !== null ? !c.assistant : c.kind === "groups-approve" && !!c.assistant, "Exactly one decision actor required")),
  z.strictObject({ kind: z.literal("inspection"), records: z.array(inspection).max(1000), comparisons: z.array(bodyComparison).max(1000) }),
  z.strictObject({ kind: z.literal("required-checks"), inventory: reviewLedgerSchema.shape.inventory.optional(), records: z.array(checkRecord).max(1000) }),
  z.strictObject({ kind: z.literal("completion"), human: humanReviewSchema }),
]);
export type ReviewLedgerChange = z.infer<typeof reviewLedgerChangeSchema>;

/** A run ID denotes one evolving run. Never fall back to an older success, even across revisions. */
function latestComparisons(ledger: ReviewLedger) {
  return new Map(ledger.comparisons.map(comparison => [comparison.runId, comparison]));
}
function validApprovedComparison(ledger: ReviewLedger, record: z.infer<typeof checkRecord>, contentRevision: string) {
  const run = record.runId ? latestComparisons(ledger).get(record.runId) : undefined, approval = record.approvedRun;
  const covers = (scope: z.infer<typeof reviewScopeSchema>, expected: z.infer<typeof reviewScopeSchema>) =>
    expected.pages.every(page => scope.pages.includes(page)) && expected.targets.every(target => scope.targets.includes(target));
  return !!(record.contentRevision === contentRevision && approval?.contentRevision === contentRevision && run?.contentRevision === contentRevision &&
    run.state === "compared" && run.selected && !run.withdrawn && covers(run.scope, approval.scope) &&
    record.targetIds.every(id => approval.scope.targets.includes(id) && run.scope.targets.includes(id) &&
      ledger.inventory?.requiredChecks.find(check => check.id === id)?.pages.every(page => approval.scope.pages.includes(page) && run.scope.pages.includes(page))));
}

// Locator objects stay opaque. Structural equality also prevents changing an ID or object-key order to evade duplicates.
function locatorIdentity(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(locatorIdentity).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${locatorIdentity(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function sameTarget(a: z.infer<typeof reviewGroupSchema>, target: ReviewGroupTarget, b: z.infer<typeof reviewGroupSchema>, other: ReviewGroupTarget) {
  return target.id === other.id || a.provider === b.provider && a.sourceRevision === b.sourceRevision && locatorIdentity(target.locator) === locatorIdentity(other.locator);
}
function assertNoOpenDuplicate(groups: readonly z.infer<typeof reviewGroupSchema>[], group: z.infer<typeof reviewGroupSchema>, target: ReviewGroupTarget) {
  for (const otherGroup of groups) {
    if (otherGroup.reasonCode !== group.reasonCode) continue;
    const conflict = otherGroup.targets.find(other => other !== target && other.proposal === "proposed" && sameTarget(group,target,otherGroup,other));
    if (conflict) throw new Error(`Duplicate open target for the same reason: group ${JSON.stringify(otherGroup.id)}, target ${JSON.stringify(conflict.id)}; process that proposal before opening another`);
  }
}

/** Snapshot validity and unsettled requests are supplied by the common Host, not inferred from a cache's existence. */
export function evaluateReviewCompletion(ledger: ReviewLedger, contentRevision: string, snapshotHash: string | null, current: boolean) {
  const incomplete: string[] = [], inventory = ledger.inventory;
  if (!inventory || !inventory.complete || inventory.contentRevision !== contentRevision) incomplete.push("inventory-incomplete-or-stale");
  if (inventory) for (const lens of inventory.lenses.filter(kind => kind.required)) {
    const runs = ledger.inspections.filter(i => i.lens === lens.kind && i.contentRevision === contentRevision);
    // Latest observation for each page/item owns its state; an older success cannot hide a failed rerun.
    const covered = (key: "pages" | "targets", value: number | string) => [...runs].reverse().find(i => (i.scope[key] as (string | number)[]).includes(value))?.state === "no-issue";
    if (!lens.extracted || !lens.scope.pages.every(p => covered("pages", p)) || !lens.scope.targets.every(t => covered("targets", t))) incomplete.push(`lens-incomplete:${lens.kind}`);
  }
  if (ledger.groups.some(g => g.targets.some(t => t.proposal !== "superseded" && (!t.resolved || t.inspection !== "no-issue" || t.result === "uncertain" || t.result === "regeneration-required")))) incomplete.push("open-or-uncertain-groups");
  if (inventory?.requiredChecks.some(c => {
    const record = [...ledger.checks].reverse().find(r => r.contentRevision === contentRevision && r.targetIds.includes(c.id));
    return record?.result !== "no-issue" || record.method === "approved-comparison" && !validApprovedComparison(ledger, record, contentRevision);
  })) incomplete.push("required-checks-incomplete");
  const comparisons = [...latestComparisons(ledger).values()].filter(c => c.contentRevision === contentRevision);
  const selected = comparisons.filter(c => c.selected && !c.withdrawn);
  if (selected.some(c => c.state !== "compared")) incomplete.push("selected-comparison-incomplete");
  if (!current || !snapshotHash) incomplete.push("snapshot-not-current-or-request-unsettled");
  const comparedPages = new Set(comparisons.filter(c => c.state === "compared" && !c.withdrawn && !c.scope.targets.length).flatMap(c => c.scope.pages));
  return { ready: !incomplete.length, incomplete, contentRevision, snapshotHash, ledgerRevision: ledger.revision,
    notComparedPages: inventory?.pages.filter(p => !comparedPages.has(p)) ?? [],
    approved: !incomplete.length && ledger.approval?.ledgerRevision === ledger.revision && ledger.approval.contentRevision === contentRevision && ledger.approval.snapshotHash === snapshotHash };
}

/** Provider-owned record update. Target-content checks and Core operations are delegated and never interpreted by the Host or CLI. */
export function updateReviewLedger(raw: ReviewLedger, rawChange: ReviewLedgerChange, context: {
  contentRevision: string; snapshotHash: string; current: boolean; requestId: string; revision: string; at: string;
  apply(target: ReviewGroupTarget): z.infer<typeof reviewGroupTargetSchema>["history"][number]["inverseOperations"];
  undo(target: ReviewGroupTarget, inverse: z.infer<typeof reviewGroupTargetSchema>["patch"]["operations"]): void;
}): ReviewLedger {
  const ledger = structuredClone(reviewLedgerSchema.parse(raw)), change = reviewLedgerChangeSchema.parse(rawChange);
  if (change.kind === "groups-apply") {
    let next = updateReviewLedger(ledger, {kind:"groups-propose",groups:change.groups,supersedes:change.supersedes}, context);
    const {source,...actor}=change.actor;
    for (const group of change.groups) next = updateReviewLedger(next, {
      kind:"groups-approve",groupId:group.id,targetIds:group.targets.map(t=>t.id),resolvesIssue:true,
      human:source === "human" ? humanReviewSchema.parse(actor) : null,
      ...(source === "assistant" ? {assistant:assistantReviewSchema.parse(actor)} : {}),
    }, context);
    return next;
  }
  if (change.kind === "completion") {
    if (!evaluateReviewCompletion(ledger, context.contentRevision, context.snapshotHash, context.current).ready) throw new Error("Review completion conditions are not satisfied");
    ledger.approval = { ledgerRevision: ledger.revision, contentRevision: context.contentRevision, snapshotHash: context.snapshotHash, human: change.human, at: context.at };
    return ledger;
  }
  ledger.approval = null; ledger.revision = context.revision;
  if (change.kind === "groups-propose") {
    for (const group of change.groups) {
      if (ledger.groups.some(g => g.id === group.id) || group.splitFrom !== null || group.targets.some(t => t.proposal !== "proposed" || t.history.length || t.result !== null || t.resolved)) throw new Error("Invalid new review group");
      if (change.groups.filter(g => g.id === group.id).length !== 1) throw new Error("Duplicate new group identity");
    }
    let supersededCount = 0;
    for (const replacement of change.supersedes) {
      const old = ledger.groups.find(group => group.id === replacement.groupId), next = change.groups.find(group => group.id === replacement.replacementGroupId);
      if (!old || !next || old.reasonCode !== next.reasonCode) throw new Error("Supersede requires an existing group and a same-reason replacement");
      for (const targetId of replacement.targetIds) {
        const target = old.targets.find(target => target.id === targetId);
        if (!target || target.proposal !== "proposed") throw new Error("Only open proposed targets may be superseded");
        const matches = next.targets.filter(other => old.provider === next.provider && old.sourceRevision === next.sourceRevision && locatorIdentity(target.locator) === locatorIdentity(other.locator));
        if (matches.length !== 1) throw new Error("Replacement must preserve the superseded target identity");
        target.proposal = "superseded"; target.resolved = true;
        target.history.push({ id: `${context.revision}/superseded-${supersededCount++}`, action: "superseded", at: context.at, human: null, requestId: context.requestId,
          result: null, inverseOperations: [], undoOf: null, supersededBy: { groupId: next.id, targetIds: matches.map(target => target.id) } });
      }
    }
    for (const group of change.groups) {
      for (const target of group.targets) assertNoOpenDuplicate([...ledger.groups,group], group, target);
      ledger.groups.push(group);
    }
  } else if (change.kind === "inspection") {
    if ([...change.records, ...change.comparisons].some(r => r.contentRevision !== context.contentRevision)) throw new Error("Stale inspection");
    const inventory = ledger.inventory;
    if (!inventory || change.records.some(r => !inventory.lenses.some(kind => kind.kind === r.lens) || r.scope.pages.some(p => !inventory.pages.includes(p)) || r.scope.targets.some(t => !inventory.targets.includes(t)))) throw new Error("Inspection outside declared inventory");
    for (const next of change.comparisons) {
      const previous = [...ledger.comparisons].reverse().find(c => c.runId === next.runId && c.contentRevision === context.contentRevision);
      if (previous?.selected && !previous.withdrawn && !next.withdrawn && (!next.selected || previous.scope.pages.some(p => !next.scope.pages.includes(p)) || previous.scope.targets.some(t => !next.scope.targets.includes(t)))) throw new Error("Selected comparison withdrawal requires human evidence");
      ledger.comparisons.push(next);
    }
    ledger.inspections.push(...change.records);
  } else if (change.kind === "required-checks") {
    if (change.inventory !== undefined) {
      if (!change.inventory || change.inventory.contentRevision !== context.contentRevision) throw new Error("Current inventory required");
      // Revisions may refresh coverage, but cannot silently drop original confirmation obligations.
      if (ledger.inventory?.requiredChecks.some(c => !change.inventory!.requiredChecks.some(n => n.id === c.id))) throw new Error("Required inventory cannot lose source targets");
      if (ledger.inventory?.requiredChecks.some(c => {
        const next = change.inventory!.requiredChecks.find(n => n.id === c.id)!;
        return next.kind !== c.kind || JSON.stringify([next.locator,next.pages]) !== JSON.stringify([c.locator,c.pages]);
      })) throw new Error("Required source identity cannot be reassigned");
      if (ledger.inventory?.contentRevision === context.contentRevision) {
        if ((["pages", "targets"] as const).some(key => ledger.inventory![key].some(value => !(change.inventory![key] as (number|string)[]).includes(value)))) throw new Error("Current inspection inventory cannot shrink");
        if (ledger.inventory.lenses.some(kind => {
          const next = change.inventory!.lenses.find(n => n.kind === kind.kind);
          return !next || kind.required && !next.required || kind.extracted && !next.extracted ||
            kind.scope.pages.some(p => !next.scope.pages.includes(p)) || kind.scope.targets.some(t => !next.scope.targets.includes(t));
        })) throw new Error("Current inspection kinds and scopes cannot shrink");
      }
      ledger.inventory = change.inventory;
    }
    for (const record of change.records) {
      if (record.contentRevision !== context.contentRevision || record.targetIds.some(id => !ledger.inventory?.requiredChecks.some(c => c.id === id))) throw new Error("Unknown or stale required check");
      if (record.method === "approved-comparison" && !validApprovedComparison(ledger, record, context.contentRevision)) throw new Error("Completed approved comparison required at the latest run state and current revision");
      if (record.method === "direct" && (record.runId || record.approvedRun)) throw new Error("Direct check cannot claim a comparison run");
      ledger.checks.push(record);
    }
  } else {
    const group = ledger.groups.find(g => g.id === change.groupId);
    if (!group || change.targetIds.some(id => !group.targets.some(t => t.id === id))) throw new Error("Unknown group targets");
    const selected = group.targets.filter(t => change.targetIds.includes(t.id)), remaining = group.targets.filter(t => !change.targetIds.includes(t.id));
    // Preflight the entire Undo before splitting history or invoking any provider source replay.
    if (change.kind === "groups-undo") for (const target of selected) assertNoOpenDuplicate(ledger.groups, group, target);
    if (remaining.length) {
      if (!change.remainderGroupId || ledger.groups.some(g => g.id === change.remainderGroupId)) throw new Error("Explicit new remainder group required");
      ledger.groups.push({ ...structuredClone(group), id: change.remainderGroupId, splitFrom: group.id, targets: remaining, representativeTargetId: remaining[0]!.id, representativeReason: "First remaining target after explicit partial decision" });
      group.targets = selected;
      if (!selected.some(t => t.id === group.representativeTargetId)) { group.representativeTargetId = selected[0]!.id; group.representativeReason = "First selected target after explicit partial decision"; }
    }
    for (const target of change.kind === "groups-undo" ? [...selected].reverse() : selected) {
      const action = change.kind.slice(7) as "approve" | "reject" | "undo";
      let inverseOperations: ReviewGroupTarget["patch"]["operations"] = [], undoOf: string | null = null;
      if (action === "undo") {
        const previous = [...target.history].reverse().find(h => h.action === "approved");
        if (target.proposal !== "approved" || !previous || target.result !== "applied") throw new Error("No applied approval to undo");
        context.undo(target, previous.inverseOperations); undoOf = previous.id;
        target.proposal = "proposed"; target.result = null; target.resolved = false; target.inspection = "not-inspected";
      } else {
        if (target.proposal !== "proposed") throw new Error("Target already decided");
        if (action === "approve") {
          if (!target.patch.supported || target.patch.deferredReason || !target.patch.operations.length) throw new Error("Unsupported or stale proposal");
          inverseOperations = context.apply(target); target.result = "applied";
        }
        target.proposal = action === "approve" ? "approved" : "rejected";
        target.resolved = change.resolvesIssue; target.inspection = change.resolvesIssue ? "no-issue" : target.inspection;
      }
      target.history.push({ id: `${context.revision}/${target.id}`, action: action === "undo" ? "undone" : action === "approve" ? "approved" : "rejected", at: context.at, human: change.human, ...(change.assistant ? {assistant:change.assistant} : {}), requestId: context.requestId, result: target.result, inverseOperations, undoOf });
    }
  }
  return reviewLedgerSchema.parse(ledger);
}
