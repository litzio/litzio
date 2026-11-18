import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x } from "tar";
import { parseGitHubSource, validateManifest, type GitHubTrack } from "@litzio/plugin-sdk";

/** A public GitHub plugin folder. `ref` is the branch, tag or commit named in the address. */
export type GitHubLocation = { owner: string; repo: string; ref?: string; path: string };
/** What a track points at now: the commit to download and that plugin folder's Git tree. */
export type GitHubTarget = { track: GitHubTrack; commit: string; tree: string; tag?: string; id?: string; name?: string; version: string | null };
/** `release` and `branch` say which tracks can install this folder. */
export type GitHubPlugin = { path: string; source: string; id?: string; name?: string; version?: string | null; release: boolean; branch: boolean; error?: string };
/** Listing more manifests than this cannot prove which folder is the only one with an ID. */
const LISTED_PLUGINS = 50;

export class GitHubSourceError extends Error { override name = "GitHubSourceError"; }
const MISSING = "GitHub repository, ref or plugin folder not found. Only public repositories are supported.";

type TreeEntry = { path: string; type: string; sha: string };
const segments = (value: string) => value.split("/").map(encodeURIComponent).join("/");

/**
 * Unauthenticated reads of public repositories. Tests and isolated Hosts may point
 * `LITZIO_GITHUB_API_URL` at a fake GitHub; the default is the public API.
 */
export class GitHubSource {
  constructor(private readonly api = process.env.LITZIO_GITHUB_API_URL || "https://api.github.com") {}

