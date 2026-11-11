import {readFileSync} from "node:fs";
const root = new URL("../../../community-plugins/docling/", import.meta.url);
const modules = new Map<string,string>();
function moduleUrl(name: string): string {
  if (modules.has(name)) return modules.get(name)!;
  const url = new URL(name,root);
  const source = readFileSync(url,"utf8")
    .replaceAll('"@litzio/plugin-sdk"',JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))
    .replaceAll(/import\.meta\.url/g,JSON.stringify(url.href))
    .replaceAll(/"\.\/([\w-]+\.js)"/g,(_match,file) => JSON.stringify(moduleUrl(file)))
    .replaceAll(/"\.\/([^"\n]+\.json)"/g,(_match,file) => JSON.stringify(new URL(file,root).href));
  const encoded = "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
  modules.set(name,encoded);return encoded;
}
export async function doclingConverter() {
  return Object.assign({},...await Promise.all(["document.js","review.js","workspace.js","archive.js","conversion.js","schema.js","lenses.js"].map(file=>import(moduleUrl(file)))));
}
