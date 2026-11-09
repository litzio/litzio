import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "../components/ui/input.tsx";
import { SuggestedInput } from "./SuggestedInput.tsx";
import type { HostClient } from "../host-client.ts";

type Binding = { operation: string; version: number };
/** Host-owned guidance is never an input value or part of saved query arguments. */
export function HintedInput({ client, hint, suggestion, value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  client: HostClient; hint?: Binding; suggestion?: Binding; value: string; onValueChange(value: string): void;
}) {
  const [response, setResponse] = useState<{ client: HostClient; operation: string; version: number; text: string }>();
  const operation = hint?.operation, version = hint?.version;
  useEffect(() => {
    if (!operation || version === undefined) return;
    const controller = new AbortController();
    let alive = true;
    void client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "input-hint", operation, version }), signal: controller.signal })
      .then(async result => { if (!result.ok) throw new Error(); return result.json(); })
      .then(result => {
        if (alive && result.receipt?.outcome === "success" && typeof result.result?.text === "string" && result.result.text.length <= 512) setResponse({ client, operation, version, text: result.result.text });
      }).catch(() => { if (alive) setResponse(undefined); });
    return () => { alive = false; controller.abort(); };
  }, [client, operation, version]);
  const text = response?.client === client && response.operation === operation && response.version === version ? response.text : undefined;
  const shared = { ...props, placeholder: text, "aria-description": !value ? text : undefined };
  return suggestion ? <SuggestedInput {...shared} client={client} {...suggestion} value={value} onValueChange={onValueChange} />
    : <Input {...shared} value={value} onChange={event => onValueChange(event.target.value)} />;
}
