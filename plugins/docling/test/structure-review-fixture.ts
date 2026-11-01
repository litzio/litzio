import type { ReviewSuggestion } from "../src/structure-review.ts";

/** Three supported structural errors, deliberately synthetic rather than extracted PDF data. */
export function structureReviewSource() {
  const ref = ($ref: string) => ({ $ref });
  const texts = ["Chapter", "Subsection", "A paragraph split", "across pages.", "Synthetic Journal 2026", "Ordinary body text"].map((text, i) => ({
    self_ref: `#/texts/${i}`, parent: ref("#/body"), children: [], label: i < 2 ? "section_header" : "text",
    text, orig: text, content_layer: "body", ...(i < 2 ? { level: 1 } : {}),
    prov: [{ page_no: i < 3 ? 1 : 2, bbox: { l: 1, t: 1, r: 90, b: 10, coord_origin: "TOPLEFT" }, charspan: [0, [...text].length] }],
  }));
  return JSON.stringify({ schema_name: "DoclingDocument", version: "1.10.0", name: "Synthetic structure review",
    origin: { mimetype: "application/pdf", binary_hash: 0, filename: "synthetic.pdf" },
    body: { self_ref: "#/body", children: texts.map(x => ref(x.self_ref)) }, texts,
    pages: { "1": { page_no: 1, size: { width: 100, height: 100 } }, "2": { page_no: 2, size: { width: 100, height: 100 } } },
  }, null, 2) + "\n";
}
export const structureReviewSuggestions: ReviewSuggestion[] = [
  { self_ref: "#/texts/1", operation: "heading", value: { level: 2 }, reason: "Subsection belongs below Chapter", evidence: [{ page: 1, text: "Subsection" }] },
  { self_ref: "#/texts/2", operation: "merge-paragraphs", value: { next: "#/texts/3" }, reason: "Sentence continues on the next page", evidence: [{ page: 1, text: "A paragraph split" }, { page: 2, text: "across pages." }] },
  { self_ref: "#/texts/4", operation: "furniture", value: { label: "page_header" }, reason: "Running journal header", evidence: [{ page: 2, text: "Synthetic Journal 2026" }] },
];
