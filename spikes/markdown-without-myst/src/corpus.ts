/** Measurement inputs. Everything comes from the repository or is synthetic. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { synthetic } from "../../../packages/core/test/local-write-corpus.ts";

const ROOT = new URL("../../../", import.meta.url);
const HEADER = "---\nlitzio: 1\n---\n\n";
export type Input = { name: string; source: string };

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Repository Markdown at HEAD bytes (not the checkout's line-ending conversion). */
export function trackedMarkdown(): Input[] {
  return git(["ls-files", "*.md"]).split("\n").filter(Boolean)
    .filter(file => !file.startsWith("spikes/"))
    .map(file => ({ name: file, source: git(["show", `HEAD:${file}`]) }));
}

const writerBytes = () => JSON.parse(readFileSync(new URL("packages/core/test/fixtures/writer-bytes.master.json", ROOT), "utf8")) as {
  fixtures: Record<string, { input: string }>; generated: Record<string, string | null>;
};

// The ADR-0024 complex-table case from packages/core/test/table.test.ts.
const COMPLEX_TABLE = [
  "---", "litzio: 1", "---", "", ":::{table} **Operating limits** {ref}`conditions`",
  ":name: limits", ":enumerator: A.3", "", "<table>", "<thead>", "<tr>",
  '<th colspan="2"><p>Limits</p></th>', "</tr>", "<tr>", "<th><p>Item</p></th>",
  "<th><p>Conditions</p></th>", "</tr>", "</thead>", "<tbody>", "<tr>",
  '<td rowspan="2" style="text-align: right"><p>Voltage<br>rating</p><p>A &amp; B</p></td>',
  '<td><ol start="2"><li>Nominal<ul><li>Maximum</li></ul></li></ol></td>', "</tr>", "<tr>",
  '<td><p><span data-myst="math">x &lt; y</span> <span data-myst="numref">limits</span> <span data-myst="footnote">test</span> <span data-myst="cite:t">alpha,beta</span></p></td>',
  "</tr>", "</tbody>", "</table>", "", "a. Measured at full load.", "", "b. At sea level, see {cite}`alpha`.",
  ":::", "", "[^test]: In the test report.", "",
].join("\n");

/** Native documents: Core fixtures, saved-byte regression inputs, samples/templates and tracked native files. */
export function nativeDocuments(): Input[] {
  const seen = new Map<string, string>();
  for (const [name, { input }] of Object.entries(writerBytes().fixtures)) seen.set(name, input.startsWith("---\n") ? input : HEADER + input);
  for (const { name, source } of trackedMarkdown()) {
    if (/^---\r?\nlitzio: 1\r?\n/.test(source) && !seen.has(name)) seen.set(name, source);
  }
  seen.set("core-test:complex-table", COMPLEX_TABLE);
  seen.set("spike:feature-matrix", readFileSync(new URL("../fixtures/feature-matrix.myst.md", import.meta.url), "utf8"));
  return [...seen].map(([name, source]) => ({ name, source }));
}

/** Canonical outputs of the #1845/#1846 generated line-start and context cases. */
export function generatedDocuments(): Input[] {
  return Object.entries(writerBytes().generated).filter(([, output]) => output !== null)
    .map(([name, output]) => ({ name: `generated:${name}`, source: HEADER + output! }));
}

export function syntheticDocuments(sizes = [300, 2300, 5000]): Input[] {
  return sizes.map(size => ({ name: `synthetic-${size}`, source: synthetic(size) }));
}
