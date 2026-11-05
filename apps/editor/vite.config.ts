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

export default defineConfig({
  // Prebundle the lazy renderer/worker dependencies without fetching them until needed.
  // First-use dependency discovery must not reload the development editor and lose drafts.
  optimizeDeps: { include: ["mermaid", "diff"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@brand-icon": fileURLToPath(new URL(`../../${brand.icons.svg}`, import.meta.url)) + "?no-inline",
      "@brand-dark-icon": fileURLToPath(new URL(`../../${brand.icons.darkSvg}`, import.meta.url)) + "?no-inline",
    },
  },
  plugins: [
    { name: "dynamic-ui-spike", configureServer(server) {
      if (process.env.LITZIO_VIEW_SPIKE !== "1") return;
      server.middlewares.use("/api/view-spike", async (req, res) => {
        const mod = await server.ssrLoadModule("/server/view-spike.ts");
        await mod.viewSpikeRequest(req, res);
      });
    } },
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
        const assetSigningKey = randomBytes(32);
        let assistant: Promise<ReturnType<typeof import("./server/assistant-host.ts").createAssistantHost>> | undefined;
        const assistantHost = () => assistant ??= server.ssrLoadModule("/server/assistant-host.ts").then(mod => mod.createAssistantHost());
        server.httpServer?.once("close", () => { void assistant?.then(host => host.close()); });
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
            return handle(req, res, next, LOCAL_FILE_ACCESS, Infinity, undefined, sampleAvailability, await assistantHost());
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
