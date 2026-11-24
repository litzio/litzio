import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { startFake } from "./fake-ollama.mjs";

const root = mkdtempSync(path.join(os.tmpdir(), "litzio-codex-audio-"));
const cwd = path.join(root, "assistant");
const docs = path.join(root, "docs");
const home = path.join(root, "home");
const temp = path.join(root, "tmp");
const codexHome = path.join(root, "codex");
const document = path.join(docs, "sample.md");
const newDocument = path.join(docs, "write-probe.md");
const sample = path.join(root, "sample.wav");
const logPath = path.join(root, "http.jsonl");
const model = "fake-audio:latest";
for (const directory of [cwd, docs, home, temp, codexHome]) mkdirSync(directory);
mkdirSync(path.join(cwd, ".git"));
writeFileSync(path.join(home, "AGENTS.md"), "SPIKE_HOME_INSTRUCTION_CANARY\n");
const homeSkill = path.join(home, ".agents", "skills", "spike-home-skill-canary");
mkdirSync(homeSkill, { recursive: true });
writeFileSync(path.join(homeSkill, "SKILL.md"), "---\nname: spike-home-skill-canary\ndescription: Synthetic home skill for this isolation check\n---\n");
writeFileSync(document, "# Synthetic document\n\nSPIKE_DOCUMENT_CONTENT\n");

// 80 ms of a synthetic 440 Hz tone, 16-bit mono PCM at 16 kHz.
const wav = Buffer.alloc(44 + 1280 * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 1280; i++) wav.writeInt16LE(Math.round(6000 * Math.sin(i * Math.PI * 880 / 16000)), 44 + i * 2);
writeFileSync(sample, wav);

process.env.LITZIO_DATA_DIR = path.join(root, "data");
process.env.LITZIO_ASSISTANT_CWD = cwd;
process.env.CODEX_HOME = codexHome;
const { CodexAppServer } = await import("../../apps/editor/server/codex-app-server.ts");
const { ProviderConnections } = await import("../../apps/editor/server/provider-connections.ts");
const { AssistantConversations } = await import("../../apps/editor/server/assistant-conversations.ts");
const { RootAccess } = await import("../../apps/editor/server/file-access.ts");
const { createPluginService } = await import("../../apps/editor/server/plugin-service.ts");

const fake = await startFake(logPath, document, newDocument, wav);
const env = (profile = codexHome) => ({
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
  PATHEXT: process.env.PATHEXT, OS: process.env.OS, ProgramData: process.env.ProgramData,
  SystemDrive: process.env.SystemDrive, USERPROFILE: home, HOME: home,
  APPDATA: path.join(home, "Roaming"), LOCALAPPDATA: path.join(home, "Local"),
  TMP: temp, TEMP: temp, CODEX_HOME: profile, CODEX_OSS_BASE_URL: fake.origin + "/v1",
  GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"), GIT_CONFIG_NOSYSTEM: "1",
  HTTP_PROXY: fake.origin, HTTPS_PROXY: fake.origin, ALL_PROXY: fake.origin, NO_PROXY: "127.0.0.1",
});
const commonArgs = ["app-server", "--disable", "apps", "--disable", "memories",
  "--disable", "plugins", "--disable", "remote_plugin", "--disable", "recommended_plugins",
  "--disable", "system_proxy_fallback",
  "-c", "features.default_mode_request_user_input=true", "-c", "check_for_update_on_startup=false",
  "-c", "web_search=disabled", "-c", "model_context_window=65536", "-c", "cli_auth_credentials_store=file",
  "-c", `openai_base_url="${fake.origin}/v1"`, "-c", `chatgpt_base_url="${fake.origin}/blocked"`];
const config = [
  `model = "${model}"`, 'model_provider = "spike"',
  "[model_providers.spike]", 'name = "Local fixture"', `base_url = "${fake.origin}/v1"`,
  'wire_api = "responses"', "requires_openai_auth = false", "",
].join("\n");
let excludedSkills: { name: string; path: string }[] = [];
let skillConfig = "";
writeFileSync(path.join(codexHome, "config.toml"), config);

