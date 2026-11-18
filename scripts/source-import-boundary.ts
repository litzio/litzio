import path from "node:path";

export function checkSourceImportBoundary(file: string, source: string): void {
  if (file.startsWith("packages/plugin-sdk/src/")) {
    if (/from\s*["'](?:react|@tiptap|prosemirror|[^"']*apps\/)/.test(source)) throw new Error(`Plugin SDK UI dependency: ${file}`);
    return;
  }

  for (const match of source.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)) {
    const specifier = match[1]!;
    if (specifier.startsWith(".") && path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).startsWith("plugins/")) throw new Error(`Application imports plugin source: ${file}`);
  }
  if (file.startsWith("packages/core/src/") && /(?:from|import\()\s*["'](?:@tiptap|prosemirror|[^"']*apps\/editor)/.test(source)) throw new Error(`Core editor dependency: ${file}`);
}
