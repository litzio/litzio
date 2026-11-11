import {readFileSync} from "node:fs";
export async function doclingConverter() {
  const source = readFileSync(new URL("../../../community-plugins/docling/document.js", import.meta.url), "utf8");
  const review = readFileSync(new URL("../../../community-plugins/docling/review.js", import.meta.url), "utf8");
  const reviewUrl = "data:text/javascript;base64," + Buffer.from(review.replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64");
  const converter = await import("data:text/javascript;base64," + Buffer.from(source.replace('"./review.js"', JSON.stringify(reviewUrl)).replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64"));
  const workspace = readFileSync(new URL("../../../community-plugins/docling/workspace.js", import.meta.url), "utf8")
    .replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))
    .replace('"./review.js"', JSON.stringify(reviewUrl))
    .replace('"./document.js"', JSON.stringify("data:text/javascript;base64," + Buffer.from(source.replace('"./review.js"', JSON.stringify(reviewUrl)).replace('"@litzio/plugin-sdk"', JSON.stringify(import.meta.resolve("@litzio/plugin-sdk")))).toString("base64")))
    .replace('"./archive.js"', JSON.stringify(new URL("../../../community-plugins/docling/archive.js", import.meta.url).href));
  return {...converter,...await import(reviewUrl), ...await import("data:text/javascript;base64," + Buffer.from(workspace).toString("base64"))};
}
