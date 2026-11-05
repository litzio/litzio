// Verify the actual release downloader without network, packaging, or installation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { transformSync } from "esbuild";
import { brand } from "../../../brand.ts";
import { readUpdateInfo } from "../scripts/verify-release.ts";

test("published update starting installer verifies GitHub digest, size and update SHA-512", async () => {
  const file = new URL("./packaged/update.e2e.ts", import.meta.url);
  const require = createRequire(file);
  const version = "0.0.2-beta.6", installer = `${brand.executableName}-Setup-${version}.exe`;
  const executable = Buffer.from("published installer fixture");
  const sha512 = createHash("sha512").update(executable).digest("base64");
  for (const fault of ["none", "digest", "size", "sha512"] as const) {
    const metadata = Buffer.from(`version: ${version}\npath: ${installer}\nsha512: ${sha512}\nfiles:\n  - url: ${installer}\n    sha512: ${fault === "sha512" ? "wrong" : sha512}\n    size: ${executable.length}\n`);
    const base = `https://github.com/${brand.updates.repository.owner}/${brand.updates.repository.repo}/releases/download/v${version}/`;
    const assets = [installer, `${installer}.blockmap`, `${brand.updates.channels.beta}.yml`].map(name => {
      const bytes = name === installer ? executable : metadata;
      return { name, size: bytes.length + (name === installer && fault === "size" ? 1 : 0),
        digest: `sha256:${name === installer && fault === "digest" ? "wrong" : createHash("sha256").update(bytes).digest("hex")}`, browser_download_url: base + name };
    });
    const written: Buffer[] = [];
    const module = { exports: {} as { publicBeta(versions: string[], start: string): Promise<string> } };
    const source = transformSync(readFileSync(file, "utf8") + "\nexport { publicBeta };", { loader: "ts", format: "cjs", define: { "import.meta.url": JSON.stringify(file.href) } }).code;
    const fetchFixture = async (url: string) => {
        if (url.startsWith("https://api.github.com/")) return { status: 200, json: async () => ({ tag_name: `v${version}`, draft: false, prerelease: true, assets }) };
        return { status: 200, arrayBuffer: async () => url.endsWith(installer) ? executable : metadata };
    };
    runInNewContext(source, { module, exports: module.exports, Buffer, console,
      process: { argv: [], env: { APPDATA: "fixture", LOCALAPPDATA: "fixture" } },
      require(name: string) {
        // JSON from the fake network crosses VM realms; compare its data, not Array prototypes.
        if (name === "node:assert/strict") return { ...assert, deepEqual: (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))) };
        if (name === "node:fs") return { mkdirSync() {}, writeFileSync(_file: string, bytes: Buffer) { written.push(bytes); } };
        if (name === "node:test") return { test() {} };
        if (name === "@playwright/test") return {};
        if (name === "../../scripts/verify-release.ts") return { readUpdateInfo };
        if (name === "./public-download.ts") return { fetchPublicRelease: fetchFixture };
        return require(name);
      },
    });
    if (fault === "none") {
      await module.exports.publicBeta([version], version);
      assert.deepEqual(written, [executable]);
    } else {
      await assert.rejects(module.exports.publicBeta([version], version));
      assert.deepEqual(written, [], "unverified installer is never installed or saved");
    }
  }
});
