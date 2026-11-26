import type { HostClient } from "./host-client.ts";
import { createAssetHost } from "./image-assets.ts";
import type { UiMessage } from "./ui-message.ts";
import { i18n } from "./i18n.ts";
import { allocateBlockPath } from "./block-locators.ts";
import { Extension, Node, type Attribute, type Editor, type Extensions, type NodeViewRenderer } from "@tiptap/core";
import { EDITOR_SHORTCUTS } from "./shortcuts.ts";
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { codeHighlightingPlugin, lowlight } from "./code-highlight.ts";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { documentInteraction } from "./document-interaction.ts";
import { imageAssets } from "./image-assets.ts";
import { ImageRenames } from "./image-rename.ts";
import { MarkdownInputRules } from "./markdown-input-rules.ts";
import StarterKit from "@tiptap/starter-kit";
import { headingNumbers, type HeadingNumbering } from "@litzio/core/numbering";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { applyNumberColumns, numberColumnsKey, numberFont, onFontsLoaded, type NumberedHeading } from "./heading-number-columns.ts";
import { CrossReference } from "./cross-reference.tsx";
import { Endnotes } from "./endnotes.ts";
import { FootnoteReference } from "./footnote.tsx";
import { Citation } from "./citation.tsx";
import { snapshotBlocksByPath } from "./tiptap-edits.ts";
import { editorKeepsEndnoteReferences, LOCKED_ENDNOTES_REJECTION } from "./structure-lock.ts";
import { documentViewBaseline, isDocumentViewChange } from "./document-view-change.ts";
import {
  DELETED_PATHS_ATTR,
  isNewBlockPath,
  isSupportedDocumentChange,
  normalizeEngineDocument,
  TABLE_CELL_SOURCE_ATTR,
  type TiptapJSON,
} from "./tiptap-document.ts";
import { TableCellFocus } from "./table-tools.tsx";
import { AdmonitionView } from "./node-views/admonition-view.tsx";
import { CodeBlockView } from "./node-views/code-block-view.tsx";
import { createEquationNodeView } from "./node-views/equation-view.tsx";
import { createFigureNodeView, FigureView, resolveFigureSource, type FigureValidator, type ImageChooser } from "./node-views/figure-view.tsx";
import { FootnoteDefinitionView } from "./node-views/footnote-definition-view.tsx";
import { InlineMathView } from "./node-views/inline-math-view.tsx";
import { LabelTargetView } from "./node-views/label-target-view.tsx";
import { TableCaptionView, TableView } from "./node-views/table-view.tsx";
import { EDIT_PROPERTIES, type DraftListener } from "./node-views/shared.ts";
import { tableRows } from "./table-structure.ts";

export type { DraftKind } from "./node-views/shared.ts";
export { captionPlaceholderVisible } from "./node-views/shared.ts";
export { isUnappliedEquationDraft } from "./node-views/equation-view.tsx";
export { DocumentPathContext, isUnappliedFigureDraft, resolveFigureSource } from "./node-views/figure-view.tsx";
export type { FigureValidator, ImageChoice, ImageChooser } from "./node-views/figure-view.tsx";

/** Route selected-node Enter to its mounted form, before the prose Enter keymaps. */
const PropertyEntry = Extension.create({
  name: "propertyEntry",
  priority: 130,
  addKeyboardShortcuts() {
    return { Enter: () => {
      const { view, state } = this.editor;
      const { selection } = state;
      if (!this.editor.isEditable || view.composing || !(selection instanceof NodeSelection) ||
          !["figure", "table", "equation", "inlineMath"].includes(selection.node.type.name)) return false;
      const dom = view.nodeDOM(selection.from);
      const wrapper = dom instanceof HTMLElement ? dom.querySelector("[data-node-view-wrapper]") : null;
      return wrapper ? !wrapper.dispatchEvent(new Event(EDIT_PROPERTIES, { cancelable: true })) : false;
    } };
  },
});

const hiddenAttr = (defaultValue: string | number | boolean = ""): Attribute => ({
  default: defaultValue,
  rendered: false,
});

function headingTag(level: unknown): "h1" | "h2" | "h3" | "h4" | "h5" | "h6" {
  switch (Number(level)) {
    case 2:
      return "h2";
    case 3:
      return "h3";
    case 4:
      return "h4";
    case 5:
      return "h5";
    case 6:
      return "h6";
    default:
      return "h1";
  }
}

function blockAttrs(attrs: Record<string, Attribute>): Record<string, Attribute> {
  return { sourcePath: hiddenAttr(""), ...attrs };
}

