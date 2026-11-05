import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Development uses the same bundled public entry as the relocatable distribution.
// Keep esbuild in the build tooling, never in the shipped Host runtime.
export function buildSdkRuntime(outfile?: string) {
  const entry = new URL("../../plugin-sdk/src/index.ts", import.meta.url);
  return build({ absWorkingDir: fileURLToPath(new URL("../../../", import.meta.url)),
    entryPoints: [fileURLToPath(entry)], bundle: true, splitting: false,
    outfile, write: outfile !== undefined, metafile: true,
    platform: "node", format: "esm", target: "node24",
    banner: { js: `import { createRequire } from 'node:module'; const require = createRequire(${outfile ? "import.meta.url" : JSON.stringify(entry.href)});` } });
}

export async function developmentSdkUrl(): Promise<string> {
  const result = await buildSdkRuntime();
  return `data:text/javascript;base64,${Buffer.from(result.outputFiles![0]!.contents).toString("base64")}`;
}
