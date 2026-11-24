// Spike pi extension: asks before pi's write/edit/bash run. Over ACP, pi-acp turns ui.confirm into
// session/request_permission (kind "other", no locations) for clients without form elicitation, such as Litzio.
export default function litzioApproval(pi) {
  pi.on("tool_call", async (event, ctx) => {
    if (!["write", "edit", "bash"].includes(event.toolName)) return undefined;
    const target = event.input?.path ?? event.input?.command ?? "";
    const ok = await ctx.ui.confirm(`${event.toolName} ${target}`, `Allow ${event.toolName}?`);
    return ok ? undefined : { block: true, reason: "The user did not allow this tool call." };
  });
}
