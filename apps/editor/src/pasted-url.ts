import { Fragment, type MarkType, type Node as PMNode } from "@tiptap/pm/model";
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

/**
 * Link the URLs in pasted content's own text nodes: never the document around the paste, never
 * text that already has a link or code mark, and never text in a code block. Every paste path
 * finds URLs with `urlsIn`, so plain text, Markdown and external HTML link alike.
 */
export function linkUrlsInNodes(nodes: readonly PMNode[], link: MarkType, autoLink: AutoLink, linkable = true): readonly PMNode[] {
  return Fragment.fromArray(nodes.flatMap(node => {
    if (node.isText) return linkable ? linkedText(node, link, autoLink) : [node];
    if (node.isLeaf || node.type.spec.code) return [node];
    return [node.copy(Fragment.fromArray(linkUrlsInNodes(node.content.content, link, autoLink, node.type.allowsMarkType(link))))];
  })).content;
}

function linkedText(node: PMNode, link: MarkType, autoLink: AutoLink): PMNode[] {
  if (node.marks.some(mark => mark.type === link || mark.type.spec.code)) return [node];
  const text = node.text!, parts: PMNode[] = [];
  let at = 0;
  for (const url of urlsIn(text, autoLink)) {
    if (url.start > at) parts.push(node.cut(at, url.start));
    parts.push(node.cut(url.start, url.end).mark(link.create({ href: url.href }).addToSet(node.marks)));
    at = url.end;
  }
  if (at < text.length) parts.push(at ? node.cut(at) : node);
  return parts;
}
