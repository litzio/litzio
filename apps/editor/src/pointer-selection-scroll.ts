import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { documentScrollContainer } from "./document-scroll.ts";

const pointerSelection = new PluginKey<boolean>("pointerSelectionScroll");

/** Whether this transaction is a pointer selection, or appended to one. */
function fromPointer(tr: Transaction, previous: boolean): boolean {
  return tr.getMeta("pointer") === true || previous && tr.getMeta("appendedTransaction") !== undefined;
}

/** prosemirror-view places a pointer selection itself and scrolls it into view through the editor's
 * scroll threshold, whose bottom is the writing end space. A press in the lower part of the window
 * would then move the document under the pointer before the next press of a double or triple click
 * lands. As with a native click, a pointer selection whose head is visible does not scroll; a drag
 * past the viewport edge still does. */
export const PointerSelectionScroll = Extension.create({
  name: "pointerSelectionScroll",
  addProseMirrorPlugins() {
    return [new Plugin<boolean>({
      key: pointerSelection,
      state: { init: () => false, apply: (tr, previous) => fromPointer(tr, previous) },
      props: {
        handleScrollToSelection(view) {
          if (!pointerSelection.getState(view.state)) return false;
          const viewport = documentScrollContainer(view.dom);
          if (!viewport) return false;
          const head = view.coordsAtPos(view.state.selection.head), bounds = viewport.getBoundingClientRect();
          return head.top >= bounds.top && head.bottom <= Math.min(bounds.bottom, window.innerHeight);
        },
      },
    })];
  },
});