// A heading holds the paragraph's inline content except line breaks, which Markdown headings cannot.
const SourcedHeading = Node.create({
  name: "heading",
  group: "block",
  content: "(text | inlineMath | crossReference | footnoteReference | citation)*",
  defining: true,
  addAttributes() {
    return blockAttrs({ level: hiddenAttr(1) });
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      headingTag(node.attrs.level),
      {
        ...HTMLAttributes,
        class: "heading",
        "data-block": "heading",
        "data-source-path": String(node.attrs.sourcePath ?? ""),
      },
      0,
    ];
  },
});

const SourcedParagraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "p",
      {
        ...HTMLAttributes,
        class: "paragraph",
        "data-block": "paragraph",
        "data-source-path": String(node.attrs.sourcePath ?? ""),
      },
      0,
    ];
  },
});

// List v1: a top-level list carries its snapshot locator; each item holds one paragraph,
// optionally followed by one nested list. Enter, Tab/Shift-Tab and Backspace edit items.
// Backspace at the start of a paragraph after a list joins it into the last item (ParagraphMerge).
// List input shortcuts (`- `, `1. `) are MarkdownInputRules, not Tiptap's list rules.
// A checklist is Tiptap's task list: its items keep their check state as the `checked` attribute.
const listHTML = { class: "list", "data-block": "list" };
const NESTED_LISTS = "(bulletList | orderedList | taskList)?";
export const LIST_TYPES = ["bulletList", "orderedList", "taskList"];

const SourcedBulletList = BulletList.extend({
  addAttributes() {
    return blockAttrs({});
  },
  addInputRules() {
    return [];
  },
}).configure({ HTMLAttributes: listHTML });

const SourcedOrderedList = OrderedList.extend({
  addAttributes() {
    return blockAttrs({
      start: {
        default: 1,
        parseHTML: (element) => element.hasAttribute("start") ? Number.parseInt(element.getAttribute("start") ?? "", 10) : 1,
      },
      style: {
        default: "decimal",
        parseHTML: element => element.getAttribute("data-list-style") ?? "decimal",
        renderHTML: attributes => ({ "data-list-style": attributes.style }),
      },
      delimiter: {
        default: ".",
        parseHTML: element => element.getAttribute("data-list-delimiter") ?? ".",
        renderHTML: attributes => ({ "data-list-delimiter": attributes.delimiter }),
      },
    });
  },
  addInputRules() {
    return [];
  },
}).configure({ HTMLAttributes: listHTML });

const SimpleListItem = ListItem.extend({
  content: `paragraph ${NESTED_LISTS}`,
});

const SourcedTaskList = TaskList.extend({
  addAttributes() {
    return blockAttrs({});
  },
}).configure({ HTMLAttributes: listHTML });

// Tiptap's checkbox node view: a click changes `checked` only while the editor is editable.
const SimpleTaskItem = TaskItem.extend({
  content: `paragraph ${NESTED_LISTS}`,
  addInputRules() {
    return [];
  },
  addNodeView() {
    const render = this.parent!()!;
    return props => {
      const view = render(props);
      // A check is its own Undo step, also right after typing: close history before and after it.
      const close = () => { if (props.editor.isEditable) props.editor.view.dispatch(closeHistory(props.editor.state.tr)); };
      view.dom.addEventListener("change", close, true);
      view.dom.addEventListener("change", close);
      return view;
    };
  },
}).configure({
  nested: true,
  a11y: { checkboxLabel: node => node.textContent || i18n.t("Empty checklist item") },
});

/** Mod-Enter checks or unchecks the checklist item holding the caret (its own text, not a nested list's). */
const ChecklistToggle = Extension.create({
  name: "checklistToggle",
  // Ahead of ParagraphHardBreak, which keeps Mod-Enter everywhere else.
  priority: 120,
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => {
        const { $from } = this.editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === "listItem") return false;
          if (node.type.name !== "taskItem") continue;
          if (!this.editor.isEditable) return true;
          // Its own Undo step, as a click is: close history before the check and again after it.
          this.editor.view.dispatch(closeHistory(this.editor.state.tr).setNodeMarkup($from.before(depth), undefined, { ...node.attrs, checked: !node.attrs.checked }));
          this.editor.view.dispatch(closeHistory(this.editor.state.tr));
          return true;
        }
        return false;
      },
    };
  },
});

