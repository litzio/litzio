import { useState, type MutableRefObject } from "react";
import { brand } from "../../../brand.ts";
import { hostRegistry } from "./host-client.ts";
import type { HostLocator } from "./host-locator.ts";
import type { UiMessage } from "./ui-message.ts";

/** Owns the pending request and conversation Host, independently of active tabs and filters. */
export function useAssistantReferenceHandoff({ assistantReturn, setAssistantOpen, setError }: {
  assistantReturn: MutableRefObject<HTMLElement | null>;
  setAssistantOpen: (open: boolean) => void;
  setError: (message: UiMessage) => void;
}) {
  const [referenceRequest, setReferenceRequest] = useState<HostLocator>();
  const [assistantHost, setAssistantHost] = useState<string | undefined>();

  function addToChat(locator: HostLocator, returnFocus: HTMLElement | null): void {
    if (assistantHost && assistantHost !== locator.hostId) {
      setError({ key: "Start a conversation on the file’s Host to reference it." });
      return;
    }
    setAssistantHost(locator.hostId);
    assistantReturn.current = returnFocus;
    setReferenceRequest({ ...locator });
    setAssistantOpen(true);
  }

  function consumeReference(request: HostLocator): void {
    // A late acknowledgement must not clear a newer request, even for the same path.
    setReferenceRequest(previous => previous === request ? undefined : previous);
  }

  function newConversation(): void {
    setReferenceRequest(undefined);
    setAssistantHost(undefined);
  }

  function chooseHost(hostId: string): void {
    if (hostRegistry.get(hostId).state !== "connected") return;
    if (hostRegistry.list().length > 1) {
      try { localStorage.removeItem(`${brand.storagePrefix}.assistantConversation:${hostId}`); } catch { /* Page state remains usable. */ }
    }
    setAssistantHost(hostId);
  }

  return { assistantHost, referenceRequest, addToChat, consumeReference, newConversation, chooseHost };
}
