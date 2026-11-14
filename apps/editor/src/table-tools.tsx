import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { useTableToolGeometry } from "./table-tool-geometry.ts";
import { useEditorVisible } from "./editor-visibility.ts";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { BLOCK_COMMANDS, blockCommandGroup, tableRowCount, type TableCellAddress } from "./block-commands.ts";
import { CommandMenu, type CommandMenuItem } from "./CommandMenu.tsx";
import { blockCommandAppearance } from "./command-icons.ts";

type MenuTarget = { position: number; kind: "row" | "column"; target: TableCellAddress };
const menuTargetKey = new PluginKey<MenuTarget | null>("tableMenuTarget");

/** Both indicators are engine decorations, never document attributes or selection. */
export const TableCellFocus = Extension.create({
  name: "tableCellFocus",
  addProseMirrorPlugins() {
    return [new Plugin<MenuTarget | null>({
      key: menuTargetKey,
      state: {
        init: () => null,
        apply: (tr, previous) => tr.docChanged ? null : tr.getMeta(menuTargetKey) === undefined ? previous : tr.getMeta(menuTargetKey),
      },
      props: { decorations(state) {
        const decorations: Decoration[] = [];
        const { $from, $to } = state.selection;
        if ($from.parent.type.name === "tableCell" && $from.sameParent($to)) {
          decorations.push(Decoration.node($from.before(), $from.after(), { "data-current-cell": "true" }));
        }
        const menu = menuTargetKey.getState(state);
        const table = menu && state.doc.nodeAt(menu.position);
        if (menu && table?.type.name === "table") table.forEach((row, rowOffset, r) => {
          if (row.type.name !== "tableRow") return;
          row.forEach((cell, cellOffset, c) => {
            if (menu.kind === "row" ? r === menu.target.row : c === menu.target.column) {
              const at = menu.position + 2 + rowOffset + cellOffset;
              decorations.push(Decoration.node(at, at + cell.nodeSize, { "data-table-menu-target": "true" }));
            }
          });
        });
        return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
      } },
    })];
  },
});

