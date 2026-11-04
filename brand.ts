/** Packager-owned product identity. Internal @litzio/* packages and Host APIs never depend on it. */
export const brand = {
  name: { en: "Litzio", ko: "Litzio" },
  icons: {
    svg: "apps/desktop/assets/litzio-E.svg",
    darkSvg: "apps/desktop/assets/litzio-E-dark.svg",
    smallSvg: "apps/desktop/assets/litzio-E-small.svg",
    smallDarkSvg: "apps/desktop/assets/litzio-E-small-dark.svg",
    ico: "apps/desktop/assets/icon.ico",
  },
  appId: "io.github.litzio.litzio",
  appName: "litzio",
  executableName: "Litzio",
  protocol: "litzio",
  // appName is also the one-click install directory and updater-cache prefix.
  folders: { desktopData: "litzio", cli: "litzio", shared: ".litzio" },
  cliCommand: "litzio",
  storagePrefix: "litzio",
  updates: {
    repository: { owner: "litzio", repo: "litzio" },
    channels: { stable: "latest", beta: "beta" },
  },
} as const;

export function productName(language: string = "en"): string {
  return language.startsWith("ko") ? brand.name.ko : brand.name.en;
}
