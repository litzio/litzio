// Chromium preserves SVG luminance masks. Reuse the pinned Electron; no browser download.
import { writeFileSync } from "node:fs";
import { faviconSvg } from "../../../scripts/brand-icons.ts";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { brand } from "../../../brand.ts";
import { repo } from "../../../scripts/brand-icons.ts";
const require = createRequire(import.meta.url);
const result = spawnSync(require("electron") as string, [path.join(import.meta.dirname, "rasterize-icons.cjs"), JSON.stringify({ repo, icons: brand.icons })], {
  stdio: "inherit", windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Icon rasterization failed (${result.status})`);

writeFileSync(path.join(repo, "apps/editor/public/favicon.svg"), faviconSvg());
