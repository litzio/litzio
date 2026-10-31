import { codexAdapter, fakeAdapter } from "./adapters.ts";

process.once("message", async (request: any) => {
  try {
    if (request?.operation !== "propose") throw new Error("Unsupported AI worker operation.");
    const adapter = request.adapter === "fake" ? fakeAdapter : codexAdapter;
    const markdown = await adapter(request);
    process.send!({ type: "result", markdown }, () => process.disconnect());
  } catch (error) {
    process.send!({ type: "error", error: error instanceof Error ? error.message : String(error) }, () => process.disconnect());
  }
});