// Decorations are view-only: guidance cannot enter copied or saved document content.
const EmptyElementGuidance = Extension.create({
  name: "emptyElementGuidance",
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos, parent) => {
            if (node.content.size !== 0) return;
            const prompt = node.type.name === "quote" ? i18n.t("Enter a quote")
              : node.type.name === "paragraph" && (parent?.type.name === "listItem" || parent?.type.name === "taskItem") ? i18n.t("Enter a list item") : undefined;
            if (prompt) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-empty-prompt": prompt }));
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      view(view) {
        const refresh = () => view.dispatch(view.state.tr.setMeta("addToHistory", false));
        i18n.on("languageChanged", refresh);
        return { destroy() { i18n.off("languageChanged", refresh); } };
      },
    })];
  },
});

// Code block v1: a language and literal code. Enter and Tab insert text; three Enters or
// ArrowDown at the end leave the block. The ``` input shortcut is a MarkdownInputRule.
// Syntax highlighting is display-only: lowlight decorations never enter the document or
// the saved Markdown. An empty or unregistered language shows plain code.

const SourcedCodeBlock = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    const plugins = this.parent!();
    return [...plugins.slice(0, -1), codeHighlightingPlugin(plugins.at(-1)!)];
  },
  addAttributes() {
    return blockAttrs({ language: { default: "", rendered: false } });
  },
  addInputRules() {
    return [];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  // Stock lowlight auto-detects unknown languages; Litzio's fallback is literal plain code.
  lowlight: { ...lowlight, highlightAuto: () => ({ children: [] }) },
  defaultLanguage: null, enableTabIndentation: true, tabSize: 4,
});

// Inline code is literal text that may sit inside bold, italic or a link, as in Markdown.
const InlineCode = Code.extend({
  excludes: "",
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
});

// Subscript and superscript replace each other, as Core never nests them (Mod-, and Mod-.).
const SubscriptMark = Subscript.extend({ excludes: "subscript superscript" });
const SuperscriptMark = Superscript.extend({ excludes: "subscript superscript" });

const Admonition = Node.create({
  name: "admonition",
  group: "block",
  isolating: true,
  defining: true,
  content: "inline*",
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ variant: hiddenAttr("note") });
  },
  parseHTML() {
    return [{ tag: "aside[data-admonition]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", { ...HTMLAttributes, "data-admonition": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AdmonitionView);
  },
});

// Quote v1: one paragraph of inline content, edited like a simple admonition body. Enter leaves
// the quote; Shift+Enter is a line break. Native admission rejects other quotes.
const Quote = Node.create({
  name: "quote",
  group: "block",
  content: "inline*",
  isolating: true,
  defining: true,
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "blockquote[data-quote]", contentElement: "p" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["blockquote", {
      ...HTMLAttributes,
      class: "quote",
      "data-block": "quote",
      "data-quote": "",
      "data-source-path": String(node.attrs.sourcePath ?? ""),
    }, ["p", { class: "quote-body" }, 0]];
  },
});

// Footnotes v2: a definition holding one paragraph of inline content, edited like a quote. It
// holds no footnote references; native admission rejects other definitions.
const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference | citation)*",
  isolating: true,
  defining: true,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "div[data-footnote-definition]", contentElement: "p" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-footnote-definition": "" }, ["p", 0]];
  },
  addNodeView() {
    // NodeView-only marker: CSS can recognize adjacent definitions without changing the schema.
    return ReactNodeViewRenderer(FootnoteDefinitionView, { attrs: { "data-footnote-definition": "true" } });
  },
});

/** A Markdown thematic break. */
const Divider = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "div[data-divider]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", {
      ...HTMLAttributes,
      class: "divider",
      "data-block": "divider",
      "data-divider": "",
      "data-source-path": String(node.attrs.sourcePath ?? ""),
    }, ["hr"]];
  },
});

function captionNodeView(renderer: NodeViewRenderer): NodeViewRenderer {
  return props => {
    const nodeView = renderer(props);
    const ignoreMutation = nodeView.ignoreMutation?.bind(nodeView);
    nodeView.ignoreMutation = mutation => {
      // Chromium can remove the whole contentDOM when cancelling composition. Tiptap
      // ignores that parent mutation; ProseMirror must read it and rebuild the lost DOM.
      if (mutation.type === "childList" && nodeView.contentDOM &&
          !nodeView.dom.contains(nodeView.contentDOM)) return false;
      return ignoreMutation?.(mutation) ?? false;
    };
    return nodeView;
  };
}

