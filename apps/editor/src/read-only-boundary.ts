import { Extension } from "@tiptap/core";
import { Plugin, NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

/** Shared Read transaction/key boundary, including isolated snapshot previews. */
export const ReadOnlyBoundary = Extension.create({
  name: "readOnlyBoundary",
  priority: 10000,
  addProseMirrorPlugins() {
    const current = this.editor;
    return [new Plugin({
      filterTransaction: tr => current.isEditable || !tr.docChanged,
      props: {
        // ProseMirror skips its editable keydown handler in Read. Route
        // navigation/copy through the existing keymaps, retaining its state.
        handleDOMEvents: { keydown: (view, event) => {
          if (current.isEditable || event.target instanceof Element && event.target.closest("button")) return false;
          const navigation = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Tab", "Escape"].includes(event.key);
          const copy = (event.ctrlKey || event.metaKey) && ["a", "c"].includes(event.key.toLowerCase());
          if (!navigation && !copy) {
            const modified = event.ctrlKey || event.metaKey;
            const mutation = ["Enter", "Backspace", "Delete"].includes(event.key) ||
              (!modified && !event.altKey && event.key.length === 1) ||
              (modified && ["b", "i", "u", "x", "v", "z", "y"].includes(event.key.toLowerCase()));
            // Do not forward authoring shortcuts to keymaps. Browser Find,
            // Print, zoom and other native commands retain their defaults.
            if (mutation) event.preventDefault();
            return mutation;
          }
          // Edit's document-end command may append a writable paragraph.
          // Reading document edges must only move/extend engine selection.
          if ((event.ctrlKey || event.metaKey) && ["Home", "End"].includes(event.key)) {
            const target = event.key === "Home" ? Selection.atStart(view.state.doc) : Selection.atEnd(view.state.doc);
            const next = event.shiftKey ? TextSelection.between(view.state.doc.resolve(view.state.selection.anchor), target.$head) : target;
            view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
            event.preventDefault(); return true;
          }
          if (view.someProp("handleKeyDown", handler => handler(view, event))) {
            event.preventDefault(); return true;
          }
          const { selection } = view.state;
          if (selection instanceof NodeSelection && /^Arrow/.test(event.key) && !event.shiftKey) {
            const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
            view.dispatch(view.state.tr.setSelection(Selection.near(backward ? selection.$from : selection.$to, backward ? -1 : 1)).scrollIntoView());
            event.preventDefault(); return true;
          }
          // Chromium does not move a caret on a noneditable surface by
          // default. Delegate movement/extension to its native Selection;
          // ProseMirror maps the result and owns selection/scrolling.
          if (selection instanceof TextSelection && /^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(event.key)) {
            const native = view.dom.ownerDocument.getSelection();
            const backward = ["ArrowLeft", "ArrowUp", "Home"].includes(event.key);
            const granularity = event.key === "Home" || event.key === "End" ? (event.ctrlKey || event.metaKey ? "documentboundary" : "lineboundary")
              : event.key === "ArrowUp" || event.key === "ArrowDown" ? "line"
              : event.ctrlKey || event.altKey ? "word" : "character";
            native?.modify(event.shiftKey ? "extend" : "move", backward ? "backward" : "forward", granularity);
            if (native?.anchorNode && native.focusNode && view.dom.contains(native.anchorNode) && view.dom.contains(native.focusNode)) {
              view.dispatch(view.state.tr.setSelection(TextSelection.between(
                view.state.doc.resolve(view.posAtDOM(native.anchorNode, native.anchorOffset)),
                view.state.doc.resolve(view.posAtDOM(native.focusNode, native.focusOffset)),
              )).scrollIntoView());
            }
            event.preventDefault(); return true;
          }
          return false;
        } },
      },
    })];
  },
});
