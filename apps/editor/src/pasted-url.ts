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
 * Link the URLs in pasted content's own text: never the document around the paste, never text
 * that already has a link or code mark, and never text in a code block. Within one textblock
 * the adjacent text nodes are read together, so a URL that formatting splits
 * (`<strong>https://</strong>example.com`) links whole, keeping its formatting. Every paste
 * path finds URLs with `urlsIn`, so plain text, Markdown and external HTML link alike.
 */
export function linkUrlsInNodes(nodes: readonly PMNode[], link: MarkType, autoLink: AutoLink, linkable = true): readonly PMNode[] {
  const result: PMNode[] = [];
  let run: PMNode[] = [];
  const flush = () => { result.push(...linkedRun(run, link, autoLink)); run = []; };
  for (const node of nodes) {
    if (node.isText && linkable && !node.marks.some(mark => mark.type === link || mark.type.spec.code)) { run.push(node); continue; }
    flush();
    result.push(node.isText || node.isLeaf || node.type.spec.code ? node
      : node.copy(Fragment.fromArray(linkUrlsInNodes(node.content.content, link, autoLink, node.type.allowsMarkType(link)))));
  }
  flush();
  return Fragment.fromArray(result).content;
}

/** Adjacent linkable text nodes, cut where a URL found in their joined text starts or ends. */
function linkedRun(run: readonly PMNode[], link: MarkType, autoLink: AutoLink): PMNode[] {
  if (!run.length) return [];
  const urls = urlsIn(run.map(node => node.text!).join(""), autoLink);
  if (!urls.length) return [...run];
  const parts: PMNode[] = [];
  let offset = 0;
  for (const node of run) {
    const end = offset + node.text!.length;
    const cuts = new Set([offset, end]);
    for (const url of urls) {
      if (url.start > offset && url.start < end) cuts.add(url.start);
      if (url.end > offset && url.end < end) cuts.add(url.end);
    }
    const points = [...cuts].sort((left, right) => left - right);
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index]!, to = points[index + 1]!;
      const piece = node.cut(from - offset, to - offset);
      const url = urls.find(found => found.start <= from && found.end >= to);
      parts.push(url ? piece.mark(link.create({ href: url.href }).addToSet(piece.marks)) : piece);
    }
    offset = end;
  }
  return parts;
}
