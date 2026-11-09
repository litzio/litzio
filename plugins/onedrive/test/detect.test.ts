import test from "node:test";
import assert from "node:assert/strict";
import { detect } from "../src/host.ts";
import { parseAccounts } from "../src/registry.ts";
import type { PluginContext } from "@litzio/plugin-sdk";
const context = (env = {}): PluginContext => ({ platform: "win32", env, settings: {}, isDirectory: p => !p.includes("missing") });
const empty = () => ({ accounts: [], complete: true });
test("single, multiple, absent and stale folders preserve evidence without inferring account state", () => {
  const one = detect(context({ OneDrive: "C:\\files", OneDriveConsumer: "c:\\FILES\\" }), empty);
  assert.equal(one.folders.length, 1); assert.equal(one.folders[0]?.defaultCandidate, true);
  assert.deepEqual(one.decorations, [{ id: "folder-0", path: "C:\\files", icon: "plugin" }]);
  const multiple = detect(context({ OneDrive: "C:\\files" }), () => ({ complete: true, accounts: [{ UserFolder: "D:\\work", UserEmail: "verified@example.test" }] }));
  assert.equal(multiple.folders.length, 2); assert.ok(multiple.folders.every(f => !f.defaultCandidate)); assert.equal(multiple.accounts[1]?.label, "verified@example.test");
  assert.equal(detect(context(), empty).folders.length, 0);
  const stale = detect(context({ OneDrive: "C:\\missing" }), () => ({ complete: false, accounts: [{}, { UserFolder: "D:\\missing" }] }));
  assert.equal(stale.folders.length, 0); assert.match(stale.message, /unavailable.*2 incomplete/);
  assert.equal(detect({ ...context(), platform: "linux" }, () => { throw Error("must not query"); }).available, false);
  assert.equal(parseAccounts("HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Personal\n    UserFolder    REG_SZ    C:\\space folder\n    UserEmail    REG_SZ    checked@example.test\nHKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Personal\\cache\n    UserFolder    REG_SZ    C:\\ignored").accounts[0]?.UserEmail, "checked@example.test");
});
