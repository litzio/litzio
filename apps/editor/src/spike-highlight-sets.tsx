// Spike #2020 only: named highlight sets as view decorations. Synthetic in-memory sets; nothing is
// saved, written to the document, copied, printed or sent to the assistant. Not for master.
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Highlighter, Plus, Settings2, Trash2, X } from "lucide-react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { createPortal } from "react-dom";
import { i18n } from "./i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, MENU_ITEM_CLASS, MENU_POPUP_CLASS } from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { Row, Section } from "./components/ui/row.tsx";
import { Status } from "./components/ui/status.tsx";
import { cn } from "@/lib/utils";

const ko = () => (i18n.resolvedLanguage ?? i18n.language ?? "").startsWith("ko");
const t = (korean: string, english: string) => (ko() ? korean : english);

export const HIGHLIGHT_COLORS = ["blue", "green", "teal", "violet", "plum", "amber", "red", "gray"] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];
const COLOR_NAMES: Record<HighlightColor, [string, string]> = {
  blue: ["파랑", "Blue"], green: ["초록", "Green"], teal: ["청록", "Teal"], violet: ["보라", "Violet"],
  plum: ["자주", "Plum"], amber: ["황토", "Amber"], red: ["빨강", "Red"], gray: ["회색", "Gray"],
};
export const colorName = (color: HighlightColor) => t(...COLOR_NAMES[color]);

type Word = { text: string; color: HighlightColor };
type HighlightSet = { id: string; name: string; words: Word[] };
type Choice = string | "off";

// ---- Synthetic view preference store (this PC's view settings in the real feature) ----
let sets: HighlightSet[] = [
  { id: "requirements", name: "요구사항", words: [
    { text: "shall", color: "blue" }, { text: "must", color: "blue" }, { text: "should", color: "green" }, { text: "may", color: "gray" },
    { text: "해야 한다", color: "blue" }, { text: "권장한다", color: "green" }, { text: "할 수 있다", color: "gray" },
  ] },
  { id: "contract", name: "계약서", words: [
    { text: "위약금", color: "red" }, { text: "기한", color: "amber" }, { text: "해지", color: "plum" }, { text: "terminate", color: "plum" },
  ] },
  { id: "review", name: "검토 표시", words: [{ text: "TBD", color: "red" }, { text: "확인 필요", color: "amber" }] },
];
const byDocument = new Map<string, Choice>();
const folderDefaults = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();
function changed() { version++; for (const listener of listeners) listener(); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useHighlightStore(): number { return useSyncExternalStore(subscribe, () => version); }
export function subscribeHighlights(listener: () => void) { return subscribe(listener); }

/** Development switch between the two entry point drafts: `?highlight=a|b` or the root dataset. */
export function highlightDraft(): "a" | "b" {
  return document.documentElement.dataset.highlightDraft === "b" ? "b" : "a";
}

const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/u, "");
export function activeSet(path: string): { set: HighlightSet; source: "document" | "folder" } | null {
  const own = byDocument.get(path);
  if (own === "off") return null;
  if (own) { const set = sets.find(item => item.id === own); return set ? { set, source: "document" } : null; }
  for (let folder = folderOf(path); folder && folder !== path; ) {
    const id = folderDefaults.get(folder);
    if (id) { const set = sets.find(item => item.id === id); if (set) return { set, source: "folder" }; }
    const parent = folderOf(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return null;
}
export function chooseSet(path: string, choice: Choice) { byDocument.set(path, choice); changed(); }
export function setFolderDefault(path: string, id: string | null) {
  const folder = folderOf(path);
  if (id) folderDefaults.set(folder, id); else folderDefaults.delete(folder);
  changed();
}
const folderDefaultOf = (path: string) => folderDefaults.get(folderOf(path));
function setWord(setId: string, text: string, color: HighlightColor | null) {
  sets = sets.map(set => {
    if (set.id !== setId) return set;
    const rest = set.words.filter(word => word.text.toLowerCase() !== text.toLowerCase());
    return { ...set, words: color ? [...rest, { text, color }] : rest };
  });
  changed();
}
function renameSet(id: string, name: string) { sets = sets.map(set => (set.id === id ? { ...set, name } : set)); changed(); }
function deleteSet(id: string) { sets = sets.filter(set => set.id !== id); changed(); }
function addSet(name: string) { sets = [...sets, { id: `set-${Date.now()}`, name, words: [] }]; changed(); }

if (import.meta.env.DEV) {
  (globalThis as { __litzioSpikeHighlight?: unknown }).__litzioSpikeHighlight = { chooseSet, setFolderDefault, sets: () => sets };
}

// ---- Matching: English words whole and case-insensitive; Korean and phrases letter for letter ----
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function wordPattern(words: Word[]): RegExp | null {
  if (!words.length) return null;
  const parts = [...words].sort((a, b) => b.text.length - a.text.length).map(word =>
    /^[A-Za-z][A-Za-z'-]*$/u.test(word.text) ? `(?<![A-Za-z])${escape(word.text)}(?![A-Za-z])` : escape(word.text));
  return new RegExp(parts.join("|"), "giu");
}

const key = new PluginKey<DecorationSet>("spikeHighlightSets");
function decorate(doc: PmNode, path: string): DecorationSet {
  const active = activeSet(path);
  const pattern = active && wordPattern(active.set.words);
  if (!active || !pattern) return DecorationSet.empty;
  const lookup = new Map(active.set.words.map(word => [word.text.toLowerCase(), word]));
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Inline atoms (math, references) are not text and break a match.
    let text = "";
    node.forEach(child => { text += child.isText ? child.text! : "￼"; });
    const positions: number[] = [];
    node.forEach((child, offset) => { const len = child.isText ? child.text!.length : 1; for (let i = 0; i < len; i++) positions.push(pos + 1 + offset + i); });
    for (const match of text.matchAll(pattern)) {
      const word = lookup.get(match[0].toLowerCase());
      if (!word || match.index === undefined) continue;
      const from = positions[match.index]!;
      const to = positions[match.index + match[0].length - 1]! + 1;
      found.push(Decoration.inline(from, to, { class: "spike-hl", "data-spike-hl": word.color, "data-spike-word": word.text }));
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}

/** View decorations only: no document content, dirty state, history or save change. */
export function spikeHighlightExtension(getPath: () => string) {
  return Extension.create({
    name: "spikeHighlightSets",
    addProseMirrorPlugins: () => [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_, state) => decorate(state.doc, getPath()),
        apply: (tr, value, _old, state) => (tr.docChanged || tr.getMeta(key) ? decorate(state.doc, getPath()) : value),
      },
      props: { decorations: (state: EditorState) => key.getState(state) },
    })],
  });
}

/** Redraw when sets or choices change, without a history entry. */
export function useHighlightRedraw(editor: Editor) {
  useEffect(() => subscribe(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(key, true).setMeta("addToHistory", false));
  }), [editor]);
}

