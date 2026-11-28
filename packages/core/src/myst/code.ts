import type { CodeBlockContent } from "../code.ts";
import type { MystNode } from "./tree.ts";

const CODE_FIELDS = new Set(["type", "lang", "value", "meta", "position"]);

export function isCodeFenceMeta(value: unknown): value is string {
  return typeof value === "string" && /^[ \t]/.test(value) && !/[\0\r\n]/.test(value) && value.trim().length > 0;
}

/**
 * Plain fenced or indented code has literal code and optional language and info.
 * `{code-block}` containers with captions or labels, front matter and
 * other code-like nodes are rejected by native admission.
 */
export function supportedCodeBlock(node: MystNode): CodeBlockContent | undefined {
  const { lang, value, meta } = node;
  if (node.type !== "code" || typeof value !== "string" ||
      (lang !== undefined && typeof lang !== "string") ||
      (meta !== undefined && (!lang || !isCodeFenceMeta(meta))) ||
      !Object.keys(node).every((key) => CODE_FIELDS.has(key) || node[key] === undefined)) return undefined;
  return { language: lang ?? "", code: value, ...(typeof meta === "string" ? { meta } : {}) };
}

/** The MyST structure myst-parser produces for a fenced code block of this content. */
export function createCodeNode(content: CodeBlockContent): MystNode {
  return { type: "code", lang: content.language, value: content.code, ...(content.meta !== undefined ? { meta: content.meta } : {}) };
}

/** The stock writer inserts a separator and escapes info, which would change this suffix. */
export function writeCodeFence(language: string, code: string, meta: string): string {
  const tilde = meta.includes("`") || language.includes("`");
  const marker = tilde ? "~" : "`";
  let length = 3;
  for (const run of code.matchAll(tilde ? /~+/g : /`+/g)) length = Math.max(length, run[0].length + 1);
  const fence = marker.repeat(length);
  const gap = language.startsWith(marker) ? " " : "";
  const lang = language.replaceAll("&", "&amp;").replace(/^\{/, "&#123;");
  return fence + gap + lang + meta + "\n" + (code ? code + "\n" : "") + fence;
}
