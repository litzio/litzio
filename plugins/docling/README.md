# Docling plugin

Default-included trusted Litzio plugin. Document interpretation and UI live here;
document semantics remain in the public Core API. No application/Host/CLI source
is imported. Build/test tooling and contracts come from `@litzio/plugin-api`.

From this folder, after the workspace dependency install:

```sh
pnpm build
pnpm typecheck
pnpm test
```

Build emits `dist/manifest.json`, `worker.cjs`, `host.cjs`, `ui.mjs`, `ui.css`.
An optional first build argument selects another output directory. Tests use
saved fixtures or a synthetic HTTP service; they never launch Docling.

The [Host contract and extraction steps](../../docs/design/plugin-runtime-v1.md#later-extraction)
describe moving this whole folder later. API publication, official distribution,
signing/install flows and an actual repository split remain separate work.

`src/conversion` and `src/comparison` depend only on themselves, public APIs and
`src/shared` file formats. Plugin entry points compose them and the dashboard.
`scripts/check-boundaries.ts` verifies this direction, including erased imports,
as part of builds and boundary tests. They exchange only published conversion
folder files; neither feature imports the other.