// ---- Shared bits ----
export function Swatch({ color, size = "sm" }: { color: HighlightColor; size?: "sm" | "md" }) {
  return <span className="spike-hl-swatch" data-size={size} style={{ background: `var(--id-color-highlight-${color})` }} aria-hidden="true" />;
}
function SetDots({ set }: { set: HighlightSet }) {
  const colors = [...new Set(set.words.map(word => word.color))].slice(0, 3);
  return <span className="spike-hl-dots" aria-hidden="true">{colors.map(color => <Swatch key={color} color={color} />)}</span>;
}
function openSettings() { globalThis.dispatchEvent(new Event("litzio-spike-highlight-settings")); }

/** Menu contents shared by draft A's button and draft B's ⋯ submenu. */
function SetMenuItems({ path, Item, Separator }: { path: string; Item: typeof DropdownMenuItem; Separator: typeof DropdownMenuSeparator }) {
  const active = activeSet(path);
  const folderDefault = folderDefaultOf(path);
  return <>
    <div className="spike-hl-menu-label type-helper">{t("강조 세트", "Highlight set")}</div>
    {sets.map(set => <Item key={set.id} role="menuitemradio" aria-checked={active?.set.id === set.id} onClick={() => chooseSet(path, set.id)} data-testid={`spike-hl-set-${set.id}`}>
      <span className="spike-hl-check">{active?.set.id === set.id ? <Check aria-hidden="true" /> : null}</span>
      <span className="spike-hl-item-name">{set.name}</span>
      {folderDefault === set.id ? <span className="spike-hl-item-hint type-helper">{t("폴더 기본", "Folder default")}</span> : null}
      <SetDots set={set} />
    </Item>)}
    <Item role="menuitemradio" aria-checked={!active} onClick={() => chooseSet(path, "off")} data-testid="spike-hl-off">
      <span className="spike-hl-check">{!active ? <Check aria-hidden="true" /> : null}</span>{t("끄기", "Off")}
    </Item>
    <Separator />
    <Item role="menuitemcheckbox" aria-checked={Boolean(active && folderDefault === active.set.id)} disabled={!active}
      onClick={() => active && setFolderDefault(path, folderDefault === active.set.id ? null : active.set.id)} data-testid="spike-hl-folder-default">
      <span className="spike-hl-check">{active && folderDefault === active.set.id ? <Check aria-hidden="true" /> : null}</span>
      {t("이 폴더의 기본으로", "Default for this folder")}
    </Item>
    <Item onClick={openSettings} data-testid="spike-hl-manage">
      <span className="spike-hl-check"><Settings2 aria-hidden="true" /></span>{t("세트 관리…", "Manage sets…")}
    </Item>
  </>;
}