  private async request(route: string, timeout = 15_000) {
    let response: Response;
    try {
      response = await fetch(`${this.api.replace(/\/+$/, "")}/${route}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "litzio-plugin-host", "X-GitHub-Api-Version": "2022-11-28" }, signal: AbortSignal.timeout(timeout) });
    } catch { throw new GitHubSourceError("Unable to reach GitHub. Check the network connection."); }
    if (response.ok) return response;
    if ((response.status === 403 || response.status === 429) && (response.headers.get("x-ratelimit-remaining") === "0" || response.status === 429)) {
      throw new GitHubSourceError("GitHub rate limit reached. Try again later.");
    }
    if (response.status === 404 || response.status === 422) throw new GitHubSourceError(MISSING);
    throw new GitHubSourceError(`GitHub request failed (HTTP ${response.status}).`);
  }
  private async json<T>(route: string): Promise<T> { return await (await this.request(route)).json() as T; }
  private async optional<T>(route: string): Promise<T | undefined> {
    try { return await this.json<T>(route); }
    catch (error) { if (error instanceof GitHubSourceError && error.message === MISSING) return undefined; throw error; }
  }
  private repoRoute(location: Pick<GitHubLocation, "owner" | "repo">, rest: string) {
    return `repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}${rest ? `/${rest}` : ""}`;
  }

  /** Split `/tree/<ref>/<folder>` by asking GitHub which prefix names a ref, shortest first. */
  async locate(address: string): Promise<GitHubLocation> {
    const parsed = parseGitHubSource(address);
    if (!parsed) throw new GitHubSourceError("Expected a public GitHub address: https://github.com/<owner>/<repo> or https://github.com/<owner>/<repo>/tree/<ref>/<folder>");
    const { owner, repo, tree } = parsed;
    if (!tree.length) {
      await this.json(this.repoRoute(parsed, ""));
      return { owner, repo, path: "" };
    }
    for (let length = 1; length <= tree.length; length++) {
      const ref = tree.slice(0, length).join("/");
      if (await this.optional(this.repoRoute(parsed, `commits/${segments(ref)}`))) return { owner, repo, ref, path: tree.slice(length).join("/") };
    }
    throw new GitHubSourceError(MISSING);
  }

  private async commit(location: GitHubLocation, ref: string) {
    const value = await this.json<{ sha: string; commit: { tree: { sha: string } } }>(this.repoRoute(location, `commits/${segments(ref)}`));
    return { commit: value.sha, root: value.commit.tree.sha };
  }
  private async tree(location: GitHubLocation, sha: string, recursive = false) {
    const value = await this.json<{ tree: TreeEntry[]; truncated?: boolean }>(this.repoRoute(location, `git/trees/${sha}${recursive ? "?recursive=1" : ""}`));
    return value;
  }
  /** The plugin folder's own tree, so a release of another folder in the repository is not a new version. */
  private async folder(location: GitHubLocation, root: string) {
    let sha = root, entries = (await this.tree(location, root)).tree;
    for (const name of location.path ? location.path.split("/") : []) {
      const next = entries.find(entry => entry.path === name && entry.type === "tree");
      if (!next) return undefined;
      sha = next.sha; entries = (await this.tree(location, sha)).tree;
    }
    return { sha, entries };
  }
  private async manifest(location: GitHubLocation, blob: string) {
    const value = await this.json<{ content: string; encoding: string }>(this.repoRoute(location, `git/blobs/${blob}`));
    return validateManifest(JSON.parse(Buffer.from(value.content, value.encoding === "base64" ? "base64" : "utf8").toString("utf8")));
  }
  /** Formal latest release only: GitHub excludes drafts, prereleases and bare tags. */
  private async latestRelease(location: GitHubLocation) {
    return (await this.optional<{ tag_name: string }>(this.repoRoute(location, "releases/latest")))?.tag_name;
  }
  private async defaultBranch(location: GitHubLocation) {
    return (await this.json<{ default_branch: string }>(this.repoRoute(location, ""))).default_branch;
  }
  private async at(location: GitHubLocation, track: GitHubTrack, ref: string, tag?: string): Promise<GitHubTarget | undefined> {
    const { commit, root } = await this.commit(location, ref);
    const folder = await this.folder(location, root);
    const manifest = folder?.entries.find(entry => entry.path === "litzio-plugin.json" && entry.type === "blob");
    if (!folder || !manifest) return undefined;
    let id: string | undefined, name: string | undefined, version: string | null = null;
    try { const value = await this.manifest(location, manifest.sha); id = value.id; name = value.name; version = value.version ?? null; } catch { /* applying reports manifest diagnostics */ }
    return { track, commit, tree: folder.sha, ...(tag ? { tag } : {}), ...(id ? { id, name } : {}), version };
  }
  /** A target, or why this exact folder has no plugin on the track. */
  private async lookup(location: GitHubLocation, track?: GitHubTrack): Promise<GitHubTarget | string> {
    if (track !== "branch") {
      const tag = await this.latestRelease(location);
      const released = tag ? await this.at(location, "release", tag, tag) : undefined;
      if (released) return released;
      if (track === "release") return tag ? "The latest GitHub release does not contain this plugin folder." : "This repository has no formal GitHub release. Track the branch instead.";
    }
    return await this.at(location, "branch", location.ref ?? await this.defaultBranch(location)) ?? "No litzio-plugin.json in this GitHub folder.";
  }

  /**
   * The current target of a track in a known plugin folder. Without a track, a formal
   * release that contains the folder is preferred; otherwise the address's branch or the default branch.
   */
  async target(location: GitHubLocation, track?: GitHubTrack): Promise<GitHubTarget> {
    const target = await this.lookup(location, track);
    if (typeof target === "string") throw new GitHubSourceError(target);
    return target;
  }

  /**
   * The one folder-resolution path for install, check and update. A folder address is
   * checked directly in the chosen track's tree, so a release-only folder resolves and a
   * large repository needs no listing. Only a repository or parent address is listed; it
   * names one plugin when exactly one folder below it (with `id`, that ID) has a manifest.
   */
  async resolve(address: string, options: { track?: GitHubTrack; id?: string } = {}): Promise<{ location: GitHubLocation; target: GitHubTarget } | { location: GitHubLocation; candidates: GitHubPlugin[] }> {
    const location = await this.locate(address);
    const exact = await this.lookup(location, options.track);
    if (typeof exact !== "string") {
      if (options.id && exact.id !== options.id) throw new GitHubSourceError("The plugin at this GitHub address has a different ID.");
      return { location, target: exact };
    }
    const { plugins, limited } = await this.plugins(location);
    if (limited) throw new GitHubSourceError("This address holds too many plugins to choose from. Use the exact plugin folder address.");
    const candidates = plugins.filter(plugin => !plugin.error && plugin.path !== location.path && (!options.id || plugin.id === options.id));
    if (!candidates.length) throw new GitHubSourceError(options.id && plugins.length ? "No folder with this plugin ID at this GitHub address. Use its exact folder address." : exact);
    if (candidates.length > 1) {
      if (options.id) throw new GitHubSourceError("Several folders at this GitHub address hold this plugin. Use its exact folder address.");
      return { location, candidates };
    }
    const folder = { ...location, path: candidates[0]!.path };
    return { location: folder, target: await this.target(folder, options.track) };
  }

  /** Plugin folders on the address's branch (or the default branch), marking those in the latest formal release. */
  /**
   * What the settings search shows. An exact folder is checked in each track's own tree,
   * like install, so it reports the tracks that can really install it; other addresses are listed.
   */
  async find(address: string): Promise<{ release?: string; plugins: GitHubPlugin[]; limited?: boolean }> {
    const location = await this.locate(address);
    const release = await this.lookup(location, "release"), branch = await this.lookup(location, "branch");
    const found = typeof release !== "string" ? release : typeof branch !== "string" ? branch : undefined;
    if (!found) return this.plugins(location);
    return { ...(typeof release !== "string" ? { release: release.tag } : {}), plugins: [{ path: location.path, source: address, ...(found.id ? { id: found.id, name: found.name } : {}),
      version: found.version, release: typeof release !== "string", branch: typeof branch !== "string" }] };
  }

  async plugins(location: GitHubLocation): Promise<{ release?: string; plugins: GitHubPlugin[]; limited?: boolean }> {
    const ref = location.ref ?? await this.defaultBranch(location);
    const listed = async (sha: string) => {
      const { tree, truncated } = await this.tree(location, sha, true);
      if (truncated) throw new GitHubSourceError("This repository is too large to list. Use the exact plugin folder address.");
      const prefix = location.path ? `${location.path}/` : "";
      return tree.filter(entry => entry.type === "blob" && (entry.path === `${prefix}litzio-plugin.json` || entry.path.startsWith(prefix) && entry.path.endsWith("/litzio-plugin.json")) &&
        !entry.path.split("/").includes("node_modules"));
    };
    const all = await listed((await this.commit(location, ref)).root), found = all.slice(0, LISTED_PLUGINS);
    const tag = await this.latestRelease(location);
    const released = new Set(tag ? (await listed((await this.commit(location, tag)).root)).map(entry => entry.path) : []);
    const plugins = await Promise.all(found.map(async entry => {
      const folder = path.posix.dirname(entry.path), folderPath = folder === "." ? "" : folder;
      // Each ref and folder segment is encoded, so the address resolves back to this folder.
      const tree = [...ref.split("/"), ...folderPath ? folderPath.split("/") : []].map(encodeURIComponent).join("/");
      const source = `https://github.com/${location.owner}/${location.repo}${location.ref || folderPath ? `/tree/${tree}` : ""}`;
      const base = { path: folderPath, source, release: released.has(entry.path), branch: true };
      try { const manifest = await this.manifest(location, entry.sha); return { ...base, id: manifest.id, name: manifest.name, version: manifest.version ?? null }; }
      catch (error) { if (error instanceof GitHubSourceError) throw error; return { ...base, error: "Invalid litzio-plugin.json" }; }
    }));
    return { ...(tag ? { release: tag } : {}), plugins, ...(all.length > found.length ? { limited: true } : {}) };
  }

  /** Extract only the plugin folder of one commit into an empty staging directory. */
  async download(location: GitHubLocation, commit: string, staging: string) {
    const response = await this.request(this.repoRoute(location, `tarball/${commit}`), 120_000);
    if (!response.body) throw new GitHubSourceError("GitHub returned an empty archive.");
    await mkdir(staging, { recursive: true });
    const folder = location.path ? location.path.split("/") : [];
    let bytes = 0, linked = false;
    const count = new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; callback(null, chunk); } });
    // GitHub archives hold one top folder, `<owner>-<repo>-<sha>/`.
    const extract = x({ cwd: staging, strict: true, strip: 1 + folder.length, filter: (file, entry) => {
      const parts = file.replace(/\/+$/, "").split("/").slice(1);
      if (parts.length <= folder.length || folder.some((name, index) => parts[index] !== name)) return false;
      const type = (entry as { type?: string }).type;
      if (type === "SymbolicLink" || type === "Link") { linked = true; return false; }
      return true;
    } });
    try { await pipeline(Readable.fromWeb(response.body as never), count, extract); }
    catch (error) { if (error instanceof GitHubSourceError) throw error; throw new GitHubSourceError("Unable to read the GitHub archive."); }
    if (linked) throw new GitHubSourceError("Artifact must contain real files, not linked dependencies");
    return { bytes };
  }
}
