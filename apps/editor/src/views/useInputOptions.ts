import { useEffect, useRef, useState } from "react";
import type { HostClient } from "../host-client.ts";

export type InputOption = { value: string; label: string };
export type InputOptionBinding = { operation: string; version: number; depends: string[] };
type Args = Record<string, unknown>;

/**
 * Choice lists for Select controls bound to a plugin read (`inputOptions`).
 * Each list is refetched when the fields it depends on change. A current value that is no longer offered is
 * replaced by the first option (required field) or cleared (optional field), so a stale pick can never be submitted.
 * Returns the loaded lists and a `refresh` to re-read them, e.g. when a dropdown is opened.
 */
export function useInputOptions({ client, bindings, required, args, setArgs, enabled }: {
  client: HostClient; bindings?: Record<string, InputOptionBinding>; required: readonly string[]; args: Args; setArgs(update: (previous: Args) => Args): void; enabled: boolean;
}) {
  const [options, setOptions] = useState<Record<string, InputOption[]>>({});
  const [tick, setTick] = useState(0);
  const latest = useRef(args);
  latest.current = args;
  const key = JSON.stringify([tick, Object.entries(bindings ?? {}).map(([field, binding]) => [field, binding.operation, binding.depends.map(name => args[name] ?? null)])]);
  useEffect(() => {
    if (!bindings || !enabled) return;
    const controller = new AbortController();
    let alive = true;
    void Promise.all(Object.entries(bindings).map(async ([field, binding]) => {
      const input = Object.fromEntries(binding.depends.filter(name => latest.current[name] !== undefined).map(name => [name, latest.current[name]]));
      try {
        const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "options", operation: binding.operation, version: binding.version, input }), signal: controller.signal });
        if (!response.ok) return undefined;
        const result = await response.json();
        if (result.receipt?.outcome !== "success" || !Array.isArray(result.result) || result.result.length > 100 || !result.result.every((item: InputOption) => item && typeof item.value === "string" && typeof item.label === "string")) return undefined;
        return [field, result.result as InputOption[]] as const;
      } catch { return undefined; }
    })).then(entries => {
      if (!alive) return;
      const loaded = Object.fromEntries(entries.filter(entry => entry !== undefined));
      if (!Object.keys(loaded).length) return;
      setOptions(previous => ({ ...previous, ...loaded }));
      setArgs(previous => {
        let next = previous;
        for (const [field, items] of Object.entries(loaded)) {
          const current = previous[field];
          const valid = typeof current === "string" && items.some(item => item.value === current);
          if (valid || (current === undefined && !required.includes(field))) continue;
          if (next === previous) next = { ...previous };
          if (required.includes(field) && items.length) next[field] = items[0]!.value;
          else delete next[field];
        }
        return next;
      });
    });
    return () => { alive = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, key]);
  return { options, refresh: () => setTick(value => value + 1) };
}
