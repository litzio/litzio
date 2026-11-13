import { useState } from "react";
import { getEditableDocument, parse } from "@litzio/core";
import { DocumentViewScope } from "../views/screen-document-view.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";
import type { ScreenDocumentViewState } from "@litzio/plugin-sdk";
import type { HostClient } from "../host-client.ts";

const source = "---\nlitzio: 1\ntitle: Document view example\n---\n\nSaved snapshots use the same renderer as document tabs.\n\n| Item | Value |\n| --- | --- |\n| Example | 18 |\n\n$$\nE=mc^2\n$$\n";
const document = getEditableDocument(parse(source));
const revision = "a".repeat(64), path = "/example/report.md";

/** Synthetic saved snapshot; the gallery never reads or writes a user's files. */
export function DocumentViewExample() {
  const [reads, setReads] = useState(0), [extraFolder, setExtraFolder] = useState(false);
  const [client] = useState<HostClient>(() => ({ assertCurrent() {}, url: path => path, crossOrigin: undefined,
    async request() { setReads(value => value + 1); return Response.json({ kind: "native", path, source, document, revision }); } }));
  const [reloadKey, setReload] = useState(0), [stale, setStale] = useState(false);
  const [state, setState] = useState<ScreenDocumentViewState>();
  return <DocumentViewScope.Provider value={{ client, roots: extraFolder ? ["/example", "/unrelated"] : ["/example"] }}>
    <ui.ScreenLayout title="Document view" description="Synthetic saved snapshot. The application renderer owns text, tables, equations and references.">
      <ui.Toolbar><ui.Button variant="outline" onClick={() => setStale(value => !value)}>Toggle stale target</ui.Button>
        <ui.Button variant="outline" onClick={() => setReload(value => value + 1)}>Read again</ui.Button>
        <ui.Button variant="outline" aria-pressed={extraFolder} onClick={() => setExtraFolder(value => !value)}>Toggle unrelated folder</ui.Button>
        <span aria-label="Document reads">{reads}</span><span role="status">{state?.state}</span></ui.Toolbar>
      <ui.DocumentView path={path} height={480} reloadKey={reloadKey} target={{ revision: stale ? "b".repeat(64) : revision, path: document.blocks.find(block => block.block === "table")!.path }} onStateChange={setState} />
    </ui.ScreenLayout>
  </DocumentViewScope.Provider>;
}
