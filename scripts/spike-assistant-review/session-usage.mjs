import { readFileSync } from "node:fs";

// Pass only the rollout corresponding to the measured conversation ID.
const rows = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).map(JSON.parse);
const version = rows.find(row => row.type === "session_meta")?.payload.cli_version;
const turns = rows.filter(row => row.type === "turn_context").map(({ payload: context }) => {
  const responses = new Map(rows
    .filter(row => row.type === "token_usage_record" && row.payload.turn_id === context.turn_id && row.payload.response_id)
    .map(row => [row.payload.response_id, row.payload.usage]));
  const tokens = [...responses.values()];
  const sum = field => tokens.length ? tokens.reduce((count, usage) => count + (usage[field] ?? 0), 0) : null;
  const finished = rows.find(row => row.type === "event_msg" && row.payload.type === "task_complete" && row.payload.turn_id === context.turn_id);
  return {
    model: context.model,
    effort: context.effort,
    providerSeconds: finished?.payload.duration_ms / 1000 || null,
    observedResponsesWithUsage: responses.size,
    lastResponseTokens: tokens.at(-1)?.total_tokens ?? null,
    totalTokens: sum("total_tokens"),
    inputTokens: sum("input_tokens"),
    cachedInputTokens: sum("cached_input_tokens"),
    outputTokens: sum("output_tokens"),
    reasoningOutputTokens: sum("reasoning_output_tokens"),
  };
});
console.log(JSON.stringify({ version, turns }));
