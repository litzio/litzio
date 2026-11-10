import { defineConfig } from "@playwright/test";
import path from "node:path";
import { REPOSITORY_ROOT } from "./fixtures.ts";
const HTTP_DAEMON_STATE = process.env.LITZIO_BROWSER_DAEMON_DIR;

const httpHost = process.env.LITZIO_BROWSER_HOST === "http";

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
  // An explicitly supplied URL belongs to its caller. Every default server is owned by Playwright, on both local and CI runs.
  webServer: process.env.LITZIO_BROWSER_URL ? undefined : {
    command: "pnpm exec tsx apps/editor/test/browser/server.ts",
    wait: { stdout: /Browser server: (?<litzio_browser_server_url>http:\/\/127\.0\.0\.1:\d+)/ },
    cwd: REPOSITORY_ROOT,
    env: { ...(HTTP_DAEMON_STATE ? { LITZIO_DAEMON_DIR: HTTP_DAEMON_STATE, LITZIO_DATA_DIR: HTTP_DAEMON_STATE } : {}), LITZIO_PLUGINS_SETTINGS_FILE: path.join(HTTP_DAEMON_STATE ?? path.join(REPOSITORY_ROOT, "tmp"), "browser-plugins.json"), LITZIO_ASSISTANT_CWD: path.join(REPOSITORY_ROOT, "tmp", "browser-assistant"), LITZIO_ASSISTANT_SETTINGS_FILE: path.join(REPOSITORY_ROOT, "tmp", "browser-assistant-settings.json") },
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
