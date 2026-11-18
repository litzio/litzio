import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { c } from "tar";

type GitObject = { type: "blob"; content: Buffer } | { type: "tree"; entries: { name: string; type: "blob" | "tree"; sha: string }[] };
type Release = { tag: string; prerelease?: boolean; draft?: boolean };

/**
 * The subset of the public GitHub REST API the plugin Host reads. Objects use Git's
 * blob/tree hashing, so a folder that did not change keeps its tree SHA across commits.
 */
export class FakeGitHub {
  private objects = new Map<string, GitObject>();
  private commits = new Map<string, { tree: string; files: Record<string, string> }>();
  private repos = new Map<string, { defaultBranch: string; refs: Map<string, string>; releases: Release[] }>();
  private server?: Server;
  /** Routes requested, for asserting what a check needed. */
  readonly requests: string[] = [];
  failures = new Map<RegExp, { status: number; headers?: Record<string, string> }>();
  url = "";

  private store(object: GitObject, body: Buffer) {
    const sha = createHash("sha1").update(Buffer.concat([Buffer.from(`${object.type} ${body.length}\0`), body])).digest("hex");
    this.objects.set(sha, object);
    return sha;
  }
  private tree(files: Record<string, string>, prefix = ""): string {
    const names = new Map<string, "blob" | "tree">();
    for (const file of Object.keys(files)) if (file.startsWith(prefix)) {
      const [name, ...rest] = file.slice(prefix.length).split("/");
      names.set(name!, rest.length ? "tree" : "blob");
    }
    const entries = [...names].sort(([a], [b]) => a < b ? -1 : 1).map(([name, type]) => ({ name, type,
      sha: type === "tree" ? this.tree(files, `${prefix}${name}/`) : this.store({ type: "blob", content: Buffer.from(files[`${prefix}${name}`]!) }, Buffer.from(files[`${prefix}${name}`]!)) }));
    const body = Buffer.concat(entries.map(entry => Buffer.concat([Buffer.from(`${entry.type === "tree" ? "40000" : "100644"} ${entry.name}\0`), Buffer.from(entry.sha, "hex")])));
    return this.store({ type: "tree", entries }, body);
  }

  repository(owner: string, repo: string, defaultBranch = "main") {
    const state = { defaultBranch, refs: new Map<string, string>(), releases: [] as Release[] };
    this.repos.set(`${owner}/${repo}`, state);
    return {
      /** Replace a branch's whole content; returns the new commit SHA. */
      push: (branch: string, files: Record<string, string>) => {
        const tree = this.tree(files);
        const commit = createHash("sha1").update(`${tree}:${this.commits.size}`).digest("hex");
        this.commits.set(commit, { tree, files: { ...files } });
        state.refs.set(branch, commit);
        return commit;
      },
      tag: (name: string, commit: string) => { state.refs.set(name, commit); },
      /** GitHub's latest release ignores drafts and prereleases. */
      release: (tag: string, options: Omit<Release, "tag"> = {}) => { state.releases.unshift({ tag, ...options }); },
    };
  }

