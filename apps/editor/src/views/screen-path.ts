/** UI scope only. The Host still resolves real paths and enforces its filesystem boundary. */
export function isScreenPath(path: string, roots: readonly string[], allowRoot = false): boolean {
  if (typeof path !== "string") return false;
  const value = path.replaceAll("\\", "/").replace(/\/$/, "");
  if (!value || value.split("/").some(part => part === "." || part === "..")) return false;
  return roots.some(root => {
    const base = root.replaceAll("\\", "/").replace(/\/$/, "");
    return allowRoot && value === base || value.startsWith(base + "/");
  });
}
