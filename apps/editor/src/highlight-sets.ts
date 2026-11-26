import { useSyncExternalStore } from "react";
import { readHighlightSets, writeHighlightSets } from "./preferences.ts";
import { splitDocumentPath } from "./shell/document-path.ts";

/**
 * Highlight sets (#2020): this device's named word lists, each word with a palette color.
 * A document shows its own chosen set, else its folder's default. Choices are identified by path
 * like other tab memory. Nothing here reaches a document, the Host or editor history.
 */
export const HIGHLIGHT_COLORS = ["blue", "green", "teal", "violet", "pink", "amber", "red", "gray"] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];
export const HIGHLIGHT_COLOR_LABELS = {
  blue: "Blue", green: "Green", teal: "Teal", violet: "Violet", pink: "Pink", amber: "Amber", red: "Red", gray: "Gray",
} as const satisfies Record<HighlightColor, string>;
export type HighlightWord = { text: string; color: HighlightColor };
export type HighlightSet = { id: string; name: string; words: readonly HighlightWord[] };
export type HighlightState = {
  sets: readonly HighlightSet[];
  /** Document path → set id, or "off" to show none even under a folder default. */
  documents: Readonly<Record<string, string>>;
  /** Folder path → set id for the documents directly in it. */
  folders: Readonly<Record<string, string>>;
};
export const HIGHLIGHT_WORD_MAX = 200;
export const HIGHLIGHT_NAME_MAX = 80;

const isColor = (value: unknown): value is HighlightColor => HIGHLIGHT_COLORS.some(color => color === value);
const record = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0].length > 0)) : {};

/** English words are matched whole and in any case; every other entry letter for letter. */
export function isEnglishWord(text: string): boolean {
  return /^[A-Za-z][A-Za-z0-9'’-]*$/u.test(text);
}
/** The identity a set keeps one color for. */
export function highlightWordKey(text: string): string {
  return isEnglishWord(text) ? text.toLowerCase() : text;
}
/** A usable entry: one line, trimmed, not empty, not overlong. */
export function highlightWordText(text: string): string | null {
  const value = text.trim();
  return value && !/[\r\n]/u.test(value) && value.length <= HIGHLIGHT_WORD_MAX ? value : null;
}

export function parseHighlightState(value: unknown): HighlightState {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sets: HighlightSet[] = [];
  for (const item of Array.isArray(input.sets) ? input.sets : []) {
    if (!item || typeof item !== "object") continue;
    const { id, name, words } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || sets.some(set => set.id === id)) continue;
    const kept = new Map<string, HighlightWord>();
    for (const word of Array.isArray(words) ? words : []) {
      const text = word && typeof word === "object" ? highlightWordText(String((word as Record<string, unknown>).text ?? "")) : null;
      const color = word && typeof word === "object" ? (word as Record<string, unknown>).color : null;
      if (text && isColor(color)) kept.set(highlightWordKey(text), { text, color });
    }
    sets.push({ id, name, words: [...kept.values()] });
  }
  const known = (id: string) => id === "off" || sets.some(set => set.id === id);
  const documents = Object.fromEntries(Object.entries(record(input.documents)).filter(([, id]) => known(id)));
  const folders = Object.fromEntries(Object.entries(record(input.folders)).filter(([, id]) => id !== "off" && known(id)));
  return { sets, documents, folders };
}

let state = parseHighlightState(readHighlightSets());
let saveProblem = false;
const listeners = new Set<() => void>();
export function subscribeHighlightSets(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: HighlightState): boolean {
  state = next;
  saveProblem = !writeHighlightSets(state);
  for (const listener of listeners) listener();
  return !saveProblem;
}
export function highlightState(): HighlightState { return state; }
export function useHighlightState(): HighlightState { return useSyncExternalStore(subscribeHighlightSets, highlightState); }
/** The last change could not be remembered; it still applies until the page closes. */
export function useHighlightSaveProblem(): boolean { return useSyncExternalStore(subscribeHighlightSets, () => saveProblem); }

const folderOf = (path: string) => splitDocumentPath(path).directory;
export function folderDefaultOf(path: string, from: HighlightState = state): string | undefined {
  return path ? from.folders[folderOf(path)] : undefined;
}
/** The document's own choice wins over its folder's default. */
export function activeHighlightSet(path: string, from: HighlightState = state): { set: HighlightSet; source: "document" | "folder" } | null {
  if (!path) return null;
  const own = from.documents[path];
  if (own === "off") return null;
  const id = own ?? folderDefaultOf(path, from);
  const set = id ? from.sets.find(item => item.id === id) : undefined;
  return set ? { set, source: own ? "document" : "folder" } : null;
}

export function chooseHighlightSet(path: string, id: string): boolean {
  if (!path || id !== "off" && !state.sets.some(set => set.id === id)) return false;
  return publish({ ...state, documents: { ...state.documents, [path]: id } });
}
/** Makes the set the default of the document's folder, or clears it. */
export function setHighlightFolderDefault(path: string, id: string | null): boolean {
  if (!path) return false;
  const folders = { ...state.folders };
  if (id && state.sets.some(set => set.id === id)) folders[folderOf(path)] = id;
  else delete folders[folderOf(path)];
  return publish({ ...state, folders });
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `set-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createHighlightSet(name: string): string | null {
  const value = name.trim().slice(0, HIGHLIGHT_NAME_MAX);
  if (!value) return null;
  const id = newId();
  publish({ ...state, sets: [...state.sets, { id, name: value, words: [] }] });
  return id;
}
export function renameHighlightSet(id: string, name: string): boolean {
  const value = name.trim().slice(0, HIGHLIGHT_NAME_MAX);
  if (!value) return false;
  return publish({ ...state, sets: state.sets.map(set => (set.id === id ? { ...set, name: value } : set)) });
}
/** Choices and folder defaults naming the set go with it. */
export function deleteHighlightSet(id: string): boolean {
  const keep = (entries: Readonly<Record<string, string>>) => Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== id));
  return publish({ sets: state.sets.filter(set => set.id !== id), documents: keep(state.documents), folders: keep(state.folders) });
}
/** Adds the word, changes its color, or (null) removes it. */
export function setHighlightWord(setId: string, text: string, color: HighlightColor | null): boolean {
  const value = highlightWordText(text);
  if (!value) return false;
  const key = highlightWordKey(value);
  return publish({ ...state, sets: state.sets.map(set => {
    if (set.id !== setId) return set;
    const index = set.words.findIndex(word => highlightWordKey(word.text) === key);
    if (!color) return index < 0 ? set : { ...set, words: set.words.filter((_, at) => at !== index) };
    const words = [...set.words];
    if (index < 0) words.push({ text: value, color });
    else words[index] = { text: words[index]!.text, color };
    return { ...set, words };
  }) });
}
export function highlightWordIn(set: HighlightSet, text: string): HighlightWord | undefined {
  const key = highlightWordKey(text.trim());
  return set.words.find(word => highlightWordKey(word.text) === key);
}
/** A renamed document keeps its choice. */
export function relocateHighlightChoice(previous: string, next: string): void {
  const choice = state.documents[previous];
  if (choice === undefined && state.documents[next] === undefined) return;
  const documents = { ...state.documents };
  delete documents[previous];
  delete documents[next];
  if (choice !== undefined) documents[next] = choice;
  publish({ ...state, documents });
}
