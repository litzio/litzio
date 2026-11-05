import { defineConfig } from "@playwright/test";
import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";
const HTTP_DAEMON_STATE = process.env.LITZIO_BROWSER_DAEMON_DIR;

const httpHost = process.env.LITZIO_BROWSER_HOST === "http";
const url = process.env.LITZIO_BROWSER_URL ?? (httpHost ? "http://127.0.0.1:5181" : "http://127.0.0.1:5173");

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: httpHost ? ["scenarios.spec.ts", "http-recovery.spec.ts"] : "scenarios.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  use: { actionTimeout: 15_000, navigationTimeout: 15_000 },
  reporter: "list",
  outputDir: path.join(REPOSITORY_ROOT, "tmp/browser-results"),
  // An explicitly supplied URL belongs to its caller. The default local server can be owned by Playwright.
  webServer: process.env.LITZIO_BROWSER_URL ? undefined : {
    command: httpHost ? "node packages/cli/dist/cli.mjs daemon run --channel development --port 5181 --root tmp/http-host-a --root tmp/http-host-b"
      : process.platform !== "win32" && process.env.LITZIO_BROWSER_SERVER_LOG ? 'pnpm editor > "$LITZIO_BROWSER_SERVER_LOG" 2>&1' : "pnpm editor",
    cwd: REPOSITORY_ROOT,
    env: { ...(HTTP_DAEMON_STATE ? { LITZIO_DAEMON_DIR: HTTP_DAEMON_STATE } : {}), LITZIO_PLUGINS_SETTINGS_FILE: path.join(HTTP_DAEMON_STATE ?? path.join(REPOSITORY_ROOT, "tmp"), "browser-plugins.json"), LITZIO_ASSISTANT_CWD: path.join(REPOSITORY_ROOT, "tmp", "browser-assistant"), LITZIO_ASSISTANT_SETTINGS_FILE: path.join(REPOSITORY_ROOT, "tmp", "browser-assistant-settings.json") },
    url: `${url}/api/document`,
    reuseExistingServer: !httpHost && !process.env.CI,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
