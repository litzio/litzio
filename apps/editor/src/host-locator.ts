/** UI registration identity, independent of daemon lifetime and filesystem syntax. */
export const LOCAL_HOST_ID = "local";
export type HostLocator = { hostId: string; path: string };
export function locatorKey({ hostId, path }: HostLocator): string {
  return JSON.stringify([hostId, path]);
}
export function sameLocator(a: HostLocator, b: HostLocator): boolean {
  return a.hostId === b.hostId && a.path === b.path;
}
/** Storage protocol boundary: never infer a Host for an old path-only record. */
export function isHostLocator(value: unknown): value is HostLocator {
  const locator = value as HostLocator | null;
  return !!locator && typeof locator.hostId === "string" && locator.hostId.length > 0 &&
    typeof locator.path === "string" && locator.path.length > 0;
}
