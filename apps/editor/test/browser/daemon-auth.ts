import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const HTTP_DAEMON_STATE = process.env.LITZIO_BROWSER_DAEMON_DIR;

export async function authenticateDaemon(page: Page, origin: string): Promise<void> {
  if (!HTTP_DAEMON_STATE) throw new Error("HTTP browser tests require an isolated LITZIO_BROWSER_DAEMON_DIR.");
  const token = fs.readFileSync(path.join(HTTP_DAEMON_STATE, "development/token"), "utf8");
  await page.goto(`${origin}/daemon/login#${token}`);
  await page.waitForURL(new URL("/", origin).href);
}
