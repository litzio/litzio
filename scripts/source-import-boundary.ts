import path from "node:path";
import { importSpecifiers } from "./editor-engine-boundary.ts";

function isWithin(file: string, directory: string): boolean {
  return file === directory || file.startsWith(directory + "/");
}

function isEditorHost(file: string): boolean {
  return isWithin(file, "apps/editor/server") || isWithin(file, "apps/editor/shared");
}

export function checkSourceImportBoundary(file: string, source: string): void {
  const owner = file.split("/").slice(0, 2).join("/");
  const sdk = owner === "packages/plugin-sdk";

  for (const specifier of importSpecifiers(source)) {
    const target = /^(?:\.\.?(?:\/|$))/.test(specifier)
      ? path.posix.join(path.posix.dirname(file), specifier)
      : undefined;
    const dependency = `${file} imports ${specifier}`;
    if (sdk && (/^(?:react|@tiptap|prosemirror)/.test(specifier) || target && isWithin(target, "apps"))) {
      throw new Error(`Plugin SDK UI dependency; use UI-neutral APIs in the SDK: ${dependency}`);
    }
    if (target === undefined) continue;
    if (isEditorHost(file) && isWithin(target, "apps/editor/src")) {
      throw new Error(`Host and shared code must keep UI-independent dependencies in apps/editor/server or apps/editor/shared: ${dependency}`);
    }
    if (isWithin(target, owner)) continue;
    // AGENTS.md defines the root brand.ts as shared product configuration.
    if (target === "brand.ts") continue;
    // ADR-0016 allows CLI and Desktop to reuse the shared Host implementation.
    if ((isWithin(file, "packages/cli/src") || isWithin(file, "apps/desktop/src")) && isWithin(target, "apps/editor")) {
      if (isEditorHost(target)) continue;
      throw new Error(`CLI and Desktop may reuse Host handlers only via apps/editor/server or apps/editor/shared: ${dependency}`);
    }
    throw new Error(`Relative import crosses a package boundary; use the target package's public exports: ${dependency}`);
  }
}
