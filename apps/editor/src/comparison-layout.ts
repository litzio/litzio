import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { CompareRow } from "./comparison-rows.ts";
import { i18n } from "./i18n.ts";
export type ComparisonLayout = { rows: CompareRow[]; descriptions: string[]; expanded: Set<number>; side: "before" | "after"; toggle(fold: number): void };
export const comparisonLayoutKey = new PluginKey<ComparisonLayout>("comparisonLayout");
function layoutSlots(layout: ComparisonLayout) {
  const slots = new Map<number, number>(), foldSlots = new Map<number, number>(); let slot = 0;
  layout.rows.forEach((row, index) => {
    if (row.fold !== undefined && !foldSlots.has(row.fold)) foldSlots.set(row.fold, slot++);
    if (row.fold === undefined || layout.expanded.has(row.fold)) slots.set(index, slot++);
  });
  return { slots, foldSlots };
}
function updateDisclosure(button: HTMLButtonElement, layout: ComparisonLayout, foldSlots: Map<number, number>) {
  const fold = Number(button.dataset.compareFold), slot = foldSlots.get(fold)!;
  const count = layout.rows.filter(row => row.fold === fold).length;
  button.style.setProperty("--compare-row", String(slot * 2 + 3));
  button.style.setProperty("--compare-narrow-row", String(slot * 4 + 5));
  button.textContent = i18n.t(layout.expanded.has(fold) ? "Unchanged {{count}} blocks ▾" : "Unchanged {{count}} blocks ▸", { count });
  button.setAttribute("aria-expanded", String(layout.expanded.has(fold)));
}
/** Top-level node decorations keep the full PM document and NodeViews intact. */
export function comparisonLayout(initial: ComparisonLayout) {
  return Extension.create({ name: "comparisonLayout", addProseMirrorPlugins() {
    return [new Plugin({ key: comparisonLayoutKey,
      state: { init: () => initial, apply: (tr, state) => tr.getMeta(comparisonLayoutKey) ?? state },
      props: { decorations(state) {
        const layout = comparisonLayoutKey.getState(state)!;
        const decorations: Decoration[] = [];
        const { slots, foldSlots } = layoutSlots(layout);
        state.doc.forEach((node, pos) => {
          const index = layout.rows.findIndex(row => row[layout.side]?.join(",") === String(node.attrs.sourcePath));
          if (index < 0) { decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: "display:none" })); return; }
          const row = layout.rows[index], folded = row.fold !== undefined && !layout.expanded.has(row.fold);
          const attrs = { "data-compare-row": String(index), "data-compare-side": layout.side,
            "data-visual-change": row.number ? String(row.number) : "", "data-change-kind": row.change?.kind ?? "context",
            style: folded ? "display:none" : `--compare-row:${slots.get(index)! * 2 + 4};--compare-narrow-row:${slots.get(index)! * 4 + (layout.side === "before" ? 6 : 8)}`,
            tabindex: "-1", "aria-label": layout.descriptions[index] };
          decorations.push(Decoration.node(pos, pos + node.nodeSize, attrs));
          if (row.fold !== undefined && layout.side === "before" && layout.rows.findIndex(item => item.fold === row.fold) === index) {
            decorations.push(Decoration.widget(pos, () => {
              const button = document.createElement("button"); button.type = "button"; button.className = "visual-fold";
              button.dataset.compareFold = String(row.fold);
              updateDisclosure(button, layout, foldSlots);
              button.onclick = () => layout.toggle(row.fold!); return button;
            }, { key: `fold:${row.fold}`, side: -1, stopEvent: () => true, destroy: node => { (node as HTMLButtonElement).onclick = null; } }));
          }
          if (!folded) decorations.push(Decoration.widget(pos, () => {
            const label = document.createElement("span"); label.className = "visual-block-label";
            label.style.cssText = `--compare-row:${slots.get(index)! * 2 + 3};--compare-narrow-row:${slots.get(index)! * 4 + (layout.side === "before" ? 5 : 7)}`;
            label.textContent = `${i18n.t(layout.side === "before" ? "Current disk file" : "Save preview")} · ${layout.descriptions[index]}`;
            return label;
          }, { key: `label:${layout.side}:${index}:${slots.get(index)}:${layout.descriptions[index]}`, side: -1 }));
        });
        return DecorationSet.create(state.doc, decorations);
      } },
      view: () => ({ update(view, previous) {
        const layout = comparisonLayoutKey.getState(view.state)!;
        if (layout === comparisonLayoutKey.getState(previous)) return;
        const { foldSlots } = layoutSlots(layout);
        view.dom.querySelectorAll<HTMLButtonElement>(".visual-fold").forEach(button => updateDisclosure(button, layout, foldSlots));
      } }),
    })];
  } });
}
