import { AsyncLocalStorage } from "node:async_hooks";
const pluginCode = new AsyncLocalStorage<boolean>();
export function withPluginCode<T>(run: () => T): T { return pluginCode.run(true, run); }
// Last boundary before plugin-owned data enters Host responses or process logs.
const values = new Set<string>();
export function rememberSecret(value: string) { if (value) values.add(value); }
export function redactSecrets(text: string) { for (const value of values) text = text.replaceAll(value, '[secret]'); return text; }
export function safePluginValue<T>(value: T): T {
  if (typeof value === 'string') return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map(safePluginValue) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [redactSecrets(k), safePluginValue(v)])) as T;
  return value;
}
for (const stream of [process.stdout, process.stderr]) {
  const write = stream.write.bind(stream);
  stream.write = ((chunk: unknown, ...args: unknown[]) => {
    if (pluginCode.getStore()) {
      const callback = args.find(arg => typeof arg === 'function') as (() => void) | undefined;
      if (callback) queueMicrotask(callback);
      return true;
    }
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    const redacted = redactSecrets(text);
    return (write as Function)(redacted === text ? chunk : Buffer.isBuffer(chunk) ? Buffer.from(redacted) : redacted, ...args);
  }) as typeof stream.write;
}
