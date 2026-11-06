import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { prepareSampleDocuments } from "./server/sample-documents.ts";
import { randomBytes } from "node:crypto";
import { LOCAL_FILE_ACCESS } from "./server/file-access.ts";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";
import { faviconSvg } from "../../scripts/brand-icons.ts";
import { collectPackages, packageNotices } from "../../scripts/third-party-notices.ts";
import path from "node:path";
import { brand } from "../../brand.ts";
import { ResetGuard } from "./server/reset-guard.ts";

export default defineConfig({
  // Prebundle the lazy renderer/worker dependencies without fetching them until needed.
  // First-use dependency discovery must not reload the development editor and lose drafts.
  optimizeDeps: { include: ["mermaid", "diff"] },
  // Resolve extensionless imports in the parser's published ESM entry during Host SSR.
  ssr: { noExternal: ["jsonc-parser"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@brand-icon": fileURLToPath(new URL(`../../${brand.icons.svg}`, import.meta.url)) + "?no-inline",
      "@brand-dark-icon": fileURLToPath(new URL(`../../${brand.icons.darkSvg}`, import.meta.url)) + "?no-inline",
    },
  },
  plugins: [
    {
      name: "third-party-notices",
      generateBundle() {
        const editor = fileURLToPath(new URL("./", import.meta.url));
        // CSS sources are build-time dependencies but their content is shipped.
        const css = ["tailwindcss", "shadcn"].map(name => path.join(editor, "node_modules", name, "package.json"));
        const packages = collectPackages([...this.getModuleIds()].filter(id => !id.startsWith("\0")).map(id => id.split("?")[0]).concat(css), [editor]);
        const copied = ["Shadcn-copied-source.txt", "Microsoft-FluentUI-OneDrive.txt"].map(name => readFileSync(new URL(`./public/licenses/${name}`, import.meta.url), "utf8")).join("\n\n");
        this.emitFile({ type: "asset", fileName: "licenses/THIRD_PARTY_LICENSES.txt", source: packageNotices(packages) + "\n\n" + copied });
      },
    },
    react(),
    tailwindcss(),
    {
      name: "product-brand",
      configureServer(server) {
        server.middlewares.use("/favicon.ico", (_req, res) => { res.setHeader("Content-Type", "image/x-icon"); res.end(readFileSync(new URL(`../../${brand.icons.ico}`, import.meta.url))); });
        server.middlewares.use("/favicon.svg", (_req, res) => { res.setHeader("Content-Type", "image/svg+xml"); res.end(faviconSvg()); });
      },
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "favicon.ico", source: readFileSync(new URL(`../../${brand.icons.ico}`, import.meta.url)) });
        this.emitFile({ type: "asset", fileName: "favicon.svg", source: faviconSvg() });
      },
      transformIndexHtml(html) {
        return html.replace("%PRODUCT_NAME%", () => brand.name.en.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
          .replace("%STORAGE_PREFIX%", () => encodeURIComponent(brand.storagePrefix));
      },
    },
    {
      name: "litzio-document",
      async configureServer(server: ViteDevServer) {
        const resetGuard = new ResetGuard();
        const releaseResetGuard = resetGuard.actor("host");
        const assetSigningKey = randomBytes(32);
        let services: Promise<ReturnType<typeof import("./server/host-services.ts").createHostServices>> | undefined;
        let stopping = false;
        const inFlight = new Set<Promise<unknown>>();
        const track = (pending: Promise<unknown>) => {
          inFlight.add(pending);
          void pending.then(() => inFlight.delete(pending), () => inFlight.delete(pending));
        };
        const hostServices = () => {
          if (stopping) throw new Error("The Host is closing.");
          return services ??= server.ssrLoadModule("/server/host-services.ts").then(mod => mod.createHostServices());
        };
        let shutdown: Promise<void> | undefined;
        const finishClosing = () => shutdown ??= (async () => {
          stopping = true;
          try { await services?.then(host => host.close()); }
          catch (error) { resetGuard.blockAfterFailedShutdown(); throw error; }
          finally {
            // A closed socket does not cancel accepted filesystem work, including
            // handlers still loading their SSR module. Keep their writer lease.
            await Promise.allSettled([...inFlight]);
            releaseResetGuard();
          }
        })();
        server.httpServer?.once("close", () => {
          void finishClosing().catch(() => server.config.logger.error("Host shutdown failed; inspect the reset guard before resetting."));
        });
        const closeServer = server.close.bind(server);
        let closing: Promise<void> | undefined;
        server.close = () => closing ??= (async () => {
          stopping = true;
          try { await closeServer(); }
          catch (error) { resetGuard.blockAfterFailedShutdown(); throw error; }
          await finishClosing();
        })();
        const sampleAvailability = prepareSampleDocuments(fileURLToPath(new URL("./samples", import.meta.url)), fileURLToPath(new URL("../../tmp/sample-native-v1", import.meta.url)));
        server.middlewares.use((req, res, next) => {
          const requestUrl = req.url ?? "";
          const base = server.config.base;
          const localUrl = requestUrl.startsWith(base) ? `/${requestUrl.slice(base.length)}` : requestUrl;
          const url = localUrl.split("?")[0];
          if (url === "/api/asset") {
            track(server.ssrLoadModule("/server/asset-api.ts").then(mod => mod.handleAssetRequest(req, res, assetSigningKey, LOCAL_FILE_ACCESS)).catch((error: unknown) => {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }));
            return;
          }
          if (!url.startsWith("/api/") && !url.startsWith("/document/")) {
            next();
            return;
          }
          req.url = localUrl;
          track(server.ssrLoadModule("/server/document-api.ts").then(async (mod) => {
            const handle = (mod as { handleDocumentRequest: typeof import("./server/document-api.ts").handleDocumentRequest })
              .handleDocumentRequest;
            return handle(req, res, next, LOCAL_FILE_ACCESS, Infinity, undefined, sampleAvailability, await hostServices());
          }).catch((error: unknown) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }));
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