  async start() {
    this.server = createServer((request, response) => {
      void this.handle(request.url ?? "/").then(result => {
        response.writeHead(result.status, { "Content-Type": result.type ?? "application/json", ...result.headers });
        response.end(result.body);
      }, error => { response.writeHead(500); response.end(String(error)); });
    });
    await new Promise<void>(resolve => this.server!.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this.url;
  }
  close() { return new Promise<void>(resolve => this.server ? this.server.close(() => resolve()) : resolve()); }

  private async handle(url: string): Promise<{ status: number; body?: string | Buffer; type?: string; headers?: Record<string, string> }> {
    this.requests.push(url);
    for (const [pattern, failure] of this.failures) if (pattern.test(url)) return { status: failure.status, headers: failure.headers, body: "{}" };
    const { pathname, searchParams } = new URL(url, "http://fake");
    const parts = pathname.split("/").slice(1).map(decodeURIComponent);
    const missing = { status: 404, body: JSON.stringify({ message: "Not Found" }) };
    if (parts[0] !== "repos") return missing;
    const repo = this.repos.get(`${parts[1]}/${parts[2]}`);
    if (!repo) return missing;
    const json = (value: unknown) => ({ status: 200, body: JSON.stringify(value) });
    const [kind, ...rest] = parts.slice(3);
    if (kind === undefined) return json({ default_branch: repo.defaultBranch, private: false });
    const commitOf = (ref: string) => repo.refs.get(ref) ?? (this.commits.has(ref) ? ref : undefined);
    if (kind === "commits") {
      const commit = commitOf(rest.join("/"));
      return commit ? json({ sha: commit, commit: { tree: { sha: this.commits.get(commit)!.tree } } }) : { status: 422, body: "{}" };
    }
    if (kind === "releases" && rest[0] === "latest") {
      const latest = repo.releases.find(release => !release.draft && !release.prerelease);
      return latest ? json({ tag_name: latest.tag }) : missing;
    }
    if (kind === "git" && rest[0] === "trees") {
      const object = this.objects.get(rest[1]!);
      if (object?.type !== "tree") return missing;
      const list = (entries: typeof object.entries, prefix: string): { path: string; type: string; sha: string }[] => entries.flatMap(entry => {
        const own = { path: `${prefix}${entry.name}`, type: entry.type, sha: entry.sha };
        const child = this.objects.get(entry.sha);
        return searchParams.get("recursive") && child?.type === "tree" ? [own, ...list(child.entries, `${own.path}/`)] : [own];
      });
      return json({ sha: rest[1], tree: list(object.entries, ""), truncated: false });
    }
    if (kind === "git" && rest[0] === "blobs") {
      const object = this.objects.get(rest[1]!);
      return object?.type === "blob" ? json({ content: object.content.toString("base64"), encoding: "base64" }) : missing;
    }
    if (kind === "tarball") {
      const commit = this.commits.get(rest.join("/"));
      if (!commit) return missing;
      const work = mkdtempSync(path.join(os.tmpdir(), "litzio-fake-github-")), top = `${parts[1]}-${parts[2]}-${rest[0]!.slice(0, 7)}`;
      try {
        for (const [file, content] of Object.entries(commit.files)) {
          mkdirSync(path.dirname(path.join(work, top, file)), { recursive: true });
          writeFileSync(path.join(work, top, file), content);
        }
        const chunks: Buffer[] = [];
        for await (const chunk of c({ gzip: true, cwd: work, portable: true }, [top])) chunks.push(Buffer.from(chunk as Buffer));
        return { status: 200, body: Buffer.concat(chunks), type: "application/gzip" };
      } finally { rmSync(work, { recursive: true, force: true }); }
    }
    return missing;
  }
}

/** Browser fixture: two plugin folders, with only Alpha in the latest formal release. */
export async function browserGitHub() {
  const github = new FakeGitHub(), repo = github.repository("litzio-fixtures", "plugins");
  const plugin = (folder: string, name: string, version: string) => ({
    [`plugins/${folder}/litzio-plugin.json`]: JSON.stringify({ id: `fixture.${folder}`, name, version, entry: "host.mjs", screen: "screen.jsx" }),
    [`plugins/${folder}/screen.jsx`]: "export default function Screen(){return null}",
    [`plugins/${folder}/host.mjs`]: "export function activate(){return {operations:{},status:()=>({available:true,message:'Ready'}),dispose(){}}}",
  });
  const released = repo.push("main", plugin("alpha", "Alpha fixture", "1.0.0"));
  repo.tag("v1.0.0", released); repo.release("v1.0.0");
  repo.push("main", { ...plugin("alpha", "Alpha fixture", "1.0.0"), ...plugin("beta", "Beta fixture", "0.2.0") });
  await github.start();
  return github;
}