/** Draft A: a highlighter button in the tab row; when on it shows the set's colors and name. */
export function HighlightSetButton({ path, compact }: { path: string; compact?: boolean }) {
  useHighlightStore();
  const active = activeSet(path);
  const label = active ? `${t("강조", "Highlight")}: ${active.set.name}${active.source === "folder" ? ` (${t("폴더 기본", "folder default")})` : ""}` : t("강조 끔", "Highlight off");
  return <DropdownMenu>
    <Tooltip>
      <TooltipTrigger render={<DropdownMenuTrigger render={<Button type="button" size={active && !compact ? "sm" : "icon-sm"} variant="ghost"
        className="spike-hl-button" data-on={active ? "" : undefined} aria-label={label} data-testid="spike-hl-button" />} />}>
        <Highlighter aria-hidden="true" />
        {active ? <>{compact ? null : <span className="spike-hl-button-name">{active.set.name}</span>}<SetDots set={active.set} /></> : null}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="spike-hl-menu" data-testid="spike-hl-menu">
      <SetMenuItems path={path} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} />
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** Draft B: the same menu as a submenu of the tab row's ⋯ file actions. */
export function HighlightSubmenu({ path }: { path: string }) {
  useHighlightStore();
  const active = activeSet(path);
  return <MenuPrimitive.SubmenuRoot>
    <MenuPrimitive.SubmenuTrigger className={MENU_ITEM_CLASS} data-testid="spike-hl-submenu">
      <Highlighter aria-hidden="true" />{t("강조 세트", "Highlight set")}
      <span className="spike-hl-item-hint type-helper">{active ? active.set.name : t("끔", "Off")}</span>
      <span aria-hidden="true" className="spike-hl-chevron">›</span>
    </MenuPrimitive.SubmenuTrigger>
    <MenuPrimitive.Portal className="ui-portal">
      <MenuPrimitive.Positioner className="isolate z-50 outline-none" side="left" sideOffset={4}>
        <MenuPrimitive.Popup className={cn(MENU_POPUP_CLASS, "spike-hl-menu")} data-testid="spike-hl-menu">
          <SetMenuItems path={path} Item={DropdownMenuItem} Separator={DropdownMenuSeparator} />
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  </MenuPrimitive.SubmenuRoot>;
}

/** Draft B: a small state indicator in the tab row, only while a set is on. */
export function HighlightStatus({ path }: { path: string }) {
  useHighlightStore();
  const active = activeSet(path);
  if (!active) return null;
  const label = `${t("강조", "Highlight")}: ${active.set.name}${active.source === "folder" ? ` (${t("폴더 기본", "folder default")})` : ""}`;
  return <Tooltip>
    <TooltipTrigger render={<span tabIndex={0} role="img" aria-label={label} className="spike-hl-status" data-testid="spike-hl-status" />}>
      <SetDots set={active.set} /><span className="spike-hl-status-name">{active.set.name}</span>
    </TooltipTrigger>
    <TooltipContent side="bottom">{label} · {t("⋯ 파일 동작에서 바꿉니다", "Change it in ⋯ File actions")}</TooltipContent>
  </Tooltip>;
}

