import path from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { HostPlugin, PluginHostContext } from "@litzio/plugin-api/host";
import { DoclingHost, type ConversionSession } from "./conversion/server.ts";
import { readComparison } from "./comparison/compare-host.ts";
import { convertDoclingFile } from "./conversion/files.ts";
import { applyDoclingCorrections, addDoclingCorrection, removeDoclingCorrection } from "./conversion/correction-files.ts";
import { doclingServerUrl } from "./conversion/pdf.ts";
import type { ConversionJob } from "@litzio/plugin-api/worker";
import { statSync } from "node:fs";
import { inspectDoclingMap } from "./shared/map.ts";
import type { Features, ConversionResult } from "./shared/dashboard.ts";
import { StructureReviewer } from "./structure-review.ts";

export function activate(host: PluginHostContext): HostPlugin {
  const session = (host.session.get("conversion") ?? { admitting: false }) as ConversionSession;
  host.session.set("conversion", session);
  const conversion = new DoclingHost(host.settingsFile, host.resolvePath, host.executor, session);
  const features = (): Features => ({ conversion: host.features().conversion !== false, comparison: host.features().comparison !== false });
  const requireFeature = (name: keyof Features) => { if (!features()[name]) throw new Error("This Docling feature is disabled."); };
  const review = new StructureReviewer(host, () => requireFeature("conversion"));
  const history = () => {
    if (!host.executor.history) throw new Error("Plugin request history is unavailable.");
    return host.executor.history().filter(({ job }) => {
      try { host.resolvePath(job.input, true); host.resolvePath(job.output, true); return true; } catch { return false; }
    });
  };
  const results = (): ConversionResult[] => history().filter(record => record.status === "success").map(({ job }) => {
    const result: ConversionResult = { id: job.id, folder: job.output, path: path.join(job.output, "document.md"), convertedAt: job.finishedAt ?? job.startedAt };
    try {
      const folder = host.resolvePath(job.output, true);
      try { statSync(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...result, missing: true }; throw error; }
      const document = host.documentPath(result.path);
      const { map, stale } = inspectDoclingMap(host.readText(host.mediaPath("document.docling-map.json", document)), host.readText(document));
      return { ...result, name: map.source.name, pages: Object.keys(map.pages).length, stale };
    } catch { return { ...result, problem: "Could not read the conversion result." }; }
  });
  const correct = (args: any, change: "apply" | "add" | "remove") => {
    requireFeature("conversion");
    const folder = realpathSync.native(host.resolvePath(path.resolve(args.folder)));
    const options = { resolveSource: (file: string) => host.resolvePath(file), beforePublish: () => { host.resolvePath(folder); host.resolvePath(path.dirname(folder)); } };
    const result = change === "add" ? addDoclingCorrection(folder, args.entry, options)
      : change === "remove" ? removeDoclingCorrection(folder, args.id, options) : applyDoclingCorrections(folder, options);
    return { output: folder, documentSha256: result.map.document.sha256 };
  };
  return {
    drainingOperations: ["current", "cancel", "start", "stop", "review-status", "review-proposals", "review-cancel"],
    routes: {
      "/api/docling-settings": { GET: "settings", PUT: "configure" },
      "/api/docling-check": { POST: "check" },
      "/api/docling-conversion": { GET: "current", POST: "start", DELETE: "cancel" },
      "/api/docling-compare": { GET: "compare" },
      "/api/docling-dashboard": { GET: "dashboard", POST: "check" },
      "/api/docling-features": { PUT: "features" },
      "/api/docling-history": { POST: "stop", DELETE: "forget" },
    },
    operations: {
      "review-start": args => review.start(args.folder, args.id),
      "review-status": args => review.list(args.folder),
      "review-proposals": args => review.list(args.folder),
      "review-cancel": args => review.cancel(args.folder),
      "review-approve": args => review.decide(args.folder, args.id, "approve"),
      "review-reject": args => review.decide(args.folder, args.id, "reject"),
      "review-undo": args => review.decide(args.folder, args.id, "undo"),
      "apply-corrections": args => correct(args, "apply"),
      "add-correction": args => correct(args, "add"),
      "remove-correction": args => correct(args, "remove"),
      dashboard: () => ({ ...conversion.settings(), features: features(), requests: history(), results: results() }),
      features: args => {
        if (!args || Object.keys(args).some(key => !["conversion", "comparison"].includes(key)) || Object.values(args).some(value => typeof value !== "boolean")) throw new Error("Invalid Docling features.");
        host.setFeatures(args); return features();
      },
      forget: args => {
        if (!history().some(record => record.job.id === args.id)) throw new Error("This Docling conversion is no longer available.");
        if (!host.executor.forget) throw new Error("Plugin request history is unavailable.");
        host.executor.forget(args.id); return {};
      },
      stop: args => {
        if (!history().some(record => record.job.id === args.id)) throw new Error("This Docling conversion is no longer available.");
        return host.executor.cancel(args.id);
      },
      settings: () => { requireFeature("conversion"); return conversion.settings(); }, configure: args => { requireFeature("conversion"); return conversion.configure(args.server); },
      check: () => conversion.check(), current: args => conversion.current(args.id),
      start: args => { if (!args.id || !conversion.current(args.id)) requireFeature("conversion"); return conversion.start(args.path, args.id); }, cancel: args => conversion.cancel(args.id),
      compare: args => {
        requireFeature("comparison");
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
        requireFeature("conversion");
        const input = host.resolvePath(path.resolve(args.input)), output = host.resolvePath(path.resolve(args.output), true);
        const result = convertDoclingFile(input, output);
        const counts = result.map.items.reduce<Record<string, number>>((sum, item) => {
          sum[item.status] = (sum[item.status] ?? 0) + 1; return sum;
        }, {});
        return { output, ...counts };
      },
      "convert-pdf": async args => {
        requireFeature("conversion");
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
