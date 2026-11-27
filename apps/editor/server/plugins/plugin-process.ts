import { withoutGitHubTokens } from "./github-token.ts";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_ERROR_KINDS, SDK_VERSION, PluginPublicError, PluginOperationError, pluginErrorKind, type PluginCli, type PluginInstance, type PluginManifest } from "@litzio/plugin-sdk";

const sdkUrls: Partial<Record<"root" | "node", Promise<string>>> = {};
declare const __LITZIO_CLI_BUILD__: { desktop: boolean };
// Source Hosts own the checkout; shipped Hosts own their installation bundles.
const internalRoot = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../../"
  : typeof __LITZIO_CLI_BUILD__ !== "undefined" && __LITZIO_CLI_BUILD__.desktop ? "../" : "./", import.meta.url));
function hostSdkUrl(node = false): Promise<string> {
  return sdkUrls[node ? "node" : "root"] ??= (async () => {
    if (import.meta.url.endsWith(".ts")) {
      const tooling = new URL("../../../../packages/cli/scripts/plugin-sdk.ts", import.meta.url);
      // Node loads checkout tooling at runtime, including under Vite SSR.
      return (await import(/* @vite-ignore */ tooling.href)).developmentSdkUrl(node);
    }
    return new URL(node ? "./plugin-sdk-node.mjs" : "./plugin-sdk.mjs", import.meta.url).href;
  })();
}

// Inline bootstrap keeps source and the relocatable CLI on the same execution path.
// Only trusted artifact code runs here; a child process is not an OS sandbox.
const bootstrap = String.raw`
import { statSync, realpathSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerHooks } from 'node:module';
let instance, PublicError, validateStorageKey, prepareStorageValue;
let storageSequence = 0;
const storageCalls = new Map();
async function storageRequest(action, key, value) {
  validateStorageKey(key);
  if (action === "set") value = prepareStorageValue(value);
  const id = ++storageSequence;
  return new Promise((resolve, reject) => {
    storageCalls.set(id, {resolve, reject});
    process.send({storageRequest: true, id, action, key, value}, error => {
      if (!error) return;
      storageCalls.delete(id);
      reject(new PublicError("storage_unavailable", "Plugin storage connection is unavailable."));
    });
  });
}
const storage = Object.freeze({
  get: key => storageRequest("get", key),
  set: (key, value) => storageRequest("set", key, value),
  delete: key => storageRequest("delete", key),
});
process.on('disconnect', () => process.exit(0));
process.on('message', async ({id, method, args, storageReply, result: storageResult, error: storageError}) => {
  if (storageReply === true) {
    const call = storageCalls.get(id);
    if (!call) return;
    storageCalls.delete(id);
    if (storageError) call.reject(new PublicError(storageError.code, storageError.message));
    else call.resolve(storageResult);
    return;
  }
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
        if (specifier === '@litzio/plugin-sdk/node') return {url: args.nodeSdkUrl, format: 'module', shortCircuit: true};
        if (specifier === '@litzio/plugin-sdk') return {url: args.sdkUrl, format: 'module', shortCircuit: true};
        if (specifier.startsWith('@litzio/')) throw new Error('Use the public plugin SDK');
        const resolved = nextResolve(specifier, context);
        if (resolved.url.startsWith('file:')) {
          const target = canonical(fileURLToPath(resolved.url));
          if (inside(internalRoot, target) && !inside(artifactRoot, target) && target !== sdkFile) throw new Error('Use the public plugin SDK');
        }
        return resolved;
      }});
      const sdk = await import('@litzio/plugin-sdk');
      if (sdk.SDK_VERSION !== args.sdkVersion) throw new Error('Unsupported SDK version');
      PublicError = sdk.PluginPublicError;
      validateStorageKey = sdk.validatePluginStorageKey;
      prepareStorageValue = sdk.preparePluginStorageValue;
      const module = await import(pathToFileURL(args.entry).href);
      instance = await module.activate({...(args.cli ? {cli: Object.freeze({bin: args.cli.bin, args: Object.freeze(args.cli.args)})} : {}), secrets: Object.freeze(args.secrets), settings: args.settings, storage, platform: process.platform, env: {...process.env}, isDirectory(file) {try {return statSync(file).isDirectory()} catch {return false}}});
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
    let publicError;
    try { if (method === "invoke" && PublicError && error instanceof PublicError && typeof error.code === "string" && typeof error.message === "string") publicError = {code: error.code, message: error.message}; } catch {}
    process.send({id, ok: false, kind, publicError});
  }
});
`;

type PluginProcessExit = { code: number | null; signal: NodeJS.Signals | null };
export type PluginProcessActivationFailure = { kind: "processExit" } & PluginProcessExit;