const Figure = Node.create<{ documentPath?: string | (() => string) }>({
  name: "figure",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference | footnoteReference | citation)*",
  isolating: true,
  selectable: true,
  draggable: false,
  addOptions() { return { documentPath: undefined }; },
  addAttributes() {
    return blockAttrs({
      label: hiddenAttr(""),
      imageUrl: hiddenAttr(""),
      enumerator: { default: null, rendered: false }, enumerated: { default: null, rendered: false },
      imageIdentity: hiddenAttr(""),
      imageAlt: hiddenAttr(""),
      mermaidSource: { default: null, rendered: false },
    });
  },
  parseHTML() {
    return [{ tag: "figure[data-figure]", contentElement: "figcaption" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const src = resolveFigureSource(node.attrs.imageUrl, this.options.documentPath);
    return ["figure", { ...HTMLAttributes, "data-figure": "" },
      ...(src ? [["img", { src, alt: node.attrs.imageAlt }]] : []), ["figcaption", 0]];
  },
  addNodeView() {
    return captionNodeView(ReactNodeViewRenderer(FigureView));
  },
});

const Equation = Node.create({
  name: "equation",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ latex: hiddenAttr(""), label: hiddenAttr(""), enumerator: { default: null, rendered: false } });
  },
  parseHTML() {
    return [{ tag: "div[data-equation]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-equation": "" }];
  },
});

function equationNode(onDraftChange?: DraftListener) {
  return Equation.extend({
    addNodeView() {
      return ReactNodeViewRenderer(createEquationNodeView(onDraftChange));
    },
  });
}

function figureNode(documentPath?: string | (() => string), onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
  return Figure.configure({ documentPath }).extend({
    addNodeView() {
      return captionNodeView(ReactNodeViewRenderer(createFigureNodeView(documentPath, onDraftChange, validateFigure, chooseImage)));
    },
  });
}

// A Markdown table lives in the single document state: editable cells hold supported
// inline content including hard breaks; native admission rejects other cells. Commands add, remove and
// move whole rows (below the header row) and columns, and set column alignment; snapshot cells
// carry their opening position. The structure guard rejects any other change to the grid.
const headerAttr: Attribute = { default: false, rendered: false, parseHTML: (element) => element.tagName === "TH" };

// The table block is the document block (path, label, number, block tools, move and delete). Its
// grid holds only rows, in the prosemirror-tables roles, so TableMap reads it; the caption and
// notes follow the grid as its siblings.
const TABLE_ROLES: Record<string, string> = { tableGrid: "table", tableRow: "row", tableCell: "cell" };

const Table = Node.create({
  name: "table",
  allowGapCursor: false,
  group: "block",
  content: "tableGrid tableCaption tableNotes?",
  isolating: true,
  selectable: true,
  draggable: false,
  extendNodeSchema(extension) {
    return TABLE_ROLES[extension.name] ? { tableRole: TABLE_ROLES[extension.name] } : {};
  },
  addAttributes() {
    return blockAttrs({ label: hiddenAttr(""), enumerator: { default: null, rendered: false }, enumerated: { default: null, rendered: false } });
  },
  parseHTML() {
    return [{ tag: "div[data-table-block]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "table-block", "data-block": "table",
      "data-table-block": "", "data-source-path": String(node.attrs.sourcePath ?? "") }, 0];
  },
});

const TableGrid = Node.create({
  name: "tableGrid",
  allowGapCursor: false,
  content: "tableRow+",
  isolating: true,
  selectable: false,
  draggable: false,
  parseHTML() { return [{ tag: "table" }]; },
  renderHTML() { return ["table", 0]; },
});

// The caption follows the grid; table caption layout keeps it below the grid, at the grid's width.
const TableCaption = Node.create({
  name: "tableCaption",
  content: "(text | inlineMath | crossReference | footnoteReference | citation)*",
  isolating: true,
  selectable: false,
  parseHTML() { return [{ tag: "div[data-table-caption]" }]; },
  renderHTML() { return ["div", { class: "caption table-caption", "data-table-caption": "" }, 0]; },
  addNodeView() {
    return captionNodeView(ReactNodeViewRenderer(TableCaptionView, { as: "div", className: "table-caption", contentDOMElementTag: "span" }));
  },
});

const TableNotes = Node.create({
  name: "tableNotes",
  content: "tableNote+",
  parseHTML() {
    return [{ tag: "div[data-table-notes]" }];
  },
  renderHTML() {
    return ["div", { "data-table-notes": "", "aria-label": i18n.t("Table notes") }, 0];
  },
});

const TableNote = Node.create({
  name: "tableNote",
  content: "(text | hardBreak | inlineMath | crossReference | citation)*",
  isolating: true,
  selectable: false,
  parseHTML() { return [{ tag: "p[data-table-note]" }]; },
  renderHTML() { return ["p", { "data-table-note": "", "aria-label": i18n.t("Table note") }, 0]; },
});

