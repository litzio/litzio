// Run before styles and the application bundle, including under the production self-only CSP.
// Resolve the first OS choice once, then keep an explicit light/dark preference.
(() => {
  const prefix = decodeURIComponent(document.currentScript.dataset.storagePrefix);
  let page;
  try { page = localStorage.getItem(`${prefix}.pageBackground`); } catch { /* Storage is optional. */ }
  document.documentElement.dataset.page = page === "flat" ? "flat" : "paper";
  let choice;
  try { choice = localStorage.getItem(`${prefix}.theme`); } catch { /* Storage is optional. */ }
  const theme = choice === "light" || choice === "dark" ? choice
    : choice == null && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  if (choice !== "light" && choice !== "dark") {
    try { localStorage.setItem(`${prefix}.theme`, theme); } catch { /* Keep the live choice. */ }
  }
  document.documentElement.dataset.theme = theme;
  // Theme-aware default canvas until the role stylesheet arrives; no duplicated color values.
  document.documentElement.style.colorScheme = theme;
})();
