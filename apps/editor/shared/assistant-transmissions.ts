/** Only Litzio-to-provider messages, never provider-owned history or model input. */
export type AssistantTransmission = {
  id: string;
  provider: "codex" | "copilot";
  method: string;
  conversationId?: string;
  turnId?: string;
  tool?: string;
  sources?: { kind: "user" | "automatic" | "attachment" | "tool-result"; label: string; bytes: number }[];
  requestId?: string | number;
  at: number;
  bytes: number;
  payload: unknown;
  status: "attempted" | "written" | "acknowledged" | "rejected" | "uncertain";
};
