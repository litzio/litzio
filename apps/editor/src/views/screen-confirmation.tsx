import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenConfirmInput } from "@litzio/plugin-sdk";
import type { HostClient } from "../host-client.ts";
import { DangerConfirmation } from "../components/ui/danger-confirmation.tsx";

type Choice = { input: ScreenConfirmInput; finish(value: boolean, error?: unknown): void };
/** Confirmation belongs to the mounted screen and shares its request lifetime. */
export function useScreenConfirmation(client: HostClient, lifetime: React.RefObject<AbortController | null>) {
  const [choice, setChoice] = useState<Choice>();
  const pending = useRef<Choice | undefined>(undefined);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => () => pending.current?.finish(false, new DOMException("Screen closed or reloaded.", "AbortError")), []);
  const confirm = useCallback((input: ScreenConfirmInput): Promise<boolean> => {
    const signal = lifetime.current?.signal;
    signal?.throwIfAborted(); client.assertCurrent();
    if (pending.current) return Promise.reject(new Error("Wait for the current operation to finish."));
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise((resolve, reject) => {
      const abort = () => next.finish(false, new DOMException("Screen closed or reloaded.", "AbortError"));
      const next: Choice = { input, finish(value, error) {
        if (pending.current !== next) return;
        pending.current = undefined; signal?.removeEventListener("abort", abort); setChoice(undefined);
        if (error) reject(error); else resolve(value);
      } };
      pending.current = next; signal?.addEventListener("abort", abort, {once:true}); setChoice(next);
    });
  }, [client, lifetime]);
  return { confirm, dialog: choice ? <DangerConfirmation title={choice.input.title} description={choice.input.message}
    action={choice.input.confirmLabel} pending={false} error="" returnFocus={returnFocus}
    onConfirm={() => choice.finish(true)} onClose={() => choice.finish(false)} /> : null };
}
