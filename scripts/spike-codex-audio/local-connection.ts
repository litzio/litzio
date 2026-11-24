import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexAppServer } from "../../apps/editor/server/codex-app-server.ts";
import { ProviderConnections } from "../../apps/editor/server/provider-connections.ts";

export const model = "gemma4:e4b";

export async function localConnection(root: string, cwd: string, proxyOrigin: string) {
  const home = path.join(root, "home"), temp = path.join(root, "tmp"), profile = path.join(root, "codex");
  for (const folder of [home, temp, profile]) mkdirSync(folder);
  const configFile = path.join(profile, "config.toml");
  const config = `model = "${model}"\nmodel_provider = "spike"\n[model_providers.spike]\nname = "Local Ollama"\nbase_url = "${proxyOrigin}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n`;
  writeFileSync(configFile, config);
  const env = () => ({
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT, OS: process.env.OS, ProgramData: process.env.ProgramData,
    SystemDrive: process.env.SystemDrive, USERPROFILE: home, HOME: home,
    APPDATA: path.join(home, "Roaming"), LOCALAPPDATA: path.join(home, "Local"),
    TMP: temp, TEMP: temp, CODEX_HOME: profile,
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"), GIT_CONFIG_NOSYSTEM: "1",
    HTTP_PROXY: proxyOrigin, HTTPS_PROXY: proxyOrigin, ALL_PROXY: proxyOrigin, NO_PROXY: "127.0.0.1",
  });
  const args = ["app-server", "--disable", "apps", "--disable", "memories", "--disable", "plugins",
    "--disable", "remote_plugin", "--disable", "recommended_plugins", "--disable", "system_proxy_fallback",
    "-c", "features.default_mode_request_user_input=true", "-c", "check_for_update_on_startup=false",
    "-c", "web_search=disabled", "-c", "model_context_window=65536", "-c", "cli_auth_credentials_store=file",
    "-c", `openai_base_url="${proxyOrigin}/blocked"`, "-c", `chatgpt_base_url="${proxyOrigin}/blocked"`];
  process.env.CODEX_HOME = profile;
  const discovery = new CodexAppServer(cwd, { args, env });
  let excluded: { path: string; name: string; description: string }[] = [];
  try {
    const listing = await discovery.request("skills/list", { cwds: [cwd], forceReload: true });
    excluded = listing.data.flatMap(entry => entry.skills).filter(skill => {
      const relative = path.relative(os.homedir(), skill.path);
      return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    });
  } finally { await discovery.close(); }
  writeFileSync(configFile, config + excluded.map(skill =>
    `\n[[skills.config]]\npath = ${JSON.stringify(skill.path)}\nenabled = false\n`).join(""));
  return {
    create(origin: () => string | undefined) {
      const connection = new ProviderConnections(cwd, { args, env }, undefined, {}, origin);
      // The product's Codex entry point checks for a signed-in account and only lists Codex models.
      // Override those two checks in the spike once the local, signed-out config is confirmed.
      connection.diagnostics = async () => {
        const account = await connection.client.request("account/read", { refreshToken: false });
        assert.equal(account.requiresOpenaiAuth, false);
        assert.equal(account.account, null);
        return { provider: "codex", checkedAt: Date.now(), path: connection.client.executable,
          version: await connection.client.version(), connected: true, account: { type: "apiKey" } };
      };
      connection.models = async () => ({ provider: "codex", updatedAt: Date.now(), models: [{
        id: model, model, displayName: model, description: "", defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "" }],
      }] });
      return connection;
    },
    checkBody(body: unknown) {
      const serialized = JSON.stringify(body);
      const includes = (value: string) => serialized.includes(JSON.stringify(value).slice(1, -1));
      assert.equal(excluded.filter(skill => includes(skill.path) || includes(`- ${skill.name}:`) ||
        (skill.description?.length >= 25 && includes(skill.description.slice(0, 60)))).length, 0, "Personal skills in model payload");
      assert.ok(includes("# 리치오 비서") && includes("litzio-guide") && includes("litzio-authoring"));
      return { personalSkillsExcluded: excluded.length, litzioSkills: 2 };
    },
  };
}
