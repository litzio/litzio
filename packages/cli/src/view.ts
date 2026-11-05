import fs from "node:fs";
import path from "node:path";
import { viewOperations } from "../../../apps/editor/server/view-spike.ts";
export function viewCli(args: string[]) {
  const rootIndex = args.indexOf("--root");
  if (rootIndex < 0 || !args[rootIndex + 1]) throw new Error("Spike: explicit --root <opened-folder> required");
  const ops = viewOperations(path.resolve(args[rootIndex + 1]!));
  const file = path.resolve(args[2]!);
  const input = () => JSON.parse(fs.readFileSync(file, "utf8"));
  const result = args[1] === "validate" ? ops.validate(input()) : args[1] === "run" ? ops.run(ops.read(file).view) : args[1] === "save" ? ops.save(path.resolve(args[args.indexOf("--path") + 1]!), input(), args.includes("--expected-revision") ? args[args.indexOf("--expected-revision") + 1]! : null) : null;
  if (!result) throw new Error("Use view validate|run|save <file> --root <folder> --json [--path file --expected-revision hash]");
  console.log(JSON.stringify(result, null, 2));
}
