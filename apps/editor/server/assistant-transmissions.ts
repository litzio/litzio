import { randomUUID } from "node:crypto";

import type { AssistantTransmission } from "../shared/assistant-transmissions.ts";
export type { AssistantTransmission } from "../shared/assistant-transmissions.ts";

export type TransmissionObserver = (event: AssistantTransmission) => void | Promise<void>;

/** A detached JSON snapshot keeps an observer from changing the actual send. */
export function observeTransmission(observer: TransmissionObserver | undefined,
  metadata: Pick<AssistantTransmission, "provider" | "method" | "conversationId" | "turnId" | "tool" | "requestId" | "sources">,
  serialized: string) {
  const id = randomUUID(), at = Date.now(), bytes = Buffer.byteLength(serialized, "utf8");
  const report = (status: AssistantTransmission["status"], turnId = metadata.turnId, conversationId = metadata.conversationId) => {
    if (!observer) return;
    try {
      // Never send exception text to the log: provider errors can contain private data.
      const result = observer({ ...metadata, id, at, bytes, payload: JSON.parse(serialized), status, turnId, conversationId });
      if (result) void Promise.resolve(result).catch(() => {});
    } catch { /* Logging must not replace a successful send or provider failure. */ }
  };
  report("attempted");
  return report;
}

/** Classify the content actually placed in the outbound envelope, not editor drafts. */
export function transmissionSources(context: Record<string, any>, explicitPaths: string[], message: string) {
  const sources: NonNullable<AssistantTransmission["sources"]> = [];
  const add = (kind: typeof sources[number]["kind"], label: string, value: unknown) => {
    if (value !== undefined) sources.push({ kind, label, bytes: Buffer.byteLength(JSON.stringify(value), "utf8") });
  };
  add("user", "message", message);
  for (const [key, value] of Object.entries(context)) {
    if (key === "references") for (const ref of value ?? []) add(explicitPaths.includes(ref.path) || ref.kind === "skill" ? "attachment" : "automatic", ref.path, ref);
    else if (key === "viewGeneration" || key === "viewAuthoring") {
      const { materials, ...rest } = value;
      add("automatic", key, rest);
      const references = (context.references ?? []).filter((ref: any) => ref.kind !== "skill");
      for (const [index, material] of (materials ?? []).entries()) {
        const reference = references[index];
        const label = reference?.path ?? material.provenance?.path ?? material.provenance?.label ?? key;
        add(reference ? explicitPaths.includes(reference.path) ? "attachment" : "automatic" : material.provenance?.label === "Current view" ? "automatic" : "tool-result", label, material);
      }
    } else add(key === "userMessage" ? "user" : "automatic", key, value);
  }
  return sources;
}
