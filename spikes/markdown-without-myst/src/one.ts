import { readFileSync } from "node:fs";
import { parse, serialize } from "../../../packages/core/src/index.ts";
import { roundTrip } from "./roundtrip.ts";
import { PROFILES } from "./profiles.ts";
const [file, profileName = "directive", mode] = process.argv.slice(2);
const source = readFileSync(file, "utf8");
try { const c = serialize(parse(source)); if (mode === "core") console.log(c); } catch (e) { console.log("CORE REFUSED", String(e).slice(0, 400)); process.exit(1); }
console.log(JSON.stringify(roundTrip({ name: file, source }, PROFILES[profileName], (a, md) => { if (mode !== "core") console.log(md); }), null, 1));
