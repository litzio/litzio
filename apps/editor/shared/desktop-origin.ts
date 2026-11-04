/** One app-owned origin; never a TCP Host authority or a configurable remote origin. */
export const DESKTOP_ORIGIN = "litzio://app";
export const DESKTOP_ENTRY = `${DESKTOP_ORIGIN}/index.html`;

export function trustedDesktopUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "litzio:" && url.host === "app" && !url.username && !url.password;
  } catch { return false; }
}
