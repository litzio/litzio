import { parseArgs } from "node:util";
import { executeAppReset, inspectAppReset, localResetLocations } from "../../../apps/editor/server/app-reset.ts";

export async function appResetCli(args: string[]): Promise<number> {
  try {
    const [action, ...flags] = args;
    if (action !== "inspect" && action !== "apply") throw new Error("Use app-reset inspect or apply.");
    const { values, tokens } = parseArgs({ args: flags, strict: true, allowPositionals: false, tokens: true, options: {
      profile: { type: "string" }, "updater-cache": { type: "string" }, "remove-folders": { type: "boolean" },
      confirm: { type: "boolean" }, revision: { type: "string" }, json: { type: "boolean" },
    } });
    const seen = new Set<string>();
    for (const token of tokens) if (token.kind === "option") {
      if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once.`);
      seen.add(token.name);
    }
    if (action === "inspect" && (values.confirm || values.revision)) throw new Error("inspect does not accept confirmation or revision.");
    const locations = localResetLocations(values.profile, values["updater-cache"]);
    const result = action === "inspect" ? { outcome: "success", plan: inspectAppReset(locations) }
      : executeAppReset(locations, { confirmed: values.confirm === true, revision: values.revision ?? "", removeFolders: values["remove-folders"] === true });
    process.stdout.write(JSON.stringify(result) + "\n");
    return result.outcome === "success" ? 0 : 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ outcome: "refused", reason: (error as Error).message }) + "\n");
    return 1;
  }
}