function tableNode(onDraftChange?: DraftListener) {
  return Table.extend({
    addNodeView() { return ReactNodeViewRenderer(props => <TableView {...props} onDraftChange={onDraftChange} />, { contentDOMElementTag: "div" }); },
  });
}

function cellAlignmentStyle(node: ProseMirrorNode): string {
  return ["left", "center", "right"].includes(node.attrs.align) ? `text-align: ${node.attrs.align}` : "";
}

const TableRow = Node.create({
  name: "tableRow",
  allowGapCursor: false,
  content: "tableCell+",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML() {
    return ["tr", 0];
  },
});

// Cells hold inline content, including hard breaks. Every cell spans one row and one column; the
// span attributes exist for TableMap and are never read from pasted HTML.
const TableCell = Node.create({
  name: "tableCell",
  content: "(text | hardBreak | inlineMath | crossReference | footnoteReference | citation)*",
  isolating: true,
  addAttributes() {
    return { header: headerAttr, align: hiddenAttr(""), [TABLE_CELL_SOURCE_ATTR]: { default: "", rendered: false },
      colspan: { default: 1, rendered: false, parseHTML: () => 1 }, rowspan: { default: 1, rendered: false, parseHTML: () => 1 },
      colwidth: { default: null, rendered: false, parseHTML: () => null } };
  },
  parseHTML() {
    return [{ tag: "th[data-table-cell]" }, { tag: "td[data-table-cell]" }];
  },
  renderHTML({ node }) {
    return [node.attrs.header ? "th" : "td", { "data-table-cell": "", style: cellAlignmentStyle(node) }, 0];
  },
});

// A `(label)=` section label: it names the heading after it for {ref} references.
const LabelTarget = Node.create<{ onDraftChange?: DraftListener }>({
  addOptions() { return {}; },
  name: "labelTarget",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "p[data-label-target]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["p", { ...HTMLAttributes, "data-label-target": "", "data-source-path": String(node.attrs.sourcePath ?? "") }, `Section label · ${String(node.attrs.label ?? "")}`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LabelTargetView);
  },
});

const InlineMath = Node.create<{ onDraftChange?: DraftListener }>({
  addOptions() { return {}; },
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-value") ?? "",
        renderHTML: (attributes) => ({ "data-value": String(attributes.value ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-inline-math": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, { as: "span" });
  },
});

// Tiptap's default hard-break command keeps marks for following text only.
// Preserve their coverage on the break itself as required by Core InlineContent.
const ParagraphHardBreak = Extension.create({
  name: "paragraphHardBreak",
  priority: 110,
  addKeyboardShortcuts() {
    const insert = (shift: boolean) => () => {
      const { state } = this.editor;
      if (!this.editor.isEditable || this.editor.view.composing) return false;
      const parent = state.selection.$from.parent;
      const editableInlineParent = parent.type.name === "paragraph" ||
        parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || parent.type.name === "admonition" ||
        (shift && (parent.type.name === "tableCell" || parent.type.name === "tableNote"));
      // A selected inline math node is not replaced by a break.
      if (!editableInlineParent || state.selection instanceof NodeSelection) return true;
      // A break ends inline code; code is text only.
      const marks = (state.storedMarks ?? state.selection.$from.marks()).filter(mark => mark.type.name !== "code");
      return this.editor.chain()
        .insertContent({ type: "hardBreak", marks: marks.map(mark => mark.toJSON()) })
        .command(({ tr }) => { tr.ensureMarks(marks); return true; })
        .run();
    };
    return { "Shift-Enter": insert(true), "Mod-Enter": insert(false) };
  },
});

const ParagraphSplit = Extension.create({
  name: "paragraphSplit",
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        // Paragraphs inside list items split as list items.
        if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== "paragraph" ||
            !selection.$from.sameParent(selection.$to)) return false;
        // Enter on a selected inline math node does not delete it.
        if (selection instanceof NodeSelection) return true;
        const sourcePath = selection.$from.parent.attrs.sourcePath;
        const start = selection.$from.before();
        return this.editor.chain().splitBlock().command(({ tr }) => {
          const right = tr.selection.$from.before();
          const rightNode = tr.doc.nodeAt(right);
          const rightSourcePath = rightNode?.content.size === 0
            ? allocateBlockPath("split")
            : sourcePath;
          const leftSourcePath = tr.doc.nodeAt(start)?.content.size === 0 && rightNode!.content.size > 0
            ? allocateBlockPath("split") : sourcePath;
          tr.setNodeMarkup(start, this.editor.schema.nodes.paragraph, { sourcePath: leftSourcePath });
          tr.setNodeMarkup(right, this.editor.schema.nodes.paragraph, { sourcePath: rightSourcePath });
          tr.setMeta("paragraphSplit", true);
          return true;
        }).run();
      },
    };
  },
});

