import { readFileSync } from "node:fs";
import path from "node:path";
import { brand } from "../brand.ts";
export const repo = path.resolve(import.meta.dirname, "..");
/** Embed independent source documents so their mask IDs cannot collide. */
export function faviconSvg(): string {
  const image = (source: string) => `data:image/svg+xml;base64,${readFileSync(path.join(repo, source)).toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><style>.dark{display:none}@media(prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}</style><image class="light" width="1024" height="1024" href="${image(brand.icons.smallSvg)}"/><image class="dark" width="1024" height="1024" href="${image(brand.icons.smallDarkSvg)}"/></svg>`;
  if (Buffer.byteLength(svg) > 32768) throw new Error("favicon.svg exceeds 32KB");
  return svg;
}
