/** Screen interactions; no Host identity, window state or renderer types. */
export type ScreenPickPathInput = { kind: "pdf" | "folder" | "document"; initialPath?: string };
export type ScreenPickedPath = { path: string; kind: ScreenPickPathInput["kind"] };
export type ScreenOpenDocumentResult =
  | { status: "opened"; path: string }
  | { status: "refused"; path: string; message: string };