type StorageRequest = (action: unknown, key: unknown, value: unknown) => Promise<unknown>;

export async function startPluginProcess(entry: string, manifest: PluginManifest, settings: Record<string, unknown>, secrets: Readonly<Record<string, string>>, storage: StorageRequest, failed: (exited: Promise<PluginProcessExit | undefined>) => void, artifactDirectory = path.dirname(entry), cli?: PluginCli, activation: { signal: AbortSignal; onFailure(failure: PluginProcessActivationFailure): void } | undefined = undefined): Promise<PluginInstance> {
  const runtimeUrl = await hostSdkUrl();
  activation?.signal.throwIfAborted();
  const child = spawn(process.execPath, ["--input-type=module", "--eval", bootstrap], {
    stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, env: { ...withoutGitHubTokens(process.env), ELECTRON_RUN_AS_NODE: "1" },
  });
  let sequence = 0, stopped = false, dead = false;
  let activationFailure: PluginProcessActivationFailure | undefined;
  let observedExit: PluginProcessExit | undefined;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }>();
  const exited = new Promise<PluginProcessExit | undefined>(resolve => child.once("close", () => resolve(observedExit)));
  const fail = (kind: "failed" | "timeout" = "failed") => {
    if (dead) return;
    dead = true;
    for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new PluginOperationError(kind)); }
    pending.clear();
    // An IPC failure can arrive before exit. Invalidate the instance immediately,
    // but let the Host read the final outcome after the child has closed.
    if (!stopped) failed(exited);
  };
  child.on("error", () => fail());
  child.on("exit", (code, signal) => {
    observedExit = { code, signal };
    // A Host-initiated kill during cleanup is not an early exit by the plugin.
    if (!child.killed) activationFailure ??= { kind: "processExit", code, signal };
    fail();
  });
  child.on("message", (message: any) => {
    if (message?.storageRequest === true) {
      if (dead || stopped || !Number.isSafeInteger(message.id)) return;
      const reply = (data: { result?: unknown; error?: { code: string; message: string } }) => {
        if (child.connected && !dead && !stopped) {
          child.send({ id: message.id, storageReply: true, ...data }, error => {
            if (error) { fail(); child.kill(); }
          });
        }
      };
      void Promise.resolve().then(() => storage(message.action, message.key, message.value)).then(
        result => reply({ result }),
        error => reply({ error: error instanceof PluginPublicError ? { code: error.code, message: error.message }
          : { code: "storage_io", message: "Plugin storage could not be accessed." } }),
      );
      return;
    }
    const call = pending.get(message?.id);
    if (!call) return;
    pending.delete(message.id); clearTimeout(call.timer);
    if (message.ok === true) call.resolve(message.result); else call.reject(message.publicError && typeof message.publicError.code === "string" && typeof message.publicError.message === "string" ? new PluginPublicError(message.publicError.code, message.publicError.message) : new PluginOperationError(pluginErrorKind(message.kind)));
  });
  const request = (method: string, args?: unknown) => new Promise<any>((resolve, reject) => {
    if (dead) { reject(new Error("Plugin process unavailable")); return; }
    const id = ++sequence;
    // This deadline bounds one RPC response, never an accepted background job.
    const timer = method === "activate" ? undefined : setTimeout(() => {
      fail("timeout");
      child.kill();
    }, 10_000);
    pending.set(id, { resolve, reject, timer });
    child.send({ id, method, args }, error => { if (error) { fail(); child.kill(); } });
  });
  const stop = async () => { stopped = true; child.kill(); await exited; };
  const abort = () => { stopped = true; fail(); child.kill(); };
  activation?.signal.addEventListener("abort", abort, { once: true });
  let operationNames: string[];
  try { operationNames = await request("activate", { entry, settings, secrets, cli, artifactDirectory, internalRoot, sdkUrl: runtimeUrl, nodeSdkUrl: await hostSdkUrl(true), sdkVersion: SDK_VERSION, operations: manifest.contributes.operations.map(op => op.id), codeScreen: manifest.contributes.screens?.some(screen => screen.entry) ?? false }); }
  catch (error) {
    await stop();
    activation?.signal.throwIfAborted();
    if (activationFailure) activation?.onFailure(activationFailure);
    throw error;
  } finally { activation?.signal.removeEventListener("abort", abort); }
  return {
    operations: Object.fromEntries(operationNames.map(id => [id, (input: unknown) => request("invoke", { operation: id, input })])),
    status: () => request("status"),
    async dispose() { try { if (!dead) await request("dispose"); } finally { await stop(); } },
  };
}
