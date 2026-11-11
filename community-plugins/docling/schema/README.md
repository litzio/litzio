# Official DoclingDocument schema

- Upstream: [docling-core v2.93.0, docs/DoclingDocument.json](https://github.com/docling-project/docling-core/blob/v2.93.0/docs/DoclingDocument.json).
- Converted document version: **1.10.0**. Both fixed LSR and NIST conversion records name docling-core 2.93.0.
- License: MIT, copyright 2024 International Business Machines. The unmodified upstream [LICENSE](LICENSE) is included.
- `DoclingDocument-1.10.0.json` is the unmodified upstream artifact. SHA-256: `ea0bdb4974e234ca4854335e5191f8cf9437fa26c35b4ea3e1eebf273f664a60`.
- `document.d.ts` is generated from that schema with `json-schema-to-typescript@15.0.4`, a development tool, using the command below. No Python model or venv is a runtime dependency.

```sh
pnpm dlx json-schema-to-typescript@15.0.4 -i community-plugins/docling/schema/DoclingDocument-1.10.0.json -o community-plugins/docling/schema/document.d.ts
```

Runtime validation uses the SDK's existing Ajv boundary with JSON Schema 2020-12 support. Pydantic's Python named regex groups `(?P<name>...)` are translated to ECMAScript `(?<name>...)` in the in-memory schema only. The schema's `path` format denotes a Python Path string, with no extra syntax restriction; standard formats such as URI are validated by ajv-formats. Defaults/coercion/removal of additional properties are disabled. Original document bytes and the vendored schema are never normalized or rewritten. The plugin separately rejects any document version other than 1.10.0; schema-valid dangling ownership/reading references also fail extraction.
