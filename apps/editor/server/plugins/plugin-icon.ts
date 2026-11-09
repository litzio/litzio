import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { validateImage } from "../image-validation.ts";
export const MAX_ICON_BYTES = 64 * 1024;
export const MAX_ICON_SIZE = 256;
/** artifactDigest rejects links and escapes before this function reads the icon. */
export function readPluginIcon(directory: string, icon: string) {
  const file = path.join(directory, icon), metadata = statSync(file);
  if (!metadata.isFile() || metadata.size > MAX_ICON_BYTES) throw new Error("Icon exceeds 64 KiB or is not a file");
  const bytes = readFileSync(file);
  let width: number, height: number;
  const mime = icon.endsWith(".png") ? "image/png" : "image/svg+xml";
  if (mime === "image/png") {
    validateImage(mime, bytes);
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else {
    const fail = () => { throw new Error("Invalid SVG icon"); };
    const document = new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } }).parseFromString(new TextDecoder("utf-8", { fatal: true }).decode(bytes), "image/svg+xml");
    const root = document.documentElement;
    if (document.doctype || root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") fail();
    const dimension = (value: string | null) => value && /^(?:\d+(?:\.\d+)?)(?:px)?$/.test(value) ? Number(value.replace(/px$/, "")) : NaN;
    width = dimension(root.getAttribute("width")); height = dimension(root.getAttribute("height"));
  }
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= MAX_ICON_SIZE)) throw new Error("Icon dimensions must be 1-256 pixels");
  return { bytes, mime };
}
