import { reconcileEndnotes, validateStructure, serialize, sectionRange, sectionMarker, targetNumbers, blockTargets, headingNumbers, sectionReferenceText, captionNumberText, referenceNumberText, type Document, type EditableDocument, type EditableBlock, type NumberedKind } from "./index.ts";

type Change = (document: Document) => Document;

export function serializeChange(document: Document, change: Change): string {
  const changed = reconcileEndnotes(document, change(document));
  validateStructure(changed);
  return serialize(changed);
}

type MachineNode = {
  path: number[];
  type: string;
  editable?: boolean;
  text?: string;
  [key: string]: unknown;
};

/** Convert Core's displayed section offsets to snapshot locators used by CLI operations. */
export function snapshotSection(document: EditableDocument, index: number) {
  const range = sectionRange(document.blocks.map(sectionMarker), index);
  return { start: document.blocks[range.start].path[0],
    end: document.blocks[range.end]?.path[0] ?? (document.blocks.at(-1)?.path[0] ?? 0) + 1 };
}

export function machineNodes(document: EditableDocument): MachineNode[] {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  const headings = headingNumbers(document.blocks, document.headingNumbering);
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = machineBlock(block);
    return [{
      ...first,
      ...("enumerator" in block && block.enumerator !== undefined ? { enumerator: block.enumerator } : {}),
      ...(block.block === "heading" ? { referenceText: sectionReferenceText(block.text, headings[index]) } : {}),
      ...(headings[index] ? { headingNumber: headings[index] } : {}),
      ...(typeof markers[index] === "number" ? { section: snapshotSection(document, index) } : {}),
      ...(Object.keys(numbers[index]).length > 0 ? { numbers: numbers[index] } : {}),
      ...((block.block === "figure" || block.block === "table") && numbers[index][block.block] !== undefined
        ? { captionNumberText: captionNumberText(block.block, numbers[index][block.block]!, document.referenceTemplates) } : {}),
      ...("label" in block && block.label && numbers[index][block.block as NumberedKind] !== undefined
        ? { referenceText: referenceNumberText(block.block as NumberedKind, numbers[index][block.block as NumberedKind]!, document.referenceTemplates) } : {}),

    }, ...rest];
  });
}

function machineBlock(block: EditableBlock): MachineNode[] {
  const base = { path: [...block.path], type: block.block };
  if (block.block === "heading") {
    return [{ ...base, level: block.level, editable: block.editable, text: block.text, content: block.content }];
  }
  if (block.block === "paragraph") {
    return [{ ...base, editable: block.editable, text: block.text, content: block.content }];
  }
  if (block.block === "admonition") {
    return [{ ...base, variant: block.variant, text: block.text, content: block.content }];
  }
  if (block.block === "figure") {
    return [
      {
        ...base,
        editable: block.editable,
        label: block.label,
        contentKind: block.contentKind,
        ...(block.mermaidSource !== undefined ? { mermaidSource: block.mermaidSource } : {}),
        imageUrl: block.imageUrl,
        imageAlt: block.imageAlt,
      },
      {
        path: [...block.caption.path],
        type: "caption",
        editable: block.caption.editable,
        text: block.caption.text,
        content: block.caption.content,
      },
    ];
  }
  if (block.block === "equation") {
    return [{ ...base, label: block.label, latex: block.latex }];
  }
  if (block.block === "table") {
    return [
      { ...base, ...(block.label ? { label: block.label } : {}), ...(block.caption ? { caption: block.caption } : {}) },
      ...block.rows.flatMap((row) =>
        row.cells.map((cell) => ({
          path: [...cell.path],
          type: "cell",
          header: cell.header,
          editable: cell.editable,
          text: cell.text,
          content: cell.content,
        })),
      ),
    ];
  }
  if (block.block === "quote") {
    return [{ ...base, editable: block.editable, text: block.text, content: block.content }];
  }
  if (block.block === "footnote") {
    return [{ ...base, label: block.label, editable: block.editable, text: block.text, content: block.content }];
  }
  if (block.block === "divider") {
    return [base];
  }
  if (block.block === "code") {
    return [{ ...base, language: block.language, code: block.code }];
  }
  if (block.block === "target") {
    return [{ ...base, label: block.label }];
  }
  if (block.block === "list") {
    return [{ ...base, ordered: block.ordered, ...(block.ordered ? { start: block.start, style: block.style ?? "decimal", delimiter: block.delimiter ?? "." } : {}), items: block.items }];
  }
  throw new Error("Unknown native block");
}
