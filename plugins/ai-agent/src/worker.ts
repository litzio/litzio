import { Ajv } from "ajv";
import type { AiWorkerRequest, AiFailure } from "@litzio/plugin-api/ai";
import { AdapterError, runInSnapshot, selectedAdapter } from "./adapters.ts";

const controller = new AbortController();
let accepted = false;
process.once("disconnect", () => { controller.abort(); });
process.on("message", async (message: AiWorkerRequest | { type: "cancel" }) => {
  if (message.type === "cancel") { controller.abort(); return; }
  if (message.type !== "ai-task") return;
  if (accepted) return;
  accepted = true;
  try {
    const validate = new Ajv({ strict: true }).compile(message.request.schema);
    const text = await runInSnapshot(message, selectedAdapter(), controller.signal);
    let result: unknown;
    try { result = JSON.parse(text); } catch { throw new AdapterError("format", "AI result is not JSON."); }
    if (!validate(result)) throw new AdapterError("format", "AI result does not match the requested JSON Schema.");
    if (controller.signal.aborted) throw new AdapterError("cancelled", "AI task cancelled.");
    process.send?.({ type: "complete", result }, () => process.exit(0));
    if (!process.connected) process.exit(1);
  } catch (error) {
    const failure: AiFailure = error instanceof AdapterError && error.code === "uncertain" ? "uncertain" : controller.signal.aborted ? "cancelled" : error instanceof AdapterError ? error.code : "provider";
    process.send?.({ type: "failure", failure, message: error instanceof Error ? error.message : String(error) }, () => process.exit(1));
    if (!process.connected) process.exit(1);
  }
});
