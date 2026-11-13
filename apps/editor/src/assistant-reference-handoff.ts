import { useState, type MutableRefObject } from "react";

/** Owns explicit file handoff independently of active tab changes. */
export function useAssistantReferenceHandoff({ assistantReturn, setAssistantOpen }: {
  assistantReturn: MutableRefObject<HTMLElement | null>;
  setAssistantOpen: (open: boolean) => void;
}) {
  const [referenceRequest, setReferenceRequest] = useState<{ path: string }>();

  function addToChat(path: string, returnFocus: HTMLElement | null): void {
    assistantReturn.current = returnFocus;
    setReferenceRequest({ path });
    setAssistantOpen(true);
  }

  function consumeReference(request: { path: string }): void {
    // A late acknowledgement must not clear a newer request, even for the same path.
    setReferenceRequest(previous => previous === request ? undefined : previous);
  }

  return { referenceRequest, addToChat, consumeReference };
}
