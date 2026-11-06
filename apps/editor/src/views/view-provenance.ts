import type { AssistantQueryView } from "@litzio/core/views-v2";
export type ViewRootBinding = { hostId: string; id: string; path: string };
type Provenance = AssistantQueryView["sources"]["stats"]["provenance"][number];
/** Identity comes from trusted app/Host context. Never infer rootId from a path or Host URL. */
export function resolveViewDocument(
  source: Provenance,
  roots: readonly ViewRootBinding[],
) {
  if (source.kind !== "document") return;
  const root = roots.find(
    (root) => root.hostId === source.hostId && root.id === source.rootId,
  );
  if (!root) return;
  const separator = root.path.includes("\\") ? "\\" : "/";
  return {
    hostId: source.hostId,
    path:
      root.path.replace(/[\\/]+$/, "") +
      separator +
      source.path.split("/").join(separator),
  };
}