const ParagraphMerge = Extension.create({
  name: "paragraphMerge",
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty || selection.$from.parentOffset !== 0) return false;
        if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== "paragraph") return false;
        const pos = selection.$from.before();
        const previous = state.doc.resolve(pos).nodeBefore;
        if (previous && LIST_TYPES.includes(previous.type.name)) {
          // List v1 items hold one paragraph, so the paragraph's text continues the visually
          // last item instead of becoming a new item (#1821). One replacement removes only the
          // boundary between the two text blocks, so the inline content and its atoms move as
          // they are (an empty paragraph just disappears). The join is its own Undo step:
          // history is closed before it and, by a step-less transaction, after it.
          let end = 0;
          previous.descendants((node, offset) => {
            if (node.isTextblock) end = pos - previous.nodeSize + 1 + offset + 1 + node.content.size;
            return !node.isTextblock;
          });
          const tr = closeHistory(state.tr).delete(end, pos + 1);
          this.editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)).scrollIntoView());
          this.editor.view.dispatch(closeHistory(this.editor.state.tr));
          return true;
        }
        if (previous?.type.name !== "paragraph") return false;
        // Snapshot provenance only: merge adjacent source groups, including any
        // unsaved split siblings. Nothing is persisted as an identity.
        const paths = [...new Set(`${previous.attrs.sourcePath};${selection.$from.parent.attrs.sourcePath}`.split(";"))];
        const tr = state.tr.join(pos);
        tr.doc.forEach((node, position) => {
          if (node.type.name === "paragraph" && String(node.attrs.sourcePath).split(";").some(path => paths.includes(path))) {
            tr.setNodeMarkup(position, undefined, { ...node.attrs, sourcePath: paths.join(";") });
          }
        });
        this.editor.view.dispatch(tr.setMeta("paragraphMerge", true).scrollIntoView());
        return true;
      },
    };
  },
});

export function editorExtensions(
  onDraftChange?: DraftListener,
  documentPath?: string | (() => string),
  validateFigure?: FigureValidator,
  hasActiveDraft?: (sourcePath?: string) => boolean,
  chooseImage?: ImageChooser,
): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      // The engine supplies cursor positions around atomic blocks.
      hardBreak: { keepMarks: true },
      heading: false,
      horizontalRule: false,
      // Ordinary Markdown links (href and optional title only). Links are created or
      // changed explicitly from the selection toolbar, never implicitly while typing.
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        HTMLAttributes: { target: null, rel: null, class: null },
      },
      listItem: false,
      listKeymap: false,
      orderedList: false,
      paragraph: false,
      trailingNode: false,
      underline: false,
    }),
    DocumentNumbering,
    PropertyEntry,
    ImageRenames,
    Endnotes.configure({ canOrder: () => !hasActiveDraft?.() }),
    TableCellFocus,
    ParagraphHardBreak,
    ParagraphSplit,
    ParagraphMerge,
    SourcedParagraph,
    SourcedHeading,
    SourcedCodeBlock,
    InlineCode,
    SubscriptMark,
    SuperscriptMark,
    SourcedBulletList,
    SourcedOrderedList,
    SimpleListItem,
    SourcedTaskList,
    SimpleTaskItem,
    ChecklistToggle,
    ListKeymap,
    Admonition,
    Quote,
    FootnoteDefinition,
    Divider,
    figureNode(documentPath, onDraftChange, validateFigure, chooseImage),
    equationNode(onDraftChange),
    tableNode(onDraftChange),
    TableGrid,
    TableRow,
    TableCaption,
    TableNotes,
    TableNote,
    TableCell,
    LabelTarget.configure({ onDraftChange }),
    InlineMath.configure({ onDraftChange }),
    CrossReference.configure({ onDraftChange }),
    FootnoteReference,
    Citation,
    MarkdownInputRules,
    EmptyElementGuidance,
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON,
  onReject: (reason?: UiMessage) => void,
  onDraftChange?: DraftListener,
  documentPath?: string | (() => string),
  validateFigure?: FigureValidator,
  onAssetPendingChange?: (active: boolean) => void,
  onAssetError?: (reason: string) => void,
  hasActiveDraft?: (sourcePath?: string) => boolean,
  chooseImage?: ImageChooser,
  initialDeletedPaths: readonly string[] = [],
  onAssetChange?: (path: string) => void,
  client?: HostClient,
  onInlineMathShortcut?: (editor: Editor) => boolean,
  lockStructure = false,
): Extensions {
  return [...editorExtensions(onDraftChange, documentPath, validateFigure, hasActiveDraft, chooseImage),
    Extension.create({
      name: "inlineMathShortcut",
      addKeyboardShortcuts: () => ({
        [EDITOR_SHORTCUTS.inlineMath.binding]: ({ editor }) => onInlineMathShortcut?.(editor) ?? false,
      }),
    }),
    ...(documentPath ? [imageAssets({ host: client && createAssetHost(client), documentPath, reject: onAssetError ?? onReject, pending: onAssetPendingChange, changed: onAssetChange, hasActiveDraft })] : []),
    documentInteraction(onReject), structureGuard(baseline, onReject, initialDeletedPaths, lockStructure)];
}

