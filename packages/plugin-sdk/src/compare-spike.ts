import { createDocument, insertParagraph, insertHeading, insertFigure, insertTable, bodyEndIndex, serialize, parse, getEditableDocument } from '@litzio/core';
import { createHash } from 'node:crypto';
/** Historical #1315 experiment: neutral authoring input, Core owns all document semantics. */
export function createComparisonDocument(blocks: Array<
  { kind: 'paragraph'; text: string } | { kind: 'heading'; text: string; level: number } |
  { kind: 'figure'; image: string; caption: string } | { kind: 'table'; rows: string[][] }
>) {
  let document = createDocument();
  for (const block of blocks) {
    const index = bodyEndIndex(document);
    if (block.kind === 'paragraph') document = insertParagraph(document, index, block.text);
    else if (block.kind === 'heading') document = insertHeading(document, index, block.level, block.text);
    else if (block.kind === 'figure') document = insertFigure(document, index, { imageUrl: block.image, imageAlt: '', caption: block.caption });
    else document = insertTable(document, index, block.rows);
  }
  const source = serialize(document), revision = createHash('sha256').update(source).digest('hex');
  const read = getEditableDocument(parse(source));
  return { source, revision, targets: read.blocks.map(block => ({ path: block.path, documentRevision: revision, documentHash: revision })) };
}
