import { knownFolders, type FolderTreeState } from "./folder-tree.ts";
import { splitDocumentPath } from "./document-path.ts";
import type { NewDestination } from "./NewDialog.tsx";

/** Unique New locations in opened-folder/tree order; the first tree supplies each path's label. */
export function newDestinations(trees: readonly FolderTreeState[]): NewDestination[] {
  const seen = new Set<string>();
  return trees.flatMap(tree => {
    const separator = tree.root.includes("\\") ? "\\" : "/";
    const name = splitDocumentPath(tree.root).name || tree.root;
    const prefix = tree.root.endsWith(separator) ? tree.root : tree.root + separator;
    const base = name.endsWith(separator) ? name : name + separator;
    return knownFolders(tree).filter(path => {
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    }).map(path => ({ path, label: path === tree.root ? name : base + path.slice(prefix.length) }));
  });
}

