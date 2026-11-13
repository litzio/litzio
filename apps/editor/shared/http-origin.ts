/** Exact HTTP origin only, also safe to interpolate into CSP source lists. */
export function exactHttpOrigin(value: string): string {
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(value) || value !== value.trim() || /[\s\\*;"'<>]/.test(value)) throw new Error("Expected an exact http(s) origin.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Expected an exact http(s) origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || value.includes("?") || value.includes("#")) throw new Error("Expected an http(s) origin without credentials, path, query or fragment.");
  // URL parsing can decode host escapes and map Unicode (for example %2a or ＊) to
  // CSP syntax. Validate the canonical source too, before it can reach disk/CSP.
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(url.origin) || /[\s\\*;"'<>]/.test(url.origin)) throw new Error("Expected an exact http(s) origin.");
  return url.origin;
}
