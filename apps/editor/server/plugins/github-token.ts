import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export function withoutGitHubTokens(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/^(GH_TOKEN|GITHUB_TOKEN)$/i.test(name)));
}

export async function cliGitHubToken() {
  try {
    const { stdout } = await run("gh", ["auth", "token", "--hostname", "github.com"], {
      timeout: 2_000, maxBuffer: 8_192, windowsHide: true, shell: false,
      env: withoutGitHubTokens(process.env),
    });
    return stdout;
  } catch {
    return undefined;
  }
}
