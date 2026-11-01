import { fileURLToPath, URL } from "node:url";
import { prepareSampleDocuments } from "./server/sample-documents.ts";
import { randomBytes } from "node:crypto";
import { LOCAL_FILE_ACCESS } from "./server/file-access.ts";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";
import { buildDoclingWorker } from "../../packages/cli/scripts/build-docling-worker.ts";
import { buildAiAgent } from "../../packages/cli/scripts/build-ai-agent.ts";
import { brand } from "../../brand.ts";

export default defineConfig({
  // Prebundle the lazy renderer/worker dependencies without fetching them until needed.
  // First-use dependency discovery must not reload the development editor and lose drafts.
  optimizeDeps: { include: ["mermaid", "diff"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@brand-icon": fileURLToPath(new URL(`../../${brand.icons.png}`, import.meta.url)),
      "@brand-small-icon": fileURLToPath(new URL(`../../${brand.icons.smallPng}`, import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "product-brand",
      transformIndexHtml(html) {
        return html.replace("%PRODUCT_NAME%", () => brand.name.en.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"))
          .replace("%STORAGE_PREFIX%", () => encodeURIComponent(brand.storagePrefix));
      },
    },
    {
      name: "litzio-document",
      async configureServer(server: ViteDevServer) {
        await buildDoclingWorker(fileURLToPath(new URL("../../tmp/docling-worker", import.meta.url)));
        await buildAiAgent(fileURLToPath(new URL("../../tmp/ai-agent-worker", import.meta.url)));
        const assetSigningKey = randomBytes(32);
        let plugins: Promise<ReturnType<typeof import("./server/plugin-host.ts").createPluginHost>> | undefined;
        const pluginHost = () => plugins ??= server.ssrLoadModule("/server/plugin-host.ts").then(mod => mod.createPluginHost());
        server.httpServer?.once("close", () => { void plugins?.then(host => host.close()); });
        const sampleAvailability = prepareSampleDocuments(fileURLToPath(new URL("./samples", import.meta.url)), fileURLToPath(new URL("../../tmp/sample-native-v1", import.meta.url)));
        server.middlewares.use((req, res, next) => {
          const requestUrl = req.url ?? "";
          const base = server.config.base;
          const localUrl = requestUrl.startsWith(base) ? `/${requestUrl.slice(base.length)}` : requestUrl;
          const url = localUrl.split("?")[0];
          if (url === "/api/asset") {
            void server.ssrLoadModule("/server/asset-api.ts").then(mod => mod.handleAssetRequest(req, res, assetSigningKey, LOCAL_FILE_ACCESS)).catch((error: unknown) => {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            });
            return;
          }
          if (!url.startsWith("/api/") && !url.startsWith("/document/")) {
            next();
            return;
          }
          req.url = localUrl;
          void server.ssrLoadModule("/server/document-api.ts").then(async (mod) => {
            const handle = (mod as { handleDocumentRequest: typeof import("./server/document-api.ts").handleDocumentRequest })
              .handleDocumentRequest;
            return handle(req, res, next, LOCAL_FILE_ACCESS, Infinity, undefined, sampleAvailability, await pluginHost());
          }).catch((error: unknown) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          });
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
