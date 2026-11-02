import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import dollarmath from "markdown-it-dollarmath";
import katex from "katex";
import { figureMediaPath } from "../shared/figure-media-path.ts";

/** Display only. No Core admission, rewriting or serialization. Raw HTML stays text. */
export function renderPlainMarkdown(source: string, path: string): string {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false })
    .use(footnote).use(taskLists).use(dollarmath, {
      allow_labels: false,
      renderer: (text: string, options: { displayMode: boolean }) => katex.renderToString(text, {
        displayMode: options.displayMode, throwOnError: false, trust: false, maxExpand: 1000,
      }),
    });
  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const src = token.attrGet("src") ?? "";
    const relative = figureMediaPath(src);
    if (relative !== undefined) token.attrSet("src", `${import.meta.env?.BASE_URL ?? "/"}document/${relative}?path=${encodeURIComponent(path)}`);
    else if (!/^https?:\/\//i.test(src)) return md.utils.escapeHtml(token.content);
    return image(tokens, index, options, env, renderer);
  };
  const link = md.renderer.rules.link_open ?? ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));
  md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index], href = token.attrGet("href") ?? "";
    if (!/^https?:\/\//i.test(href) && !/^#fn(?:ref)?\d+$/.test(href)) token.attrs = token.attrs?.filter(([name]) => name !== "href") ?? null;
    return link(tokens, index, options, env, renderer);
  };
  for (const [type, className] of Object.entries({ paragraph_open: "paragraph", heading_open: "heading", table_open: "table", bullet_list_open: "list", ordered_list_open: "list" })) {
    md.renderer.rules[type] = (tokens, index, options, _env, renderer) => {
      tokens[index].attrJoin("class", className);
      return renderer.renderToken(tokens, index, options);
    };
  }
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (...args) => `<div class="code-block">${fence(...args)}</div>`;
  const code = md.renderer.rules.code_block!;
  md.renderer.rules.code_block = (...args) => `<div class="code-block">${code(...args)}</div>`;
  return md.render(source);
}
