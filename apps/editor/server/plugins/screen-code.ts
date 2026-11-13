import "./screen-binary.ts";
import { buildSync } from "esbuild";
import { realpathSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

export function compileScreen(directory: string, entry: string, authoring = false): string {
  const root = realpathSync(directory);
  const bundled = path.resolve(root, entry.replace(/\.[^.]+$/, ".bundle.js"));
  const file = realpathSync(!authoring && existsSync(bundled) ? bundled : path.resolve(root, entry));
  if (path.relative(root, file).startsWith("..")) throw new Error("Screen entry must stay inside plugin folder");
  let result: ReturnType<typeof buildSync>;
  try { result = buildSync({ entryPoints: [file], bundle: true, write: false, format: authoring ? "esm" : "cjs", external: ["react", "react/jsx-runtime", "react-dom"], platform: "browser", target: "es2022", jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment", sourcemap: "inline", sourcesContent: false, absWorkingDir: root, logLevel: "silent", metafile: true }); } catch (error) {
    const first = (error as { errors?: {text:string;location?:{file:string;line:number;column:number}}[] }).errors?.[0];
    const loc = first?.location;
    throw Object.assign(new Error(`${loc?.file ?? entry}${loc ? `:${loc.line}:${loc.column + 1}` : ""}: ${first?.text ?? (error instanceof Error ? error.message : "Screen compilation failed")}`), { name: "ScreenCompileError", loc });
  }
  // No npm modules, external imports, or files outside this artifact.
  for (const name of Object.keys(result.metafile!.inputs)) {
    const relative = path.relative(root, realpathSync(path.resolve(root, name)));
    if (relative.startsWith("..") || !authoring && relative.split(path.sep).includes("node_modules")) throw new Error("Screen imports must be local plugin files; npm packages are unsupported");
  }
  if (Object.values(result.metafile!.outputs).some(output => output.imports.some(item => !["react", "react/jsx-runtime", "react-dom"].includes(item.path)))) throw new Error("Screen external imports are unsupported");
  if (authoring) return result.outputFiles![0]!.text;
  return `export default function(React,ReactDOM){const require=id=>{if(id==="react")return React;if(id==="react-dom")return ReactDOM;if(id==="react/jsx-runtime")return {Fragment:React.Fragment,jsx:(type,props,key)=>React.createElement(type,{...props,key}),jsxs:(type,props,key)=>React.createElement(type,{...props,key})};throw Error("Unsupported screen import "+id);};const module={exports:{}};const exports=module.exports;\n${result.outputFiles![0]!.text}\nreturn module.exports.default;}`;
}


export function bundleScreens(directory: string) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "litzio-plugin.json"), "utf8"));
  const started = Date.now();
  const files = [];
  for (const screen of manifest.contributes?.screens ?? []) if (screen.entry) {
    const source = compileScreen(directory, screen.entry, true);
    const file = screen.entry.replace(/\.[^.]+$/, ".bundle.js");
    writeFileSync(path.join(directory, file), source);
    files.push({ file, bytes: Buffer.byteLength(source) });
  }
  if (!files.length) throw new Error("No screens[].entry declared; scaffold a screen first");
  return { files, milliseconds: Date.now() - started };
}
