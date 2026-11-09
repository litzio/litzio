import { LOCAL_HOST_ID } from "./host-locator.ts";
import { getHostClient } from "./host-client.ts";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import dollarmath from "markdown-it-dollarmath";
import katex from "katex";
import { figureMediaPath } from "../shared/figure-media-path.ts";

/** Display only. No Core admission, rewriting or serialization. Raw HTML stays text. */
export function renderPlainMarkdown(source: string, path: string, client = getHostClient(LOCAL_HOST_ID)): string {
  const md = markdownRenderer();
  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const src = token.attrGet("src") ?? "";
    const relative = figureMediaPath(src);
    if (relative !== undefined) {
      token.attrSet("src", client.url(`/document/${relative}?path=${encodeURIComponent(path)}`));
      if (client.crossOrigin) token.attrSet("crossorigin", client.crossOrigin);
    }
    else if (!/^https?:\/\//i.test(src)) return md.utils.escapeHtml(token.content);
    return image(tokens, index, options, env, renderer);
  };
  // Match native Read markup without admitting or rewriting the source document.
  for (const [type, className] of Object.entries({ blockquote_open: "quote" })) {
    const render = md.renderer.rules[type] ?? ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));
    md.renderer.rules[type] = (tokens, index, ...args) => {
      tokens[index].attrJoin("class", className);
      return render(tokens, index, ...args);
    };
  }
  md.renderer.rules.hr = () => '<div class="divider"><hr></div>\n';
  const tableOpen = md.renderer.rules.table_open!;
  md.renderer.rules.table_open = (...args) => `<div class="table-block"><div class="table-scroll">${tableOpen(...args)}`;
  md.renderer.rules.table_close = () => '</table></div></div>\n';
  const math = md.renderer.rules.math_block!;
  md.renderer.rules.math_block = (...args) => `<div class="equation"><div class="equation-math">${math(...args)}</div></div>`;
  return md.render(source);
}

/** Assistant display has no document path or automatic image requests. */
export function renderAssistantMarkdown(source: string, scope: string): string {
  const md = markdownRenderer(true);
  md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(tokens[index].content);
  md.renderer.rules.footnote_anchor_name = (tokens, index) => `${scope}-${tokens[index].meta.id + 1}`;
  return md.render(source);
}

function markdownRenderer(assistant = false) {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  if (assistant) {
    md.use(texmath, { delimiters: "brackets", engine: katex });
    // Equation labels are outside assistant display; retain the dollar renderer below.
    md.block.ruler.disable("math_block_eqno");
  }
  md
    .use(footnote).use(taskLists).use(dollarmath, {
      allow_labels: false,
      renderer: (text: string, options: { displayMode: boolean }) => katex.renderToString(text, {
        displayMode: options.displayMode, throwOnError: false, trust: false, maxExpand: 1000,
      }),
    });
  if (assistant) {
    const blockMath = md.renderer.rules.math_block!;
    md.renderer.rules.math_block = (tokens, index, ...args) => {
      // texmath puts an unlabelled block body in info; dollarmath treats info as an ID.
      if (tokens[index].tag === "\\[") tokens[index].info = "";
      return blockMath(tokens, index, ...args);
    };
  }
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
  md.renderer.rules.fence = (...args) => `<div class="code-block">${assistant ? "" : '<div class="code-block-controls"></div>'}${fence(...args)}</div>`;
  const code = md.renderer.rules.code_block!;
  md.renderer.rules.code_block = (...args) => `<div class="code-block">${assistant ? "" : '<div class="code-block-controls"></div>'}${code(...args)}</div>`;
  return md;
}
