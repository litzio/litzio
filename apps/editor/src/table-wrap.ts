import { useSyncExternalStore } from "react";
import { locatorKey } from "./host-locator.ts";
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
export function useTableWrap(path: string, hostId = "local"): boolean {
  return useSyncExternalStore(subscribe, () => documents[locatorKey({ hostId, path })] ?? defaultValue);
}
export function useTableWrapDefault(): boolean {
  return useSyncExternalStore(subscribe, () => defaultValue);
}
export function setTableWrap(path: string, value: boolean, hostId = "local"): boolean {
  path = locatorKey({ hostId, path });
  if (value === defaultValue) delete documents[path];
  else documents[path] = value;
  return publish();
}
export function setTableWrapDefault(value: boolean): boolean {
  defaultValue = value;
  documents = Object.fromEntries(Object.entries(documents).filter(([, choice]) => choice !== value));
  return publish();
}
export function relocateTableWrap(previous: string, next: string, hostId = "local"): void {
  previous = locatorKey({ hostId, path: previous });
  next = locatorKey({ hostId, path: next });
  const choice = documents[previous];
  delete documents[previous];
  delete documents[next];
  if (choice !== undefined && choice !== defaultValue) documents[next] = choice;
  publish();
}
