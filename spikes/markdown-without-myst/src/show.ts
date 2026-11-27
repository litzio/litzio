// Debug helper: print a document in a profile's format.
import { readFileSync } from "node:fs";
import { parse, serialize } from "../../../packages/core/src/index.ts";
import { coreModel } from "./model.ts";
import { PROFILES } from "./profiles.ts";
const [file, name = "external"] = process.argv.slice(2);
const profile = PROFILES[name];
const canonical = serialize(parse(readFileSync(file, "utf8")));
let model = coreModel(parse(canonical), canonical);
model = profile.prepare?.(model) ?? model;
process.stdout.write(profile.writeDocument(model));
