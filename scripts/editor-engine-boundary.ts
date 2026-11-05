/** Editor-engine imports (including type imports and re-exports) stay in Editor. */
export function checkEditorEngineBoundary(file: string, source: string): void {
  if (!file.startsWith("apps/editor/") && /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:@tiptap\/|prosemirror(?:-|\/|["']))/.test(source)) {
    throw new Error(`Editor engine dependency outside apps/editor: ${file}`);
  }
}