function structureGuard(baseline: TiptapJSON, onReject: (reason?: UiMessage) => void, initialDeletedPaths: readonly string[], lockStructure: boolean): Extension {
  return Extension.create({
    name: "structureGuard",
    addProseMirrorPlugins() {
      return [structureGuardPlugin(baseline, onReject, initialDeletedPaths, lockStructure)];
    },
  });
}

const structureGuardKey = new PluginKey<string[]>("structureGuard");

/**
 * Snapshot paths removed by accepted engine transactions since the baseline loaded.
 * The set only grows, so undo and redo stay within it.
 */
export function declaredDeletions(state: EditorState): string[] {
  return structureGuardKey.getState(state) ?? [];
}

/** The editor document as the Save adapter reads it, including declared deletions. */
export function editorDocumentJSON(state: EditorState): TiptapJSON {
  return { ...(state.doc.toJSON() as TiptapJSON), attrs: { ...state.doc.attrs, [DELETED_PATHS_ATTR]: declaredDeletions(state) } };
}

function snapshotPathsOf(doc: ProseMirrorNode): Set<string> {
  const paths = new Set<string>();
  doc.forEach(node => String(node.attrs.sourcePath).split(";").forEach(path => {
    if (path && !isNewBlockPath(path)) paths.add(path);
  }));
  return paths;
}

function commandDeletions(transaction: Transaction, declared: string[]): string[] {
  if (!transaction.docChanged) return declared;
  const remaining = snapshotPathsOf(transaction.doc);
  const removed = [...snapshotPathsOf(transaction.before)].filter(path => !remaining.has(path));
  return removed.length ? [...new Set([...declared, ...removed])] : declared;
}

/** Shown when a content-only editor refuses a change to its top-level structure. */
export const LOCKED_STRUCTURE_REJECTION = "This view keeps every block as it is. You can edit the content inside blocks.";

/** The part of a top-level block that content editing keeps: identity, kind (heading level,
 * Admonition variant) and a table's row and column counts. List items may change. */
function lockedShape(node: ProseMirrorNode): string {
  const rows = node.type.name === "table" ? tableRows(node).map(row => row.childCount) : [];
  const kind = node.type.name === "heading" ? `:${node.attrs.level}`
    : node.type.name === "admonition" ? `:${node.attrs.variant}`
    : node.type.name === "table" ? `:${rows.join(",")}`
    : "";
  return `${node.type.name}${kind}@${node.attrs.sourcePath}`;
}

/** True when `next` keeps every top-level block of `before`, in order and of the same kind. */
export function keepsTopLevelStructure(before: ProseMirrorNode, next: ProseMirrorNode): boolean {
  if (before.childCount !== next.childCount) return false;
  for (let index = 0; index < next.childCount; index++) {
    const previous = before.child(index), current = next.child(index);
    // Typing replaces only the edited block; unchanged siblings stay the same node.
    if (previous !== current && lockedShape(previous) !== lockedShape(current)) return false;
  }
  return true;
}

