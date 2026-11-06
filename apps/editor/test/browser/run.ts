import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";
import { HTTP_SCENARIOS, selectBrowserScenarios, STABLE_SCENARIOS } from "./scenarios.ts";

try {
  if (process.argv[2] === 'interview-spike') {
    const require = createRequire(import.meta.url);
    process.argv = [process.execPath, require.resolve('@playwright/test/cli'), 'test', '--config', path.join(REPOSITORY_ROOT, 'apps/editor/test/interview-spike.config.ts')];
    await import(pathToFileURL(require.resolve('@playwright/test/cli')).href);
  } else {
  const { scenarios, screenshots, shard } = selectBrowserScenarios(process.argv.slice(2));
  if (scenarios.some(name => HTTP_SCENARIOS.includes(name))) {
    if (!process.env.LITZIO_BROWSER_URL && !existsSync(path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"))) {
      throw new Error("Build the production HTTP Host first: pnpm --filter @litzio/cli build");
    }
    process.env.LITZIO_BROWSER_HOST = "http";
    if (!process.env.LITZIO_BROWSER_URL) {
      const directory = mkdtempSync(path.join(os.tmpdir(), "litzio-http-browser-"));
      process.env.LITZIO_BROWSER_DAEMON_DIR = directory;
      process.once("exit", () => rmSync(directory, { recursive: true, force: true }));
    }
    prepareBrowserFixtures();
  }
  if (scenarios.includes("vite-plugins")) execFileSync(process.execPath, ["build.mjs"], { cwd: path.join(REPOSITORY_ROOT, "plugins/onedrive"), stdio: "inherit", windowsHide: true });
  const unknown = scenarios.filter(name => !existsSync(path.join(REPOSITORY_ROOT, "apps/editor/test", `${name}.browser.js`)));
  if (unknown.length) throw new Error(`Unknown scenario: ${unknown.join(", ")}\nStable: ${STABLE_SCENARIOS.join(", ")}`);
  if (shard) console.log(`Browser shard ${shard}: ${scenarios.length} scenarios\n${scenarios.join(", ")}`);
  const require = createRequire(import.meta.url);
  const cli = require.resolve("@playwright/test/cli");
  process.env.LITZIO_BROWSER_SCENARIOS = JSON.stringify(scenarios);
  process.env.LITZIO_BROWSER_SCREENSHOTS = String(screenshots);
  process.argv = [process.execPath, cli, "test", "--config", path.join(REPOSITORY_ROOT, "apps/editor/test/browser/playwright.config.ts")];
  process.once("exit", code => {
    const log = process.env.LITZIO_BROWSER_SERVER_LOG;
    if (code && log && existsSync(log)) console.error(readFileSync(log, "utf8"));
  });
  // The exported CLI bin owns asynchronous completion, process signals and teardown.
  await import(pathToFileURL(cli).href);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