const log = (name: string, value: unknown) => console.log(name, JSON.stringify(value));
const modelRequests = () => fake.entries.filter(entry => entry.method === "POST" && entry.path?.endsWith("/responses"));
const unexpected = () => fake.entries.filter(entry => entry.method === "CONNECT" || entry.path?.startsWith("http"));
async function settled<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 300; i++) {
    const result = read();
    if (result !== undefined) return result;
    await delay(100);
  }
  throw new Error("Timed out waiting for the turn.");
}
async function turn(client: InstanceType<typeof CodexAppServer>, input: object[], start = {}) {
  const thread = await client.request("thread/start", { cwd, model, approvalPolicy: "never", sandbox: "danger-full-access", ...start });
  let completed: any;
  const onNotification = (method: string, params: any) => {
    if (method === "turn/completed" && params.threadId === thread.thread.id) completed = params.turn;
  };
  client.on("notification", onNotification);
  try {
    await client.request("turn/start", { threadId: thread.thread.id, input, cwd, model });
    return { ...await settled(() => completed), modelProvider: thread.modelProvider ?? thread.thread.modelProvider };
  } finally { client.off("notification", onNotification); }
}
function summary(body: any) {
  const wire = JSON.stringify(body);
  const contents = (body.input ?? []).filter(item => item.role === "user").flatMap(item => item.content ?? []);
  return {
    types: contents.map(item => item.type),
    audioParts: contents.filter(item => item.type === "input_audio").map(item => Object.keys(item)),
    wavBase64: wire.includes(wav.toString("base64")),
    mime: wire.match(/data:[^;,"]+;base64/g),
    homeCanary: wire.includes("SPIKE_HOME_INSTRUCTION_CANARY") || wire.includes("spike-home-skill-canary"),
    homeSkills: excludedSkills.filter(skill => wire.includes(JSON.stringify(skill.path).slice(1, -1))
      || wire.includes(`- ${skill.name}:`)).length,
    skills: ["litzio-guide", "litzio-authoring"].filter(name => wire.includes(name)),
    reasoning: body.reasoning, include: body.include,
  };
}
const userText = (value: string) => ({ type: "text", text: value, text_elements: [] });

try {
  log("workspace", { root, runnerPid: process.pid, fake: fake.origin, logPath });
  await excludeHomeSkills();
  const smoke = new CodexAppServer(cwd, { args: commonArgs, env });
  try {
    log("version", await smoke.version());
    log("account", await smoke.request("account/read", { refreshToken: false }));
    log("smoke", (await turn(smoke, [userText("안녕?")])).status);
    log("first destination", fake.entries.map(({ method, host, path }) => ({ method, host, path })));
    const first = modelRequests()[0];
    assert.equal(first?.path, "/v1/responses");
    log("first body", summary(first.body));
  } finally { await smoke.close(); }
  assert.deepEqual(unexpected(), [], "Non-fake destination attempted");
  if (process.argv.includes("--smoke")) process.exitCode = 0;
  else {
    await probeHost();
    await probeAudio();
    const catalogIndex = process.argv.indexOf("--catalog");
    if (catalogIndex !== -1) {
      const catalog = JSON.parse(readFileSync(process.argv[catalogIndex + 1], "utf8"));
      const { models } = catalog;
      const selected = models.find(entry => entry.slug === "gpt-5.5");
      assert.ok(selected, "The pinned Codex catalog must contain gpt-5.5");
      const audioCatalog = path.join(root, "audio-models.json");
      writeFileSync(audioCatalog, JSON.stringify({ models: [{ ...selected, slug: model,
        input_modalities: ["text", "image", "audio"] }] }));
      await probeAudio(["-c", `model_catalog_json=${JSON.stringify(audioCatalog)}`]);
    }
    await probeSettings();
  }
} finally { await fake.close(); }
log("destinations", fake.entries.map(({ method, path }) => ({ method, path })));
assert.deepEqual(unexpected(), [], "Non-fake destination attempted");
assert.equal(fake.entries.filter(entry => entry.error).length, 0, "Fake server encountered an error");

async function excludeHomeSkills() {
  const discovery = new CodexAppServer(cwd, { args: commonArgs, env });
  const isHomeSkill = (skillPath: string) => {
    const relative = path.relative(path.join(os.homedir(), ".agents", "skills"), skillPath);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  try {
    // Windows Known Folder lookup may still resolve the real profile.
    // Discover paths via Codex and disable those entries in the disposable config.
    const listing = await discovery.request("skills/list", { cwds: [cwd], forceReload: true });
    excludedSkills = listing.data.flatMap(entry => entry.skills).filter(skill => isHomeSkill(skill.path));
    log("home skills disabled", excludedSkills.length);
    skillConfig = excludedSkills.map(skill => `\n[[skills.config]]\npath = ${JSON.stringify(skill.path)}\nenabled = false\n`).join("");
    writeFileSync(path.join(codexHome, "config.toml"), config + skillConfig);
  } finally { await discovery.close(); }
}

async function probeHost() {
  const access = new RootAccess([docs]);
  const plugins = createPluginService(access, path.join(root, "data", "plugins.json"), cwd);
  const connection = new ProviderConnections(cwd, { args: commonArgs, env });
  connection.pluginAuthoring = true;
  const conversations = new AssistantConversations(connection, access, plugins.host);
  // The app-server's signed-out local provider still returns the bundled Codex catalog.
  try {
    const catalog = await connection.client.request("model/list");
    log("catalog includes fixture model", catalog.data.some(entry => entry.model === model));
    connection.models = async () => ({ provider: "codex", updatedAt: Date.now(), models: [{
      id: model, model, displayName: model, description: "", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "" }],
    }] });
    const skills = await connection.skills();
    log("Litzio skills", skills.skills.map(skill => skill.name).filter(name => name.startsWith("litzio-")));
    for (const [message, permissionMode] of [
      ["안녕?", "full-access"], ["QCARD", "full-access"], ["READDOC", "read-only"],
      ["WRITEDOC", "read-only"], ["WRITEDOC", "full-access"], ["APPROVAL_PROBE", "read-only"],
    ] as const) {
      const before = modelRequests().length;
      const sent = await conversations.send({
        action: "send", provider: "codex", model, reasoningEffort: "medium", permissionMode,
        message, folders: [docs], document: { path: document },
      }, { provider: "codex", model, reasoningEffort: "medium", permissionMode });
      let approval = false;
      const final = await settled(() => {
        const last = conversations.current(sent.id).turns.at(-1);
        const pending = last?.items.find(item => item.question?.approval && item.question.status === "pending")?.question;
        if (pending) {
          approval = true;
          const reject = pending.questions[0].options?.find(option => /reject|deny/i.test(option.label));
          assert.ok(reject, "Expected a rejection option");
          conversations.answer(sent.id, pending.turnId, pending.requestId, { decision: { answers: [reject.label] } });
        }
        return last && last.status !== "inProgress" ? last : undefined;
      });
      const requests = modelRequests().slice(before);
      const bodySummary = summary(requests[0].body);
      assert.equal(bodySummary.homeSkills, 0);
      assert.equal(bodySummary.homeCanary, false);
      assert.equal(final.status, "completed");
      const result = requests.at(-1).body.input.filter(item => item.type === "function_call_output").map(item => item.output);
      if (message === "QCARD") {
        assert.equal(final.items.find(item => item.question)?.question?.status, "pending");
        assert.equal(JSON.parse(result[0]).accepted, true);
      }
      if (message === "READDOC") assert.match(JSON.parse(result[0]).source, /SPIKE_DOCUMENT_CONTENT/);
      if (message === "WRITEDOC") {
        const readOnly = permissionMode === "read-only";
        assert.equal(existsSync(newDocument), !readOnly);
        assert.equal(JSON.parse(result[0]).receipt.outcome, readOnly ? "failure" : "success");
      }
      if (message === "APPROVAL_PROBE") {
        assert.equal(approval, true);
        assert.match(result[0], /rejected by user/i);
      }
      assert.equal(existsSync(path.join(cwd, "approval-probe.txt")), false);
      log("host turn", {
        message, permissionMode, status: final.status, error: final.error,
        requestNumber: before + 1, paths: requests.map(request => request.path),
        summary: bodySummary, question: final.items.find(item => item.question)?.question?.status,
        result, documentCreated: existsSync(newDocument), approvalCard: approval,
      });
    }
  } finally {
    try { await conversations.close(); } finally {
      try { await connection.close(); } finally { await plugins.close(); }
    }
  }
}

async function probeAudio(overrides: string[] = []) {
  const client = new CodexAppServer(cwd, { args: [...commonArgs, ...overrides], env });
  try {
    log("audio catalog override", overrides.length > 0);
    log("wav", { bytes: wav.length, sha256: createHash("sha256").update(wav).digest("hex") });
    for (const [label, audio] of [
      ["localAudio", { type: "localAudio", path: sample }],
      ["audio HTTP", { type: "audio", url: fake.origin + "/sample.wav" }],
      ["audio data URL", { type: "audio", url: "data:audio/wav;base64," + wav.toString("base64") }],
    ] as const) {
      const before = modelRequests().length;
      try {
        const result = await turn(client, [userText("Describe the attached tone."), audio]);
        const requests = modelRequests().slice(before);
        const audioText = requests[0]?.body.input?.flatMap(item => item.content ?? [])
          .map(item => item.text).filter(value => value?.includes("audio content omitted"));
        log(label, { status: result.status, error: result.error,
          requests: requests.map(request => summary(request.body)),
          omissions: audioText?.map(value => value.match(/audio content omitted[^\n]*/)?.[0]) });
      } catch (error) {
        log(label, { error: String(error), modelRequests: modelRequests().length - before });
      }
    }
  } finally { await client.close(); }
}

async function probeSettings() {
  const builtin = path.join(root, "builtin-codex");
  const accountProfile = path.join(root, "account-codex");
  for (const profile of [builtin, accountProfile]) {
    mkdirSync(profile);
    writeFileSync(path.join(profile, "config.toml"), skillConfig);
  }
  const local = new CodexAppServer(cwd, { args: [...commonArgs, "-c", 'model_provider="ollama"'], env: () => env(builtin) });
  const account = new CodexAppServer(cwd, { args: commonArgs, env: () => env(accountProfile) });
  try {
    log("separate account process", await account.request("account/read", { refreshToken: false }));
    log("builtin account", await local.request("account/read", { refreshToken: false }));
    const before = modelRequests().length;
    const response = await turn(local, [userText("Built-in Ollama probe.")]);
    log("built-in ollama", { status: response.status, provider: response.modelProvider, path: modelRequests()[before]?.path });
    log("separate account process still responds", await account.request("account/read", { refreshToken: false }));
    const sharedHome = new CodexAppServer(cwd, { args: commonArgs, env: () => env(builtin) });
    try {
      log("shared home process", {
        account: (await sharedHome.request("account/read", { refreshToken: false })).requiresOpenaiAuth,
        ollama: (await local.request("account/read", { refreshToken: false })).requiresOpenaiAuth,
        threadCount: (await sharedHome.request("thread/list", { limit: 10, modelProviders: ["ollama"] })).data.length,
      });
    } finally { await sharedHome.close(); }
    const binary = local.executable!;
    for (const [label, args] of [
      ["app-server subcommand OSS options", ["app-server", "--oss", "--local-provider", "ollama", "--print-startup-config"]],
      ["chat wire", [...commonArgs, "-c", 'model_providers.spike.wire_api="chat"', "--print-startup-config"]],
      ["native wire", [...commonArgs, "-c", 'model_providers.spike.wire_api="ollama"', "--print-startup-config"]],
    ] as const) {
      try {
        execFileSync(binary, [...args], { cwd, env: env(), timeout: 5000, windowsHide: true, stdio: "pipe" });
        log(label, "config accepted");
      } catch (error: any) {
        log(label, { status: error.status, stderr: String(error.stderr ?? error.message).split(/\r?\n/).slice(0, 4) });
      }
    }
    const oss = new CodexAppServer(cwd, { args: ["--oss", "--local-provider", "ollama", ...commonArgs], env: () => env(builtin) });
    try {
      const before = modelRequests().length;
      const account = await oss.request("account/read", { refreshToken: false });
      const result = await turn(oss, [userText("Top-level OSS flag probe.")]);
      log("top-level OSS flags", { requiresOpenaiAuth: account.requiresOpenaiAuth, status: result.status, provider: result.modelProvider,
        path: modelRequests()[before]?.path });
    } finally { await oss.close(); }
    const nativeBase = new CodexAppServer(cwd, { args: [...commonArgs, "-c", `model_providers.spike.base_url="${fake.origin}/api"`], env });
    try {
      const index = modelRequests().length;
      log("changed base prefix", { status: (await turn(nativeBase, [userText("Prefix probe.")])).status, path: modelRequests()[index]?.path });
    } finally { await nativeBase.close(); }
  } finally { await Promise.all([local.close(), account.close()]); }
}