export function structureGuardPlugin(opening: TiptapJSON, onReject: (reason?: UiMessage) => void, initialDeletedPaths: readonly string[] = [], lockStructure = false): Plugin {
  // A plugin document view's rebase (document-view-change.ts) replaces the opening snapshot.
  let baseline = opening;
  let blocksByPath = snapshotBlocksByPath(baseline);
  return new Plugin<string[]>({
    key: structureGuardKey,
    // Read through isStructureLocked (structure-lock.ts).
    lockStructure,
    state: {
      init: () => [...initialDeletedPaths],
      apply(transaction, declared) {
        if (isDocumentViewChange(transaction)) {
          const rebased = documentViewBaseline(transaction);
          if (!rebased) return declared;
          baseline = rebased;
          blocksByPath = snapshotBlocksByPath(baseline);
          return [];
        }
        return commandDeletions(transaction, declared);
      },
    },
    // Engine edits are accepted only if the normalized result has a semantic
    // save representation. This retains table/inline validation.
    filterTransaction(transaction, state) {
      if (!transaction.docChanged || isDocumentViewChange(transaction)) return true;
      // Each accepted step keeps the previous structure, so the opening structure is kept.
      if (lockStructure && !keepsTopLevelStructure(transaction.before, transaction.doc)) {
        onReject({ key: LOCKED_STRUCTURE_REJECTION });
        return false;
      }
      // Save completes endnotes from their references; every place keeps its references as they are.
      if (lockStructure && !editorKeepsEndnoteReferences(transaction.before, transaction.doc)) {
        onReject({ key: LOCKED_ENDNOTES_REJECTION });
        return false;
      }
      try {
        const next = normalizeEngineDocument(baseline, {
          ...transaction.doc.toJSON(), attrs: { [DELETED_PATHS_ATTR]: commandDeletions(transaction, declaredDeletions(state)) },
        }, transaction.before.childCount !== transaction.doc.childCount, blocksByPath);
        if (isSupportedDocumentChange(baseline, next, blocksByPath)) return true;
      } catch { /* Unrepresentable input keeps the previous document. */ }
      onReject();
      return false;
    },
    appendTransaction(transactions, old, state) {
      if (!transactions.some(tr => tr.docChanged) || transactions.some(isDocumentViewChange)) return null;
      const normalized = normalizeEngineDocument(baseline, state.doc.toJSON(), old.doc.childCount !== state.doc.childCount, blocksByPath);
      const tr = state.tr;
      state.doc.forEach((node, pos, index) => {
        const attrs = normalized.content![index].attrs!;
        if (node.attrs.sourcePath !== attrs.sourcePath) tr.setNodeMarkup(pos, undefined, attrs);
      });
      return tr.docChanged ? tr : null;
    },
  });
}

const DocumentNumbering = Extension.create({
  name: "documentNumbering",
  addGlobalAttributes() { return [{ types: ["doc"], attributes: { status: { default: null, rendered: false }, title: { default: null, rendered: false }, headingNumbering: { default: null, rendered: false }, referenceTemplates: { default: null, rendered: false }, bibliography: { default: null, rendered: false } } }]; },
  addProseMirrorPlugins() {
    const numbering = new PluginKey<HeadingNumberDecorations>("headingNumbers");
    return [new Plugin<HeadingNumberDecorations>({
      key: numbering,
      state: {
        init: (_config, state) => headingNumberDecorations(state.doc),
        apply: (tr, value) => tr.docChanged ? headingNumberDecorations(tr.doc) : value,
      },
      props: { decorations: state => numbering.getState(state)!.decorations },
      // Number columns follow the numbers, not typing: measure only when a number appears,
      // disappears or changes, and again once web fonts replace fallback glyphs.
      view(view) {
        let key: string | undefined;
        const fit = () => {
          const { headings } = numbering.getState(view.state)!;
          key = numberColumnsKey(headings);
          applyNumberColumns(view.dom, "--heading-number-column-h", headings, level => {
            const heading = headings.find(item => item.level === level);
            const dom = heading && view.nodeDOM(heading.pos);
            return dom instanceof HTMLElement ? numberFont(getComputedStyle(dom, "::before")) : undefined;
          });
        };
        fit();
        const stopFonts = onFontsLoaded(fit);
        return {
          update(view) { if (numberColumnsKey(numbering.getState(view.state)!.headings) !== key) fit(); },
          destroy: stopFonts,
        };
      },
    })];
  },
});

type HeadingNumberDecorations = { headings: (NumberedHeading & { pos: number })[]; decorations: DecorationSet };

function headingNumberDecorations(doc: ProseMirrorNode): HeadingNumberDecorations {
  const blocks: { block: string; level?: number }[] = [];
  doc.forEach(node => blocks.push({ block: node.type.name, level: Number(node.attrs.level) }));
  const numbers = headingNumbers(blocks, doc.attrs.headingNumbering as HeadingNumbering | null);
  const headings: HeadingNumberDecorations["headings"] = [];
  const decorations: Decoration[] = [];
  doc.forEach((node, pos, index) => {
    const number = numbers[index];
    if (!number) return;
    headings.push({ level: Number(node.attrs.level) || 1, number, pos });
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-heading-number": number }));
  });
  return { headings, decorations: DecorationSet.create(doc, decorations) };
}