/** Selection toolbar: "Highlight" opens a palette under the toolbar to add the selected text. */
export function HighlightToolbarButton({ editor, path }: { editor: Editor; path: string }) {
  useHighlightStore();
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const active = activeSet(path);
  const { from, to } = editor.state.selection;
  const text = editor.state.doc.textBetween(from, to, " ", " ").trim();
  const existing = active?.set.words.find(word => word.text.toLowerCase() === text.toLowerCase());
  return <>
    <Button variant="ghost" size="icon-sm" aria-label={t("강조 단어로 추가", "Add as highlighted word")} title={t("강조 단어로 추가", "Add as highlighted word")}
      aria-expanded={Boolean(open)} aria-pressed={Boolean(existing)} data-testid="spike-hl-toolbar"
      onMouseDown={event => event.preventDefault()} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        setOpen(value => (value ? null : { left: rect.left, top: rect.bottom + 6 }));
      }}>
      <Highlighter aria-hidden="true" size={16} />
    </Button>
    {open ? createPortal(<div className="spike-hl-picker" style={{ left: open.left, top: open.top }} role="group" aria-label={t("강조 색", "Highlight color")} data-testid="spike-hl-picker">
      <div className="spike-hl-picker-title">
        <span className="type-item-name">“{text}”</span>
        <span className="type-helper">{active ? t(`${active.set.name}에 추가`, `Add to ${active.set.name}`) : t("세트를 먼저 고르세요", "Choose a set first")}</span>
      </div>
      <div className="spike-hl-swatches" role="radiogroup" aria-label={t("강조 색", "Highlight color")}>
        {HIGHLIGHT_COLORS.map(color => <button key={color} type="button" role="radio" aria-checked={existing?.color === color} className="spike-hl-swatch-button"
          aria-label={colorName(color)} title={colorName(color)} disabled={!active} onMouseDown={event => event.preventDefault()}
          onClick={() => { if (active) { setWord(active.set.id, text, color); setOpen(null); } }}>
          <Swatch color={color} size="md" />
        </button>)}
      </div>
    </div>, document.body) : null}
  </>;
}

/** Secondary click on a highlighted word: change its color or remove it from the set. */
export function HighlightWordMenu({ menu, path, onClose }: { menu: { word: string; x: number; y: number }; path: string; onClose(): void }) {
  useHighlightStore();
  const ref = useRef<HTMLDivElement>(null);
  const active = activeSet(path);
  const word = active?.set.words.find(item => item.text.toLowerCase() === menu.word.toLowerCase());
  const [place, setPlace] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPlace({ left: Math.max(8, Math.min(menu.x, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8)) });
  }, [menu.x, menu.y]);
  useEffect(() => {
    (ref.current?.querySelector<HTMLElement>("button[aria-checked=true]") ?? ref.current?.querySelector<HTMLElement>("button"))?.focus();
    const away = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); };
  }, [onClose]);
  if (!active || !word) return null;
  return createPortal(<div ref={ref} role="menu" aria-label={t("강조 단어", "Highlighted word")} className={cn(MENU_POPUP_CLASS, "spike-hl-word-menu")}
    style={{ position: "fixed", left: place.left, top: place.top }} data-testid="spike-hl-word-menu">
    <div className="spike-hl-menu-label"><span className="spike-hl spike-hl-sample" data-spike-hl={word.color}>{word.text}</span>
      <span className="type-helper"> · {active.set.name}</span></div>
    <div className="spike-hl-menu-label type-helper">{t("색 바꾸기", "Change color")}</div>
    <div className="spike-hl-swatches" role="group">
      {HIGHLIGHT_COLORS.map(color => <button key={color} type="button" role="menuitemradio" aria-checked={word.color === color} className="spike-hl-swatch-button"
        aria-label={colorName(color)} title={colorName(color)} onClick={() => { setWord(active.set.id, word.text, color); onClose(); }}>
        <Swatch color={color} size="md" />
      </button>)}
    </div>
    <div className="-mx-1 my-1 h-px bg-border" />
    <button type="button" role="menuitem" className={cn(MENU_ITEM_CLASS, "w-full hover:bg-accent")} onClick={() => { setWord(active.set.id, word.text, null); onClose(); }}>
      <X aria-hidden="true" />{t("강조에서 빼기", "Remove from highlights")}</button>
    <button type="button" role="menuitem" className={cn(MENU_ITEM_CLASS, "w-full hover:bg-accent")} onClick={() => { onClose(); openSettings(); }}>
      <Settings2 aria-hidden="true" />{t("세트 관리…", "Manage sets…")}</button>
  </div>, document.body);
}

