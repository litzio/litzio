import type { FileActionContribution } from "@litzio/plugin-sdk";

export function matchesFileAction(action: FileActionContribution, path: string): boolean {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && action.extensions.includes(name.slice(dot).toLowerCase());
}
