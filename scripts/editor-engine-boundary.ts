export function importSpecifiers(source: string): string[] {
  return Array.from(
    source.matchAll(/\b(?:from\b\s*|import\b\s*(?:\(\s*)?|require\b\s*\(\s*)(["'])([^"'\r\n]+)\1/g),
    match => match[2]!,
  );
}

/** Editor-engine imports (including type imports and re-exports) stay in Editor. */
export function checkEditorEngineBoundary(file: string, source: string): void {
  if (!file.startsWith("apps/editor/") && importSpecifiers(source).some(specifier => /^(?:@tiptap\/|prosemirror(?:-|\/|$))/.test(specifier))) {
    throw new Error(`Editor engine dependency outside apps/editor; use editor-neutral Core APIs: ${file}`);
  }
}
