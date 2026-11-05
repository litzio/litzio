import fs from "node:fs";
import path from "node:path";
const root = path.resolve("tmp/dynamic-ui");
for (const folder of ["fixture/alpha", "fixture/beta", "evidence", "captures"]) fs.mkdirSync(path.join(root, folder), { recursive: true });
for (const file of ["alpha/one.md", "beta/two.md", "beta/three.md"]) fs.copyFileSync("apps/editor/document/technical-document.md", path.join(root, "fixture", file));
console.log(`Fixture prepared: ${root}. Set LITZIO_VIEW_SPIKE=1, LITZIO_VIEW_ROOT=${path.join(root, "fixture")}, LITZIO_VIEW_EVIDENCE=${path.join(root, "evidence")} before pnpm editor.`);