// ---- Settings: manage the sets ----
function SetRow({ set }: { set: HighlightSet }): ReactNode {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(set.name);
  const folders = [...folderDefaults.values()].filter(id => id === set.id).length;
  const documents = [...byDocument.values()].filter(id => id === set.id).length;
  return <div className="spike-hl-set" data-testid={`spike-hl-settings-${set.id}`}>
    <Row label={renaming
      ? <Input value={name} autoFocus aria-label={t("세트 이름", "Set name")} className="spike-hl-rename" onChange={event => setName(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { renameSet(set.id, name.trim() || set.name); setRenaming(false); } if (event.key === "Escape") setRenaming(false); }} />
      : set.name}
      description={<>{t(`단어 ${set.words.length}개`, `${set.words.length} words`)}
        {folders || documents ? <> · <Status variant="plain" tone="ok" label={[folders ? t(`폴더 기본 ${folders}곳`, `default in ${folders} folders`) : "", documents ? t(`문서 ${documents}개에서 켬`, `on in ${documents} documents`) : ""].filter(Boolean).join(" · ")} /></> : null}</>}>
      <div className="settings-actions">
        <Button size="sm" variant="outline" onClick={() => (renaming ? (renameSet(set.id, name.trim() || set.name), setRenaming(false)) : setRenaming(true))}>
          {renaming ? t("완료", "Done") : t("이름 바꾸기", "Rename")}</Button>
        <Button size="sm" variant="ghost" aria-label={t(`${set.name} 지우기`, `Delete ${set.name}`)} title={t("지우기", "Delete")} onClick={() => deleteSet(set.id)}>
          <Trash2 aria-hidden="true" />{t("지우기", "Delete")}</Button>
      </div>
    </Row>
    <ul className="spike-hl-chips" aria-label={t(`${set.name}의 단어`, `Words in ${set.name}`)}>
      {set.words.map(word => <li key={word.text} className="spike-hl-chip">
        <WordColor setId={set.id} word={word} />
        <span className="spike-hl" data-spike-hl={word.color}>{word.text}</span>
        <button type="button" className="spike-hl-chip-remove" aria-label={t(`${word.text} 빼기`, `Remove ${word.text}`)} title={t("빼기", "Remove")}
          onClick={() => setWord(set.id, word.text, null)}><X aria-hidden="true" /></button>
      </li>)}
      <li><AddWord setId={set.id} /></li>
    </ul>
  </div>;
}
function WordColor({ setId, word }: { setId: string; word: Word }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" className="spike-hl-chip-color" aria-label={t(`${word.text} 색: ${colorName(word.color)}`, `${word.text} color: ${colorName(word.color)}`)} title={colorName(word.color)} />}>
      <Swatch color={word.color} />
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {HIGHLIGHT_COLORS.map(color => <DropdownMenuItem key={color} role="menuitemradio" aria-checked={word.color === color} onClick={() => setWord(setId, word.text, color)}>
        <Swatch color={color} size="md" />{colorName(color)}{word.color === color ? <Check aria-hidden="true" className="ml-auto" /> : null}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
function AddWord({ setId }: { setId: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editing) return <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Plus aria-hidden="true" />{t("단어 추가", "Add word")}</Button>;
  return <Input value={text} autoFocus className="spike-hl-add" aria-label={t("추가할 단어", "Word to add")} placeholder={t("단어 또는 구절", "Word or phrase")}
    onChange={event => setText(event.target.value)} onBlur={() => setEditing(false)}
    onKeyDown={event => { if (event.key === "Enter" && text.trim()) { setWord(setId, text.trim(), "blue"); setText(""); setEditing(false); } if (event.key === "Escape") setEditing(false); }} />;
}

export function HighlightSetSettings() {
  useHighlightStore();
  return <Section title={t("세트 목록", "Sets")}
    description={t("문서를 바꾸지 않는 보기 설정입니다. 이 PC에만 저장되고 문서·복사·인쇄·비서에게 보내는 내용에는 들어가지 않습니다.",
      "A view setting that never changes documents. Kept on this PC; never in the file, copies, printing or what the assistant receives.")}>
    {sets.map(set => <SetRow key={set.id} set={set} />)}
    <div className="spike-hl-new"><Button size="sm" variant="outline" onClick={() => addSet(t("새 세트", "New set"))}><Plus aria-hidden="true" />{t("새 세트", "New set")}</Button></div>
  </Section>;
}

