import { DocumentDiagnosticError } from "../write-error.ts";
import { figureCaptionContent, type FigureContent } from "../figure.ts";
import { sameInlineContent } from "../inline.ts";
import { supportedFigureContent } from "./figure.ts";
import { bodyIndex, completeFootnotes } from "./footnote.ts";
import { repeatRoundTrip, roundTripFor } from "./serialize.ts";
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
  const result = roundTripFor(complete, failure);
  const { markdown, reparsed } = result;
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
  if (repeatRoundTrip(result).markdown !== markdown) {
    throw new DocumentDiagnosticError("round-trip-mismatch", "Figure is not canonical after round-trip");
  }
}
