import * as ReactDOM from "react-dom";
import * as React from "react";
import { screenUI as ui } from "./screen-ui.ts";
import { Notice } from "../ui/primitives.tsx";
import type { HostClient } from "../host-client.ts";
import { saveScreenDocument, type ScreenDocumentInput } from "./screen-document.ts";
import { DocumentViewScope } from "./screen-document-view.tsx";
type ScreenProps = { React: typeof React; ui: typeof ui; invoke(operation: string, input?: unknown): Promise<unknown>; saveDocument(input: ScreenDocumentInput): ReturnType<typeof saveScreenDocument> };
export class ScreenBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string; closing?: boolean }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(previous: Readonly<{ resetKey?: string }>, previousState: Readonly<{ error?: Error }>) {
    if (previousState.error && this.state.error && this.props.resetKey && previous.resetKey !== this.props.resetKey) this.setState({ error: undefined });
  }
  render() { return this.state.error && this.props.closing ? null : this.state.error ? <Notice tone="error"><pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.stack ?? this.state.error.message}</pre></Notice> : this.props.children; }
}
export function PluginScreenCode({ code, owner, client, roots, onOpen }: { code: string; owner: string; client: HostClient; roots: string[]; onOpen?(path: string): void }) {
  const lifetime = React.useRef<AbortController | null>(null);
  const [Screen, setScreen] = React.useState<React.ComponentType<ScreenProps>>();
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let disposed = false;
    const controller = new AbortController(); lifetime.current = controller;

    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    setScreen(undefined); setError("");
    void import(/* @vite-ignore */ url).then(module => {
      const Component = module.default(React, ReactDOM);
      if (typeof Component !== "function") throw new Error("Screen entry must export a default React component");
      if (!disposed) setScreen(() => Component);
    }).catch(error => { if (!disposed) setError(String(error?.stack ?? error)); }).finally(() => URL.revokeObjectURL(url));
    return () => { disposed = true; controller.abort(); };
  }, [code, client, owner]);
  const invoke = React.useCallback(async (operation: string, input: unknown = {}) => {
    const signal = lifetime.current?.signal;
    signal?.throwIfAborted(); client.assertCurrent();
    const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ action: "screen-invoke", plugin: owner, operation: `${owner}.${operation}`, input }) });
    const reply = await response.json();
    if (!response.ok || reply.error || reply.receipt?.outcome !== "success") throw new Error(reply.error ?? `HTTP ${response.status}`);
    return reply.result;
  }, [client, owner]);
  const saveDocument = React.useCallback(async (input: ScreenDocumentInput) => {
    const signal = lifetime.current?.signal;
    const receipt = await saveScreenDocument(client, roots, input, signal);
    if (!signal?.aborted && input.open) { client.assertCurrent(); onOpen?.(receipt.path); }
    return receipt;
  }, [client, roots, onOpen]);
  return error ? <Notice tone="error"><pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre></Notice> : Screen ? <DocumentViewScope.Provider value={{ client, roots }}><Screen React={React} ui={ui} invoke={invoke} saveDocument={saveDocument} /></DocumentViewScope.Provider> : null;
}
