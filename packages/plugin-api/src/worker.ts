/** Worker API 1 retains the existing PDF job contract. No document semantics. */
export type PdfProgress = { phase: "checking" | "uploading" | "pending" | "started" | "downloading" | "writing"; taskId?: string };
export type ConversionFailure = { code: "model-missing" | "capacity" | "source" | "timeout" | "server" | "output" | "unreachable" | "not-ready" | "version" | "openapi"; taskId?: string };
export type ConversionJob = {
  id: string; input: string; output: string; startedAt: number;
  state: "running" | "success" | "error" | "cancelled";
  progress: PdfProgress; error?: string; failure?: ConversionFailure;
};

export type ConversionRequest = { job: ConversionJob; server: string; plugin?: string; timeoutMs?: number; beforePublish(): void };
export interface ConversionExecutor {
  start(request: ConversionRequest): Promise<ConversionJob>;
  current(id: string): ConversionJob | null;
  cancel(id: string): Promise<ConversionJob>;
  close(): Promise<void>;
}
