import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export type OfficialPlugin = { id: string; publisher: string; digest: string; directory: string; defaultEnabled: boolean };
const root = new URL(import.meta.url.endsWith(".ts") ? "../../../../plugins/" : "./official-plugins/", import.meta.url);
// Product-owned identity and policy; digest is generated alongside the artifact at build time.
export const OFFICIAL_PLUGINS: OfficialPlugin[] = [{
  id: "litzio.onedrive", publisher: "litzio", defaultEnabled: false,
  directory: fileURLToPath(new URL("onedrive/artifact/", root)),
  digest: (() => { try { return JSON.parse(readFileSync(new URL("onedrive/digest.json", root), "utf8")).digest; } catch { return ""; } })(),
}];
