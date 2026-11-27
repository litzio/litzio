// Dump the external profile writer's effective unsafe patterns (ported to Rust as data).
import { writeFileSync } from "node:fs";
import { unified } from "unified";
import { writer } from "../external/format.ts";
let captured: unknown[] = [];
const probe = unified().use(function (this: any) {
  const data = writer.data() as any;
  Object.assign(this.data(), { ...data });
}).data();
// Run the real writer once with a spy handler to read state.unsafe.
const spy = writer().use(function (this: any) {
  (this.data().toMarkdownExtensions ??= []).push({ handlers: { spyNode(_n: unknown, _p: unknown, state: any) { captured = state.unsafe; return ""; } } });
});
spy.stringify({ type: "root", children: [{ type: "spyNode" }] } as any);
const plain = (captured as any[]).map(({ _compiled, ...rest }) => rest);
writeFileSync(new URL("../../rust/src/unsafe.json", import.meta.url), JSON.stringify(plain, null, 1) + "\n");
console.log(plain.length);
