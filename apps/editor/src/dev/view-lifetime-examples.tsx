import { useMemo, useRef, useState } from "react";
import {
  operationQueryViewSchema,
  assistantQueryViewSchema,
} from "@litzio/core/views-v2";
import { Views } from "../views/Views.tsx";
import { ViewWorkspace } from "../views/ViewWorkspace.tsx";
import { createHostClient } from "../host-client.ts";
import { Button } from "../components/ui/button.tsx";

const operation = {
  plugin: "fixture.lifecycle",
  operation: "fixture.lifecycle.read",
  version: 1,
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", title: "Text" } },
    additionalProperties: false,
  },
  rowSchema: { label: { type: "string" as const, label: "Label" } },
};
const query = (text: string) =>
  operationQueryViewSchema.parse({
    kind: "litzio-view",
    schemaVersion: 2,
    catalog: "litzio-v2",
    profile: "query",
    owner: "fixture.lifecycle",
    title: `예시: Query ${text}`,
    refresh: "manual",
    sources: {
      stats: {
        kind: "operation",
        operation: operation.operation,
        version: 1,
        args: { text },
      },
    },
    form: {
      component: "InputForm",
      source: "stats",
      fields: [{ component: "TextInput", field: "text" }],
      submit: { component: "SubmitButton", label: "Search" },
    },
    layout: {
      component: "Panel",
      direction: "vertical",
      children: [
        {
          component: "Table",
          title: "예시: Query rows",
          source: "stats",
          data: "/rows",
          columns: ["label"],
        },
      ],
    },
  });
const first = query("alpha"),
  second = query("beta");
const generated = assistantQueryViewSchema.parse({
  kind: "litzio-view",
  schemaVersion: 2,
  catalog: "litzio-v2",
  profile: "query",
  owner: "fixture.lifecycle",
  title: "예시: Temporary data",
  refresh: "assistant",
  sources: {
    stats: {
      kind: "assistant",
      generatedAt: "2026-11-06T00:00:00.000Z",
      rowSchema: operation.rowSchema,
      rows: [{ label: "예시: Retained generation" }],
      provenance: [
        { kind: "reference", label: "예시: Reference", refId: "reference-one" },
      ],
    },
  },
  layout: first.layout,
});
const screen = {
  plugin: "fixture.lifecycle",
  id: "screen",
  title: "예시: Screen",
  icon: "Table",
  defaultViewIds: ["first"],
  primary: true,
};
/** Production components with an in-memory HostClient; no data request leaves the gallery. */
export function ViewLifetimeExamples() {
  const [view, setView] = useState(first),
    [offline, setOffline] = useState(false);
  const release = useRef<(() => void) | undefined>(undefined),
    calls = useRef(0);
  const client = useMemo(
    () => ({
      ...createHostClient("/"),
      async request(_path: string, init?: RequestInit) {
        const body = JSON.parse(String(init?.body));
        let extra: unknown = {};
        if (body.action === "catalog")
          extra = {
            catalog: { operations: [operation] },
            screens: [screen],
            views: [
              {
                plugin: screen.plugin,
                id: "first",
                title: "예시: Default query",
                definition: first,
              },
            ],
          };
        if (body.action === "list") extra = { favourites: [] };
        if (body.action === "run") {
          calls.current++;
          if (calls.current === 1)
            await new Promise<void>((resolve) => {
              release.current = resolve;
            });
          extra = {
            rows: [{ label: body.view.sources.stats.args.text }],
            fields: { label: "Label" },
          };
        }
        return Response.json({
          ...(extra as object),
          receipt: {
            requestId: `fixture-${calls.current}`,
            operation: `view.${body.action}`,
            version: 1,
            scope: "folder",
            outcome: "success",
            timestamp: "2026-11-06T00:00:00.000Z",
          },
        });
      },
    }),
    [],
  );
  return (
    <section aria-label="예시: View lifecycle" className="ui-gallery-section">
      <h2>예시: View lifecycle</h2>
      <Button size="sm" onClick={() => setView(second)}>
        Replace definition
      </Button>
      <Button size="sm" onClick={() => release.current?.()}>
        Resolve previous query
      </Button>
      <Button size="sm" onClick={() => setOffline((v) => !v)}>
        Toggle availability
      </Button>
      <Views
        unavailable={offline}
        tab={{ id: "replacement", hostId: "local", root: "documents", view }}
        client={client}
        roots={["documents"]}
        onRoot={() => {}}
        onOpen={() => {}}
      />
      <ViewWorkspace
        id="workspace"
        hostId="local"
        root="documents"
        owner="fixture.lifecycle"
        screen={screen}
        view={generated}
        client={client}
        onGenerate={() => {}}
      />
    </section>
  );
}
