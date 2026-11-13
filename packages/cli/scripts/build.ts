import { DESIGNATED_COMMUNITY_PLUGINS, assertDesignatedPluginPayload } from "../../../apps/editor/server/plugins/designated-plugins.ts";
// Build a relocatable Node CLI plus the production Editor. No source checkout or node_modules at runtime.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { collectPackages, packageNotices } from "../../../scripts/third-party-notices.ts";
import { brand } from "../../../brand.ts";
import { buildSdkRuntime } from "./plugin-sdk.ts";

const cli = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(cli, "../..");
const destination = path.join(cli, "dist");
const manifest = JSON.parse(readFileSync(path.join(cli, "package.json"), "utf8"));
const desktopVersion = process.env.LITZIO_CLI_DESKTOP_VERSION;
let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
catch { /* An exported source tree can be built without Git. */ }
// Fixed output directory, never a caller-supplied path.
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
execSync("pnpm --filter @litzio/onedrive build", { cwd: repo, stdio: "inherit" });
cpSync(path.join(repo, "plugins/onedrive/artifact"), path.join(destination, "official-plugins/onedrive/artifact"), { recursive: true });
cpSync(path.join(repo, "plugins/onedrive/digest.json"), path.join(destination, "official-plugins/onedrive/digest.json"));
for (const item of DESIGNATED_COMMUNITY_PLUGINS) {
  const target = path.join(destination, "community-plugins", item.folder);
  mkdirSync(target, { recursive: true });
  for (const file of item.files) {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    cpSync(path.join(repo, "community-plugins", item.folder, file), path.join(target, file));
  }
}
assertDesignatedPluginPayload(destination);
execSync("pnpm --filter @litzio/editor build", { cwd: repo, stdio: "inherit" });
cpSync(path.join(repo, "apps/editor/dist"), path.join(destination, "editor"), { recursive: true });
const result = await build({
  absWorkingDir: repo,
  entryPoints: { cli: path.join(cli, "src/cli.ts") }, outdir: destination, outExtension: { ".js": ".mjs" },
  bundle: true, splitting: true, platform: "node", format: "esm", target: "node24", metafile: true,
  define: {
    __LITZIO_CLI_BUILD__: JSON.stringify({ version: desktopVersion ?? manifest.version, desktop: desktopVersion !== undefined, commit }),
    __LITZIO_ASSISTANT_INSTRUCTIONS__: JSON.stringify(readFileSync(path.join(repo, "apps/editor/server/assistant/AGENTS.md"), "utf8")),
    __LITZIO_ASSISTANT_GUIDE__: JSON.stringify(readFileSync(path.join(repo, "apps/editor/server/assistant/litzio-guide/SKILL.md"), "utf8")),
  },
  banner: { js: 'import { createRequire as __litzioCreateRequire } from "node:module"; const require = __litzioCreateRequire(import.meta.url);' },
  legalComments: "linked", logLevel: "warning",
});
// esbuild's JS wrapper is bundled; its native service must travel with the Host.
const esbuildRequire = createRequire(createRequire(import.meta.url).resolve("esbuild"));
const binaryName = process.platform === "win32" ? "esbuild.exe" : "esbuild";
const binaryPackage = `@esbuild/${process.platform}-${process.arch}/${process.platform === "win32" ? binaryName : "bin/esbuild"}`;
cpSync(esbuildRequire.resolve(binaryPackage), path.join(destination, binaryName));
// npm includes its pure-JS dependency tree; preserve its licenses and user's npmrc handling.
const editorRequire = createRequire(path.join(repo, "apps/editor/package.json"));
cpSync(path.dirname(editorRequire.resolve("npm/package.json")), path.join(destination, "npm"), { recursive: true, dereference: true });
// Separate, self-contained SDK: no shared chunks and no parent-URL trust exception.
const sdkResult = await buildSdkRuntime(path.join(destination, "plugin-sdk.mjs"));
const executable = path.join(destination, "cli.mjs");
writeFileSync(executable, `#!/usr/bin/env node\n${readFileSync(executable, "utf8")}`, { mode: 0o755 });
writeFileSync(path.join(destination, "package.json"), JSON.stringify({ name: "@litzio/cli", version: manifest.version,
  description: `${brand.name.en} document CLI and HTTP Editor Host`, license: "MIT", type: "module", private: true,
  bin: { [brand.cliCommand]: "cli.mjs" }, files: ["npm/", "esbuild", "esbuild.exe", "*.mjs", "*.txt", "*.md", "editor/", "official-plugins/", "community-plugins/", "LICENSE"], engines: { node: ">=24.22.1 <25" } }, null, 2) + "\n");
cpSync(path.join(repo, "LICENSE"), path.join(destination, "LICENSE"));
// Editor notices are generated inside its static boundary by Vite.
const packages = collectPackages([...Object.keys(result.metafile.inputs), ...Object.keys(sdkResult.metafile.inputs)].map(input => path.resolve(repo, input)));
const notices = packageNotices(packages) + "\n\n" + packageNotices([path.dirname(editorRequire.resolve("npm/package.json"))]) + "\n\n" + readFileSync(path.join(destination, "editor/licenses/THIRD_PARTY_LICENSES.txt"), "utf8");
writeFileSync(path.join(destination, "THIRD_PARTY_LICENSES.txt"), notices);
writeFileSync(path.join(destination, "README.md"), `# ${brand.name.en} CLI and HTTP Editor\n\nRequires Node.js >=24.22.1 <25.\n\n\`${brand.cliCommand} --version\` alone prints the build version and commit (or unknown without Git).\n\nRun \`${brand.cliCommand} daemon run --root <folder> [--root <folder>]\` after local package installation, or \`node cli.mjs daemon run --root <folder>\`.\n\nLocal mode: daemon start, daemon status, daemon stop --confirm. Stable local port derived from OS user identity and channel (20000–44575); daemon status reports the URL. There is no authentication in this phase (decision #1145). --root is optional, including non-loopback --host with --public-origin. Non-loopback startup warns that anyone who can reach the port can access it; without --root, disk and assistant (AI) execution are exposed. Supplied roots restrict server folders. Use an access-controlled reverse proxy and \`--public-origin\` for remote access. See https://github.com/litzio/litzio/blob/master/docs/design/http-host-v1.md for the security and deployment contract.\n`);
console.log(`CLI and Editor built in ${path.relative(repo, destination)}`);
