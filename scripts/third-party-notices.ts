import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const noticeName = /^(license|licence|copying|notice)([._-]|$)/i;
const manifest = (directory: string) => JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));

/** Skip internal metadata such as dist/cjs/package.json, which is not a package identity. */
export function packageDirectory(input: string): string | undefined {
  for (let current = path.dirname(path.resolve(input)); current !== path.dirname(current); current = path.dirname(current)) {
    if (existsSync(path.join(current, "package.json"))) {
      const pkg = manifest(current);
      if (pkg.name && pkg.version) return realpathSync(current);
    }
  }
}

/** Bundle discoveries and dependency traversal have independent lifetimes. */
export function collectPackages(inputs: string[], roots: string[] = []): Set<string> {
  const packages = new Set(inputs.map(packageDirectory).filter((dir): dir is string => !!dir));
  const visited = new Set<string>();
  function visit(directory: string) {
    const real = realpathSync(directory);
    if (visited.has(real)) return;
    visited.add(real);
    packages.add(real);
    const pkg = manifest(real);
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })) {
      for (let current = real; current !== path.dirname(current); current = path.dirname(current)) {
        const candidate = path.join(current, "node_modules", name);
        if (existsSync(path.join(candidate, "package.json"))) { visit(candidate); break; }
      }
    }
  }
  roots.forEach(visit);
  return packages;
}

export function packageNotices(packages: Iterable<string>): string {
  const supplements = JSON.parse(readFileSync(path.join(repo, "scripts/licenses/supplements.json"), "utf8")) as Record<string, { file: string; source: string }>;
  return [...packages].sort((a, b) => `${manifest(a).name}@${manifest(a).version}`.localeCompare(`${manifest(b).name}@${manifest(b).version}`)).map(directory => {
    const pkg = manifest(directory);
    const identity = `${pkg.name}@${pkg.version}`;
    const files = readdirSync(directory).filter(name => noticeName.test(name) && statSync(path.join(directory, name)).isFile()).sort();
    let body = files.map(name => { const text = readFileSync(path.join(directory, name), "utf8"); return text.trim() ? `${name}\n${text}` : ""; }).filter(Boolean).join("\n");
    if (!body.trim()) {
      const supplement = supplements[identity];
      if (supplement) body = `Source: ${supplement.source}\n${readFileSync(path.join(repo, "scripts/licenses", supplement.file), "utf8")}`;
      else if (identity === "mdast@3.0.0" || identity === "hast@1.0.0") body = "Metadata-only npm package: no executable, data or type source files are distributed by this package. No package code is bundled.";
      else if (pkg.name.startsWith("@litzio/")) body = readFileSync(path.join(repo, "LICENSE"), "utf8");
      else throw new Error(`Missing license text: ${identity}; add a version-pinned upstream notice`);
    }
    return `${identity} (${typeof pkg.license === "string" ? pkg.license : "see package license"})\n${body}`;
  }).join("\n\n--------------------\n\n");
}
