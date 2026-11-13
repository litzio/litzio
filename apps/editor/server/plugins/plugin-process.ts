import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_ERROR_KINDS, SDK_VERSION, PluginOperationError, pluginErrorKind, type PluginCli, type PluginInstance, type PluginManifest } from "@litzio/plugin-sdk";

let sdkUrl: Promise<string> | undefined;
declare const __LITZIO_CLI_BUILD__: { desktop: boolean };
// Source Hosts own the checkout; shipped Hosts own their installation bundles.
const internalRoot = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../../"
  : typeof __LITZIO_CLI_BUILD__ !== "undefined" && __LITZIO_CLI_BUILD__.desktop ? "../" : "./", import.meta.url));
function hostSdkUrl(): Promise<string> {
  return sdkUrl ??= (async () => {
    if (import.meta.url.endsWith(".ts")) {
      const tooling = new URL("../../../../packages/cli/scripts/plugin-sdk.ts", import.meta.url);
      // Node loads checkout tooling at runtime, including under Vite SSR.
      return (await import(/* @vite-ignore */ tooling.href)).developmentSdkUrl();
    }
    return new URL("./plugin-sdk.mjs", import.meta.url).href;
  })();
}

// Inline bootstrap keeps source and the relocatable CLI on the same execution path.
// Only trusted artifact code runs here; a child process is not an OS sandbox.
const bootstrap = String.raw`
import { statSync, realpathSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
let instance;
process.on('disconnect', () => process.exit(0));
process.on('message', async ({id, method, args}) => {
  try {
    let result;
    if (method === 'activate') {
      const canonical = file => {
        const real = realpathSync.native(path.resolve(file));
        return process.platform === 'win32' ? real.toLowerCase() : real;
      };
      const internalRoot = canonical(args.internalRoot), artifactRoot = canonical(args.artifactDirectory);
      const inside = (root, file) => {
        const relative = path.relative(root, file);
        return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
      };
      const sdkFile = args.sdkUrl.startsWith('file:') ? canonical(fileURLToPath(args.sdkUrl)) : null;
      // The SDK is one self-contained bundle. parentURL is caller-controlled
      // (createRequire), so it must never grant access to private Host files.
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === '@litzio/plugin-sdk') return {url: args.sdkUrl, format: 'module', shortCircuit: true};
        if (specifier.startsWith('@litzio/')) throw new Error('Use the public plugin SDK');
        const resolved = nextResolve(specifier, context);
        if (resolved.url.startsWith('file:')) {
          const target = canonical(fileURLToPath(resolved.url));
          if (inside(internalRoot, target) && !inside(artifactRoot, target) && target !== sdkFile) throw new Error('Use the public plugin SDK');
        }
        return resolved;
      }});
      if ((await import('@litzio/plugin-sdk')).SDK_VERSION !== args.sdkVersion) throw new Error('Unsupported SDK version');
      const module = await import(pathToFileURL(args.entry).href);
      instance = await module.activate({...(args.cli ? {cli: Object.freeze({bin: args.cli.bin, args: Object.freeze(args.cli.args)})} : {}), secrets: Object.freeze(args.secrets), settings: args.settings, platform: process.platform, env: {...process.env}, isDirectory(file) {try {return statSync(file).isDirectory()} catch {return false}}});
      if (!instance || typeof instance.status !== 'function' || typeof instance.dispose !== 'function' || !instance.operations || args.operations.some(key => typeof instance.operations[key] !== 'function' || !Object.hasOwn(instance.operations, key)) || Object.keys(instance.operations).some(key => typeof instance.operations[key] !== 'function' || !args.codeScreen && !args.operations.includes(key))) throw new Error('Invalid handlers');
      result = Object.keys(instance.operations);
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

export async function startPluginProcess(entry: string, manifest: PluginManifest, settings: Record<string, unknown>, secrets: Readonly<Record<string, string>>, failed: () => void, artifactDirectory = path.dirname(entry), cli?: PluginCli): Promise<PluginInstance> {
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
  let operationNames: string[];
  try { operationNames = await request("activate", { entry, settings, secrets, cli, artifactDirectory, internalRoot, sdkUrl: runtimeUrl, sdkVersion: SDK_VERSION, operations: manifest.contributes.operations.map(op => op.id), codeScreen: manifest.contributes.screens?.some(screen => screen.entry) ?? false }); }
  catch (error) { await stop(); throw error; }
  return {
    operations: Object.fromEntries(operationNames.map(id => [id, (input: unknown) => request("invoke", { operation: id, input })])),
    status: () => request("status"),
    async dispose() { try { if (!dead) await request("dispose"); } finally { await stop(); } },
  };
}
