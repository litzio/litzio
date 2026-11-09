import { useEffect, useState, type ComponentProps } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Input } from "../components/ui/input.tsx";
import type { HostClient } from "../host-client.ts";

type Suggestion = { value: string; label: string };
/** Candidate state belongs to this field and Host, never the query definition. */
export function SuggestedInput({ client, operation, version, value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  client: HostClient; operation: string; version: number; value: string; onValueChange(value: string): void;
}) {
  const [composing, setComposing] = useState(false);
  const [focused, setFocused] = useState(false), [open, setOpen] = useState(false);
  const [response, setResponse] = useState<{ query: string; client: HostClient; operation: string; version: number; items: Suggestion[] }>();
  useEffect(() => {
    setResponse(undefined);
    if (composing || value.trim().length < 2) return;
    const controller = new AbortController();
    let alive = true;
    const timer = setTimeout(() => {
      void client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", operation, version, input: { query: value } }), signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(result => {
          if (!alive || result.receipt?.outcome !== "success" || !Array.isArray(result.result) || result.result.length > 32 || !result.result.every((item: Suggestion) => item && typeof item.value === "string" && typeof item.label === "string")) return;
          setResponse({ query: value, client, operation, version, items: result.result });
        }).catch(() => { if (alive) setResponse(undefined); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [client, operation, version, value, composing]);
  const items = !composing && response?.query === value && response.client === client && response.operation === operation && response.version === version ? response.items : [];
  return <Autocomplete.Root items={items} mode="none" open={focused && open} onOpenChange={setOpen} value={value} onValueChange={onValueChange} itemToStringValue={item => item.value}>
    <Autocomplete.Input render={<Input {...props} />} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} />
    {focused && items.length ? <Autocomplete.Portal className="ui-portal"><Autocomplete.Positioner sideOffset={4} align="start" className="isolate z-50">
      <Autocomplete.Popup className="w-[var(--anchor-width)] max-w-[calc(100vw-1rem)] max-h-[var(--available-height)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-[var(--shadow-overlay)]">
        <Autocomplete.List>{(item: Suggestion) => <Autocomplete.Item key={item.value} value={item} className="cursor-default rounded-sm px-3 py-2 break-words data-highlighted:bg-accent data-highlighted:text-accent-foreground">{item.label}</Autocomplete.Item>}</Autocomplete.List>
      </Autocomplete.Popup>
    </Autocomplete.Positioner></Autocomplete.Portal> : null}
  </Autocomplete.Root>;
}
