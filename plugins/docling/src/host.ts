import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { HostPlugin, PluginHostContext } from "@litzio/plugin-api/host";
import { DoclingHost, type ConversionSession } from "./server.ts";
import { readComparison } from "./compare-host.ts";
import { convertDoclingFile } from "./files.ts";
import { doclingServerUrl } from "./pdf.ts";
import type { ConversionJob } from "@litzio/plugin-api/worker";

export function activate(host: PluginHostContext): HostPlugin {
  const session = (host.session.get("conversion") ?? { admitting: false }) as ConversionSession;
  host.session.set("conversion", session);
  const conversion = new DoclingHost(host.settingsFile, host.resolvePath, host.executor, session);
  return {
    drainingOperations: ["current", "cancel", "start"],
    routes: {
      "/api/docling-settings": { GET: "settings", PUT: "configure" },
      "/api/docling-check": { POST: "check" },
      "/api/docling-conversion": { GET: "current", POST: "start", DELETE: "cancel" },
      "/api/docling-compare": { GET: "compare" },
    },
    operations: {
      settings: () => conversion.settings(), configure: args => conversion.configure(args.server),
      check: () => conversion.check(), current: args => conversion.current(args.id),
      start: args => conversion.start(args.path, args.id), cancel: args => conversion.cancel(args.id),
      compare: args => {
        if (!args.path?.trim()) throw new Error("Choose a Docling conversion folder.");
        const file = host.documentPath(args.path), source = host.readText(file);
        host.validateDocument(source);
        const sidecar = host.mediaPath(`${path.basename(file, ".md")}.docling-map.json`, file);
        const snapshot = readComparison(file, source, host.readText(sidecar));
        for (const page of Object.values(snapshot.map.pages)) {
          if (!page.image) continue;
          if (/^[a-z][a-z\d+.-]*:/i.test(page.image.uri)) throw new Error("Page images must be local to the conversion folder.");
          host.mediaPath(page.image.uri, file);
        }
        return snapshot;
      },
      convert: args => {
        const input = host.resolvePath(path.resolve(args.input)), output = host.resolvePath(path.resolve(args.output), true);
        const result = convertDoclingFile(input, output);
        const counts = result.map.items.reduce<Record<string, number>>((sum, item) => {
          sum[item.status] = (sum[item.status] ?? 0) + 1; return sum;
        }, {});
        return { output, ...counts };
      },
      "convert-pdf": async args => {
        const input = host.resolvePath(path.resolve(args.input)), output = host.resolvePath(path.resolve(args.output), true);
        if (existsSync(output)) throw new Error("Output directory already exists; choose a new directory");
        if (!Number.isSafeInteger(args.timeoutMs) || args.timeoutMs <= 0 || args.timeoutMs > 2_147_483_647) throw new Error("Invalid conversion timeout/poll interval");
        const job: ConversionJob = { id: randomUUID(), input, output, startedAt: Date.now(), state: "running", progress: { phase: "checking" } };
        await host.executor.start({ job, server: doclingServerUrl(args.server).href, timeoutMs: args.timeoutMs,
          beforePublish: () => { host.resolvePath(input); host.resolvePath(path.dirname(output)); },
        });
        let current = host.executor.current(job.id)!;
        while (current.state === "running") { await delay(25); current = host.executor.current(job.id)!; }
        if (current.state !== "success") throw new Error(current.error ?? "Docling conversion failed.");
        const record = JSON.parse(host.readText(path.join(output, "conversion-record.json")));
        return { output, taskId: record.taskId, pages: record.document.pages, elapsedMs: record.elapsedMs };
      },
    },
  };
}
