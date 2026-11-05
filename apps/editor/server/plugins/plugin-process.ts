import { spawn } from "node:child_process";
import { PLUGIN_ERROR_KINDS, SDK_VERSION, PluginOperationError, pluginErrorKind, type PluginInstance, type PluginManifest } from "@litzio/plugin-sdk";

let sdkUrl: Promise<string> | undefined;
function hostSdkUrl(): Promise<string> {
  return sdkUrl ??= (async () => {
    if (import.meta.url.endsWith(".ts")) {
      const tooling = new URL("../../../../packages/cli/scripts/plugin-sdk.ts", import.meta.url);
      return (await import(tooling.href)).developmentSdkUrl();
    }
    return new URL("./plugin-sdk.mjs", import.meta.url).href;
  })();
}

// Inline bootstrap keeps source and the relocatable CLI on the same execution path.
// Only trusted artifact code runs here; a child process is not an OS sandbox.
const bootstrap = String.raw`
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
let instance;
process.on('disconnect', () => process.exit(0));
process.on('message', async ({id, method, args}) => {
  try {
    let result;
    if (method === 'activate') {
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === '@litzio/plugin-sdk') return {url: args.sdkUrl, format: 'module', shortCircuit: true};
        if (specifier.startsWith('@litzio/')) throw new Error('Use the public plugin SDK');
        return nextResolve(specifier, context);
      }});
      if ((await import('@litzio/plugin-sdk')).SDK_VERSION !== args.sdkVersion) throw new Error('Unsupported SDK version');
      const module = await import(pathToFileURL(args.entry).href);
      instance = await module.activate({secrets: Object.freeze(args.secrets), settings: args.settings, platform: process.platform, env: {...process.env}, isDirectory(file) {try {return statSync(file).isDirectory()} catch {return false}}});
      if (!instance || typeof instance.status !== 'function' || typeof instance.dispose !== 'function' || !instance.operations || args.operations.some(key => typeof instance.operations[key] !== 'function' || !Object.hasOwn(instance.operations, key)) || Object.keys(instance.operations).some(key => !args.operations.includes(key))) throw new Error('Invalid handlers');
    } else if (method === 'status') result = await instance.status();
    else if (method === 'invoke') result = await instance.operations[args.operation](args.input);
    else if (method === 'dispose') await instance?.dispose?.();
    else throw new Error('Unknown method');
    process.send({id, ok: true, result});
  } catch (error) {
    // Artifact errors can contain credentials. Do not forward arbitrary error text.
    let kind = "failed";
    try { const requested = error?.kind; if (${JSON.stringify(PLUGIN_ERROR_KINDS)}.includes(requested)) kind = requested; } catch {}
    process.send({id, ok: false, kind});
  }
});
`;

export async function startPluginProcess(entry: string, manifest: PluginManifest, settings: Record<string, unknown>, secrets: Readonly<Record<string, string>>, failed: () => void): Promise<PluginInstance> {
  const runtimeUrl = await hostSdkUrl();
  const child = spawn(process.execPath, ["--input-type=module", "--eval", bootstrap], {
    stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  let sequence = 0, stopped = false, dead = false;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const exited = new Promise<void>(resolve => child.once("close", () => resolve()));
  const fail = (kind: "failed" | "timeout" = "failed") => {
    if (dead) return;
    dead = true;
    for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new PluginOperationError(kind)); }
    pending.clear();
    if (!stopped) failed();
  };
  child.on("error", () => fail()); child.on("exit", () => fail());
  child.on("message", (message: any) => {
    const call = pending.get(message?.id);
    if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    if (message.ok === true) call.resolve(message.result); else call.reject(new PluginOperationError(pluginErrorKind(message.kind)));
  });
  const request = (method: string, args?: unknown) => new Promise<any>((resolve, reject) => {
    if (dead) { reject(new Error("Plugin process unavailable")); return; }
    const id = ++sequence;
    // This deadline bounds one RPC response, never an accepted background job.
    const timer = setTimeout(() => { fail("timeout"); child.kill(); }, 10_000);
    pending.set(id, { resolve, reject, timer });
    child.send({ id, method, args }, error => { if (error) { fail(); child.kill(); } });
  });
  const stop = async () => { stopped = true; child.kill(); await exited; };
  try { await request("activate", { entry, settings, secrets, sdkUrl: runtimeUrl, sdkVersion: SDK_VERSION, operations: manifest.contributes.operations.map(op => op.id) }); }
  catch (error) { await stop(); throw error; }
  return {
    operations: Object.fromEntries(manifest.contributes.operations.map(op => [op.id, (input: unknown) => request("invoke", { operation: op.id, input })])),
    status: () => request("status"),
    async dispose() { try { if (!dead) await request("dispose"); } finally { await stop(); } },
  };
}
