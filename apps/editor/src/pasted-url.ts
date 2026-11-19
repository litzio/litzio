import { find } from "linkifyjs";

/** The Link extension's own judgement of a found URL (`shouldAutoLink`), so pasted URLs link as typed ones would. */
export type AutoLink = (value: string) => boolean;

// Pasted content keeps only these link targets (External clipboard contract).
const ORDINARY = /^(https?|mailto|tel|ftp):/i;

type FoundUrl = { start: number; end: number; href: string };

/** URLs in plain text as the Link extension finds them (linkify, http by default). */
export function urlsIn(text: string, autoLink: AutoLink): FoundUrl[] {
  return find(text, { defaultProtocol: "http" })
    .filter(item => item.isLink && ORDINARY.test(item.href) && autoLink(item.value))
    .map(item => ({ start: item.start, end: item.end, href: item.href }));
}

/** The link target when the whole pasted text is one URL without spaces. */
export function pastedUrl(text: string, autoLink: AutoLink): string | undefined {
  const value = text.trim();
  if (!value || /\s/.test(value)) return undefined;
  const [url] = urlsIn(value, autoLink);
  return url && url.start === 0 && url.end === value.length ? url.href : undefined;
}

/** Link the URLs in an HTML body's text, outside existing links and code; existing links stay as written. */
export function linkUrlsInText(body: HTMLElement, autoLink: AutoLink): void {
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest("a,code,pre")) texts.push(node as Text);
  }
  for (const text of texts) {
    const value = text.data;
    const urls = urlsIn(value, autoLink);
    if (!urls.length) continue;
    const parts: Node[] = [];
    let at = 0;
    for (const url of urls) {
      if (url.start > at) parts.push(body.ownerDocument.createTextNode(value.slice(at, url.start)));
      const link = body.ownerDocument.createElement("a");
      link.setAttribute("href", url.href);
      link.textContent = value.slice(url.start, url.end);
      parts.push(link);
      at = url.end;
    }
    if (at < value.length) parts.push(body.ownerDocument.createTextNode(value.slice(at)));
    text.replaceWith(...parts);
  }
}
