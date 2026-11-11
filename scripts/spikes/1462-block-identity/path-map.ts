// Only the seven tested operations; top-level snapshot paths, not durable identity.
export type Origin = { ref: string; regions: unknown[] };
export type Link = { origins: Origin[]; estimated: boolean };
export type Paths = Map<number, Link>;
export const union = (a: Link, b: Link): Link => ({
  origins: [...new Map([...a.origins, ...b.origins].map(o => [o.ref, o])).values()],
  estimated: a.estimated || b.estimated,
});

// BEGIN measured A
export function shift(paths: Paths, start: number, delta: number): Paths {
  return new Map([...paths].map(([p, link]) => [p >= start ? p + delta : p, link]));
}
export function split(paths: Paths, at: number): Paths {
  const next = shift(paths, at + 1, 1);
  const link = { ...paths.get(at)!, estimated: true };
  next.set(at, link); next.set(at + 1, structuredClone(link));
  return next;
}
export function merge(paths: Paths, at: number): Paths {
  const next = new Map(paths);
  next.set(at - 1, union(paths.get(at - 1)!, paths.get(at)!));
  next.delete(at);
  return shift(next, at + 1, -1);
}
export function move(paths: Paths, from: number, to: number): Paths {
  return new Map([...paths].map(([p, link]) => [p === from ? to
    : from < to && p > from && p <= to ? p - 1
    : from > to && p >= to && p < from ? p + 1 : p, link]));
}
export function remove(paths: Paths, at: number, deleted: Link[]): Paths {
  const next = new Map(paths);
  deleted.push(next.get(at)!); next.delete(at);
  return shift(next, at + 1, -1);
}
// Text correction, conversion and cell correction keep the path map unchanged.
// END measured A
