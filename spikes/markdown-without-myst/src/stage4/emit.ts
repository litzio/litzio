// Write the stage-4 documents in the external profile (input of paths 2, 3 and 4) and the model JSON.
import { mkdirSync, writeFileSync } from "node:fs";
import { parse, serialize } from "../../../../packages/core/src/index.ts";
import { coreModel } from "../model.ts";
import { writeDocument } from "../external/write.ts";
import { inScopeSynthetic } from "./synthetic.ts";
const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
for (const size of [2300, 5000]) {
  const canonical = serialize(parse(inScopeSynthetic(size)));
  const model = coreModel(parse(canonical), canonical);
  writeFileSync(`${dir}/myst-${size}.md`, canonical);
  writeFileSync(`${dir}/external-${size}.md`, writeDocument(model));
  writeFileSync(`${dir}/model-${size}.json`, JSON.stringify(model));
}
