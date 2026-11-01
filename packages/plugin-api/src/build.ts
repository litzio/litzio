import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PLUGIN_UI } from "./config.ts";
import { parse } from "@babel/parser";
import { isBuiltin } from "node:module";

/** Include erased type imports: esbuild's runtime graph alone cannot prove the
 * public boundary. Relative UI inputs must remain inside the plugin's source. */
function checkUiSources(entry: string) {
  const sourceDirectory = path.dirname(entry);
  const root = existsSync(path.join(sourceDirectory, "../package.json")) ? path.dirname(sourceDirectory) : sourceDirectory;
  const apiSources = new Map(["ui", "config", "worker", "host", "ai"].map(name => [`@litzio/plugin-api/${name}`, fileURLToPath(new URL(`./${name}.ts`, import.meta.url))]));
  const roots = [root, path.dirname(apiSources.get("@litzio/plugin-api/ui")!)];
  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return; visited.add(file);
    const imports = new Set<string>();
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type) && node.source) imports.add(node.source.value);
      if (node.type === "TSImportType") imports.add(node.argument.value);
      if (node.type === "CallExpression" && node.callee?.type === "Import") {
        if (node.arguments[0]?.type !== "StringLiteral") throw new Error("Plugin UI imports must be static.");
        imports.add(node.arguments[0].value);
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
    };
    walk(parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] }));
    for (const name of imports) {
      if (apiSources.has(name)) { visit(apiSources.get(name)!); continue; }
      if (/^(?:react(?:\/jsx-runtime)?|@litzio\/core(?:\/[\w-]+)?)$/u.test(name)) continue;
      if (!name.startsWith(".")) {
        if (/(?:@tiptap|prosemirror|react-dom|apps[\\/]editor|^@\/|^@litzio\/)/u.test(name)) throw new Error(`Plugin UI cannot import editor/non-public code: ${name}`);
        continue; // Type-only module data may reference Node or validation libraries.
      }
      const resolved = path.resolve(path.dirname(file), name);
      if (!roots.some(root => { const relative = path.relative(root, resolved); return !relative.startsWith("..") && !path.isAbsolute(relative); })) throw new Error(`Plugin UI cannot import editor/non-public code: ${name}`);
      if (/\.(?:css|json)$/u.test(resolved)) continue;
      const source = [resolved, resolved + ".ts", resolved + ".tsx"].find(existsSync);
      if (!source) throw new Error(`Missing UI input: ${name}`);
      visit(source);
    }
  };
  visit(entry);
}

/** Includes erased type imports, exports, require and dynamic imports. This is a
 * dependency boundary for trusted code, not an OS/filesystem sandbox. */
export function sourceImports(file: string, allowDynamic = false): string[] {
  const imports = new Set<string>();
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(node.type) && node.source) imports.add(node.source.value);
    if (node.type === "TSImportType") imports.add(node.argument.value);
    if (node.type === "TSExternalModuleReference") imports.add(node.expression.value);
    if (node.type === "CallExpression" && (node.callee?.type === "Import" || node.callee?.name === "require")) {
      if (node.arguments[0]?.type !== "StringLiteral") {
        if (!allowDynamic) throw new Error(`Imports must be static: ${file}`);
      } else imports.add(node.arguments[0].value);
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") walk(value);
  };
  walk(parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] }));
  return [...imports];
}
export function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", "dist", "build", "release"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.[cm]?[jt]sx?$/u.test(entry.name) ? [file] : [];
  });
}
export function checkPluginSources(root: string) {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const core = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.resolve("@litzio/core"))), "utf8"));
  const api = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies };
  const publicImport = (name: string) => {
    const owner = name.startsWith("@litzio/core") ? ["@litzio/core", core] : ["@litzio/plugin-api", api];
    const [prefix, pkg] = owner;
    const key = name === prefix ? "." : "." + name.slice(prefix.length);
    return Object.hasOwn(pkg.exports, key);
  };
  for (const name of Object.keys(dependencies)) {
    if (/(?:@tiptap|prosemirror|react-dom)/u.test(name) || name.startsWith("@litzio/") && !["@litzio/core", "@litzio/plugin-api"].includes(name)) throw new Error(`Plugin cannot depend on internal package: ${name}`);
  }
  for (const file of [...sourceFiles(path.join(root, "src")), ...sourceFiles(path.join(root, "scripts"))]) for (const name of sourceImports(file)) {
    if (name.startsWith(".")) {
      const relative = path.relative(root, path.resolve(path.dirname(file), name));
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Plugin cannot import outside its folder: ${file}: ${name}`);
    } else if (path.isAbsolute(name) || /^(?:file:|[a-z]:[\\/])/iu.test(name) || /(?:@tiptap|prosemirror|react-dom|apps[\\/]editor|^@\/)/u.test(name) || name.startsWith("@litzio/") && !publicImport(name)) {
      throw new Error(`Plugin cannot import editor/non-public code: ${file}: ${name}`);
    } else if (!isBuiltin(name) && !Object.hasOwn(dependencies, name.split("/").slice(0, name.startsWith("@") ? 2 : 1).join("/"))) {
      throw new Error(`Plugin cannot import an undeclared dependency: ${file}: ${name}`);
    }
  }
}

/** Bundle trusted UI without a second React. The factory's require is lexical,
 * not eval/global state; both renderer dependencies are supplied by the Host. */
export async function buildPluginUi(entry: string, destination: string) {
  checkUiSources(entry);
  const result = await build({ entryPoints: [entry], outdir: destination, bundle: true, platform: "browser", format: "cjs",
    target: "es2022", write: false, metafile: true, jsx: "automatic", external: ["react", "react/jsx-runtime"],
    plugins: [{ name: "plugin-boundary", setup(build) {
      build.onResolve({ filter: /(?:apps[\\/]editor|@tiptap|prosemirror|react-dom|react\/jsx-dev-runtime)/ }, args => {
        throw new Error(`Plugin UI cannot import editor/renderer internals: ${args.path}`);
      });
    } }], logLevel: "warning" });
  for (const input of Object.keys(result.metafile.inputs)) if (/(?:apps[\\/]editor|@tiptap|prosemirror|node_modules[\\/]react[\\/])/u.test(input)) {
    throw new Error(`Forbidden plugin UI input: ${input}`);
  }
  const script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, PLUGIN_UI.script), `export function activate(host) {
    const module = { exports: {} };
    const require = name => {
      if (name === "react") return host.React;
      if (name === "react/jsx-runtime") return host.jsx;
      throw new Error("Unsupported UI import: " + name);
    };
    ${script}
    return module.exports.activate(host);
  }\n`);
  writeFileSync(path.join(destination, PLUGIN_UI.style), css);
  return result.metafile;
}
