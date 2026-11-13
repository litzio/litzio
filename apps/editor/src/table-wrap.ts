import { useSyncExternalStore } from "react";
import { readTableWrapDefault, readTableWrapDocuments, writeTableWrapPreferences } from "./preferences.ts";

let defaultValue = readTableWrapDefault();
let documents = readTableWrapDocuments();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(): boolean {
  const saved = writeTableWrapPreferences(defaultValue, documents);
  for (const listener of listeners) listener();
  return saved;
}
export function useTableWrap(path: string): boolean {
  return useSyncExternalStore(subscribe, () => documents[path] ?? defaultValue);
}
export function useTableWrapDefault(): boolean {
  return useSyncExternalStore(subscribe, () => defaultValue);
}
export function setTableWrap(path: string, value: boolean): boolean {
  if (value === defaultValue) delete documents[path];
  else documents[path] = value;
  return publish();
}
export function setTableWrapDefault(value: boolean): boolean {
  defaultValue = value;
  documents = Object.fromEntries(Object.entries(documents).filter(([, choice]) => choice !== value));
  return publish();
}
export function relocateTableWrap(previous: string, next: string): void {
  const choice = documents[previous];
  delete documents[previous];
  delete documents[next];
  if (choice !== undefined && choice !== defaultValue) documents[next] = choice;
  publish();
}