function columnName(index: number): string {
  let name = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

type Menu = { kind: "row" | "column" | "table"; target: TableCellAddress };

/** Handles reuse explicit-target table commands. Geometry and menu state never enter the document. */
export function TableTools({ editor, node, getPos, grid, rowLayer, actionLayer, appendAnchor, onEdit, hidden }: Pick<ReactNodeViewProps, "editor" | "node" | "getPos"> & {
  grid: RefObject<HTMLDivElement | null>;
  /** Left of the text axis and outside the horizontal scroller: rows never scroll sideways. */
  rowLayer: RefObject<HTMLDivElement | null>;
  /** Whole-table entry points stay above the grid, outside horizontal scrolling. */
  actionLayer: RefObject<HTMLDivElement | null>;
  appendAnchor: string;
  onEdit(): void; hidden: boolean;
}) {
  useTranslation();
  const visible = useEditorVisible();
  const geometry = useTableToolGeometry(grid, node, visible);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [focused, setFocused] = useState<Menu | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const current = useEditorState({ editor, selector: ({ editor: instance }) => {
    const { $from } = instance.state.selection;
    return $from.depth >= 3 && $from.node(1).type.name === "table" && $from.before(1) === getPos()
      ? { row: $from.index(1), column: $from.index(2) } : null;
  } });
  useEffect(() => {
    const closeOnEdit = ({ transaction }: { transaction: { docChanged: boolean } }) => { if (transaction.docChanged) setMenu(null); };
    editor.on("transaction", closeOnEdit);
    return () => { editor.off("transaction", closeOnEdit); };
  }, [editor]);
  useEffect(() => { if (hidden || !editor.isEditable) setMenu(null); }, [hidden, editor.isEditable]);


  useLayoutEffect(() => {
    if (editor.isDestroyed) return;
    const position = getPos();
    const target = typeof position === "number" && (menu?.kind === "row" || menu?.kind === "column")
      ? { position, kind: menu.kind, target: menu.target } : null;
    const update = (value: MenuTarget | null) => {
      if (!editor.isDestroyed && (value || menuTargetKey.getState(editor.state))) {
        editor.view.dispatch(editor.state.tr.setMeta(menuTargetKey, value).setMeta("addToHistory", false));
      }
    };
    update(target);
    return () => update(null);
  }, [editor, getPos, menu]);

  const emphasizedColumn = menu?.kind === "column" ? menu.target.column : focused?.kind === "column" ? focused.target.column : current?.column;
  useLayoutEffect(() => {
    const bar = actionLayer.current, block = grid.current?.closest<HTMLElement>(".table-block");
    if (!bar || !block || !geometry) return;
    const cell = emphasizedColumn === undefined ? undefined : geometry.columns[emphasizedColumn];
    const width = bar.getBoundingClientRect().width;
    const left = cell?.visible && cell.left - geometry.targetSize / 2 < width + geometry.clearance
      ? cell.left + geometry.targetSize / 2 + geometry.clearance : 0;
    block.style.setProperty("--table-action-left", `${left}px`);
    block.style.setProperty("--table-action-clearance", `${left + width + geometry.clearance}px`);
    return () => { block.style.removeProperty("--table-action-left"); block.style.removeProperty("--table-action-clearance"); };
  }, [actionLayer, grid, geometry, emphasizedColumn]);

  useLayoutEffect(() => {
    const element = document.activeElement;
    if (!geometry || !element || !rowLayer.current?.contains(element)) return;
    if ((element.matches(".table-extend-column") && !geometry.columnSpace) ||
        (element.matches(".table-extend-row") && !geometry.rowSpace)) {
      // A resize can remove an append bar's gap while it has keyboard focus.
      // Keep focus on an available equivalent entry point, without moving caret.
      actionLayer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [geometry, actionLayer, rowLayer]);

  if (!visible || !editor.isEditable || hidden || !geometry || !rowLayer.current || !actionLayer.current) return null;
  const position = getPos();
  if (typeof position !== "number") return null;
  const index = editor.state.doc.resolve(position).index();
  const run = (id: string, target: TableCellAddress) => {
    setMenu(null);
    const at = getPos();
    if (typeof at !== "number" || !editor.isEditable) return;
    const block = editor.state.doc.resolve(at).index();
    const command = BLOCK_COMMANDS.find(item => item.id === id);
    if (!command?.enabled(editor.state, block, target)) return;
    editor.view.dispatch(command.run(editor.state, block, target));
    editor.view.focus();
  };
  const open = (button: HTMLButtonElement, kind: Menu["kind"], target: TableCellAddress) => {
    anchor.current = button;
    setMenu({ kind, target });
  };
  const target = menu?.target ?? focused?.target ?? current ?? { row: 0, column: 0 };
  const row = menu?.kind === "row" || focused?.kind === "row" ? target.row : current?.row;
  const column = menu?.kind === "column" || focused?.kind === "column" ? target.column : current?.column;
  const actions = BLOCK_COMMANDS.filter(command => menu?.kind === "row" ? command.id.startsWith("table-row")
    : menu?.kind === "column" ? command.id.startsWith("table-column") || command.id.startsWith("table-align") : command.id === "delete");
  const items: CommandMenuItem[] = actions.map(command => ({ id: command.id, label: command.id === "delete" ? i18n.t("Delete table") : command.label,
    ...blockCommandAppearance(command.id), group: blockCommandGroup(command.id),
    disabled: !command.enabled(editor.state, index, target) }));
  if (menu?.kind === "table") items.unshift({ id: "properties", label: i18n.t("Edit label"), ...blockCommandAppearance("properties"), group: i18n.t("Table") });
  const active = !!current || !!focused || !!menu;
  const focus = (kind: Menu["kind"], target: TableCellAddress) => {
    setFocused({ kind, target });
    // Keyboard discovery changes focus, never the native caret/selection.
    if (kind === "column") grid.current?.querySelector("table")?.rows[0]?.cells[target.column]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const blur = () => setFocused(null);
  return <div className="table-tools" data-active={active ? "true" : "false"} data-menu-open={menu ? "true" : "false"} contentEditable={false}>
    {createPortal(<div className="table-tools" data-active={active ? "true" : "false"} data-menu-open={menu ? "true" : "false"} contentEditable={false}>
      {geometry.columns.map((cell, i) => <Button variant="table-handle" size="sm" key={i} type="button" className="table-column-handle"
        data-show={active && column === i && cell.visible ? "true" : "false"}
        aria-label={i18n.t("Column {{column}} actions", { column: columnName(i) })} title={i18n.t("Column {{column}} actions", { column: columnName(i) })}
        aria-pressed={column === i} aria-haspopup="menu" aria-expanded={menu?.kind === "column" && target.column === i}
        onFocus={() => focus("column", { row: current?.row ?? 0, column: i })} onBlur={blur}
        style={{ left: cell.left, top: geometry.top }}
        onClick={event => open(event.currentTarget, "column", { row: current?.row ?? 0, column: i })}><MoreHorizontal size={16} aria-hidden="true" /></Button>)}
      <Button variant="table-handle" size="sm" type="button" className="table-extend table-extend-column" aria-label={i18n.t("Append column")} title={i18n.t("Append column")}
        data-show={active && !menu && geometry.columnSpace ? "true" : "false"} tabIndex={geometry.columnSpace && !menu ? 0 : -1}
        onFocus={() => focus("table", current ?? { row: 0, column: 0 })} onBlur={blur}
        style={{ display: geometry.columnSpace ? undefined : "none", positionAnchor: appendAnchor, width: geometry.appendWidth, height: geometry.bottom - geometry.top }}
        onClick={() => run("table-column", { row: current?.row ?? 0, column: node.child(0).childCount - 1 })}><Plus size={16} /></Button>
      {geometry.rows.map((cell, i) => <Button variant="table-handle" size="sm" key={i} type="button" className="table-row-handle"
        data-show={active && row === i ? "true" : "false"} data-scrolled={geometry.scrolled ? "true" : "false"}
        aria-label={i18n.t("Row {{row}} actions{{header}}", { row: i + 1, header: i === 0 ? i18n.t(" (header)") : "" })}
        title={i18n.t("Row {{row}} actions{{header}}", { row: i + 1, header: i === 0 ? i18n.t(" (header)") : "" })}
        aria-pressed={row === i} aria-haspopup="menu" aria-expanded={menu?.kind === "row" && target.row === i}
        onFocus={() => focus("row", { row: i, column: current?.column ?? 0 })} onBlur={blur}
        style={{ left: geometry.left, top: cell.top + cell.height / 2 }}
        onClick={event => open(event.currentTarget, "row", { row: i, column: current?.column ?? 0 })}><MoreVertical size={16} aria-hidden="true" /></Button>)}
      <Button variant="table-handle" size="sm" type="button" className="table-extend table-extend-row" aria-label={i18n.t("Append row")} title={i18n.t("Append row")}
        data-show={active && !menu && geometry.rowSpace ? "true" : "false"} tabIndex={menu || !geometry.rowSpace ? -1 : 0}
        onFocus={() => focus("table", current ?? { row: 0, column: 0 })} onBlur={blur}
        style={{ left: geometry.left, top: geometry.appendTop, width: geometry.right - geometry.left, height: geometry.appendHeight }}
        onClick={() => run("table-row", { row: tableRowCount(node) - 1, column: current?.column ?? 0 })}><Plus size={16} /></Button>
    </div>, rowLayer.current)}
    {createPortal(<>
      <Button variant="outline" size="sm" type="button" aria-label={i18n.t("Edit table")} onFocus={() => focus("table", current ?? { row: 0, column: 0 })} onBlur={blur} onClick={onEdit}>{i18n.t("Edit")}</Button>
      <Button variant="outline" size="icon-sm" type="button" aria-label={i18n.t("Table actions")} title={i18n.t("Table actions")} onFocus={() => focus("table", current ?? { row: 0, column: 0 })} onBlur={blur} aria-haspopup="menu" aria-expanded={menu?.kind === "table"}
        onClick={event => open(event.currentTarget, "table", current ?? { row: 0, column: 0 })}><MoreHorizontal size={16} /></Button>
    </>, actionLayer.current)}
    <Popover open={menu !== null} onOpenChange={open => { if (!open) setMenu(null); }}>
      <PopoverContent anchor={anchor} side="bottom" align="start" sideOffset={4} initialFocus={false} finalFocus={false} className="table-command-popover">
        <CommandMenu label={menu?.kind === "row" ? i18n.t("Row {{row}} actions", { row: target.row + 1 }) : menu?.kind === "column" ? i18n.t("Column {{column}} actions", { column: columnName(target.column) }) : i18n.t("Table actions")}
          items={items} style={{ position: "relative" }} focusOnOpen onClose={() => setMenu(null)}
          onSelect={id => { if (id === "properties") { setMenu(null); onEdit(); } else run(id, target); }} />
      </PopoverContent>
    </Popover>
  </div>;
}
