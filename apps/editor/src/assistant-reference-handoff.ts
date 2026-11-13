import { useState, type MutableRefObject } from "react";
import { LOCAL_HOST_ID } from "./host-locator.ts";
import type { HostLocator } from "./host-locator.ts";
import type { UiMessage } from "./ui-message.ts";

/** Owns the pending request and conversation Host, independently of active tabs and filters. */
export function useAssistantReferenceHandoff({ assistantReturn, setAssistantOpen, setError }: {
  assistantReturn: MutableRefObject<HTMLElement | null>;
  setAssistantOpen: (open: boolean) => void;
  setError: (message: UiMessage) => void;
}) {
  const [referenceRequest, setReferenceRequest] = useState<HostLocator>();
  const [assistantHost, setAssistantHost] = useState<string | undefined>(LOCAL_HOST_ID);

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

  return { assistantHost, referenceRequest, addToChat, consumeReference };
}
