import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Development uses the same bundled public entry as the relocatable distribution.
// Keep esbuild in the build tooling, never in the shipped Host runtime.
export async function developmentSdkUrl(): Promise<string> {
  const entry = new URL("../../plugin-sdk/src/index.ts", import.meta.url);
  const result = await build({ entryPoints: [fileURLToPath(entry)], bundle: true, write: false,
    platform: "node", format: "esm", target: "node24",
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(entry.href)});` } });
  return `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.contents).toString("base64")}`;
}
