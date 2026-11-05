# Missing package notice supplements

`supplements.json` maps exact installed package versions to preserved upstream
text. The collector uses these only when the npm package has no nonempty root
LICENSE/LICENCE/COPYING/NOTICE file. Unknown missing text fails the build.

The MyST, micromark, rehype, esbuild and data-uri-to-buffer commit IDs come from
the corresponding npm version metadata's `gitHead`. Each source URL is pinned
to that commit; README files are preserved where the notice is inline. MyST
includes the 11 reported `myst-*` / `markdown-it-myst` packages plus `myst-spec`,
`myst-cli-utils` and `simple-validators` reached by the current dependency graph.
The JSON mapping is the exact package/version list, rather than an expected count.

Other verified mappings:

- `hast-util-is-body-ok-link@2.0.0` and
  `html-whitespace-sensitive-tag-names@2.0.0`: package manifests at the pinned
  rehype-minify commit still declare those exact versions; the root license applies.
- `boolbase@1.0.0`: upstream commit adding the ISC notice explicitly for Felix
  Boehm (npm's original version has no gitHead or separate notice).
- `eastasianwidth@0.2.0`: upstream's later complete notice for 0.2.0, identified
  by [licensing notes](https://github.com/komagata/eastasianwidth/blob/f42b1e7b2a403d2050dda1141211b4e198e50e70/LICENSE-NOTES.md).
  Its original version commit is `b89f04d44dc786885615e94cd6e2ba1ef7866fa4`.
- SPDX identifier data: preserve the exact version's README licensing statements,
  including the CC-BY attribution/source link and CC0 link, rather than inventing MIT terms.
- Citation date/name: preserve the existing distributed Bibliography notice's
  author and explicit absence of an upstream notice; do not infer copyright years.
- `lazy-val@1.0.5`: the exact version's manifest declares MIT and author Vladimir
  Krivosheev, but neither npm nor its gitHead has a separate notice. Preserve that
  fact with the MIT terms, following the existing Citation date/name treatment;
  this is not an upstream copyright notice or an inferred copyright year.
- Pretendard: reuse the existing 1.3.9 OFL notice.
- shadcn copied UI: notice from `shadcn@4.21.0`'s upstream tag, dereferenced to
  commit `7c9eaba1c0a6404c990c144a654792e3313c650d`. The source notice remains in
  `apps/editor/public/licenses/Shadcn-copied-source.txt` even if npm is removed.

`mdast@3.0.0` and `hast@1.0.0` contain only package metadata/readme, with no code,
data or type source to bundle. The collector records this non-code reason explicitly.
This inventory is deliberately a dependency closure; build/type-only dependencies
can appear without being browser code. It is not a legal compliance certification.

- `@cfworker/json-schema@4.1.6`: npm gitHead `1a0aa37471850c28a4673e12e871e010ea6c26e0`의 루트 `LICENSE.md`를 보존한다. 배포 npm에는 license text가 없어 기존 supplement collector를 사용한다.
