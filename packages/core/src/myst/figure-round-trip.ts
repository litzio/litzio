import { DocumentDiagnosticError } from "../write-error.ts";
import { figureCaptionContent, type FigureContent } from "../figure.ts";
import { sameInlineContent } from "../inline.ts";
import { supportedFigureContent } from "./figure.ts";
import { bodyIndex, completeFootnotes } from "./footnote.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";

/** Fail closed unless the top-level Figure keeps its properties and label through canonical Markdown. */
export function assertFigureRoundTrip(
  root: MystNode,
  index: number,
  figure: FigureContent,
  label: unknown,
  identifier: unknown,
): void {
  const failure = "Figure cannot be preserved through canonical round-trip";
  const document = { type: "root", children: root.children ?? [] };
  // A caption may introduce an endnote before the session supplies its definition.
  const complete = completeFootnotes(document);
  const markdown = serializeFor(complete, failure);
  const reparsed = parse(markdown);
  const node = reparsed.children[bodyIndex(document, index)];
  const content = node && supportedFigureContent(node);
  if (
    reparsed.children.length !== complete.children.length ||
    !content ||
    content.imageUrl !== figure.imageUrl ||
    content.imageAlt !== figure.imageAlt ||
    content.mermaidSource !== figure.mermaidSource ||
    !sameInlineContent(figureCaptionContent(content.caption), figureCaptionContent(figure.caption)) ||
    node.label !== label ||
    node.identifier !== identifier
  ) {
    throw new DocumentDiagnosticError("round-trip-mismatch", failure);
  }
  if (serialize(reparsed) !== markdown) {
    throw new DocumentDiagnosticError("round-trip-mismatch", "Figure is not canonical after round-trip");
  }
}
