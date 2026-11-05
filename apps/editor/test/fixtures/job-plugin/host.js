import { readFileSync } from "node:fs";
export function activate() {
  const jobs = new Map();
  return {
    operations: {
      async start(input) {
        const text = readFileSync(input.file, "utf8");
        if (text.startsWith("THROW")) throw Object.assign(new Error("raw-write-private"), {kind:"unavailable"});
        const job = { state: "running", phase: "Reading", progress: { done: 0, total: 3 } };
        const control = { job, text, wake: undefined, timer: undefined }; jobs.set(input.requestId, control);
        for (let step = 1; step <= 3; step++) {
          await new Promise(resolve => { control.wake = resolve; control.timer = setTimeout(resolve, text.startsWith("SLOW") ? 1500 : 700); });
          if (job.state !== "running") return { ...job };
          job.phase = "Processing"; job.progress.done = step;
        }
        if (text.startsWith("FAIL-RAW")) Object.assign(job, { state: "failed", phase: "raw-service-private", error: "raw-service-private" });
        else if (text.startsWith("FAIL")) Object.assign(job, { state: "failed", phase: "raw-service-private", errorKind: text.split(":")[1] });
        else if (text.startsWith("UNCERTAIN")) Object.assign(job, { state: "uncertain", phase: "raw-service-private", errorKind: "unavailable" });
        else Object.assign(job, { state: "completed", phase: "Complete", document: { source: "---\nlitzio: 1\n---\n\n" + text } });
        return structuredClone(job);
      },
      status(input) { const control = jobs.get(input.requestId); if (!control) throw new Error("Unknown job"); return structuredClone(control.job); },
      stop(input) {
        const control = jobs.get(input.requestId); if (!control) throw new Error("Unknown job");
        if (control.text.startsWith("COMPLETE-ON-STOP")) {
          Object.assign(control.job, { state: "completed", phase: "Complete", document: { source: "---\nlitzio: 1\n---\n\n# Completed during Stop\n" } });
          clearTimeout(control.timer); control.wake?.();
          return structuredClone(control.job);
        }
        // Acknowledgement precedes actual cancellation, deliberately observable in UI.
        if (control.job.state === "running" || control.job.state === "uncertain") {
          setTimeout(() => { control.job.state = "stopped"; control.job.phase = "Stopped"; clearTimeout(control.timer); control.wake?.(); }, 100);
        }
        return structuredClone(control.job);
      },
    },
    status: () => ({ available: true, message: "Fixture", folders: [], decorations: [], accounts: [] }),
    dispose() { for (const control of jobs.values()) { clearTimeout(control.timer); control.job.state = "stopped"; control.wake?.(); } },
  };
}
