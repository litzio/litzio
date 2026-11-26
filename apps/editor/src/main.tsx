import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { themeReady } from "./theme.ts";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "katex/dist/katex.min.css";
import "./index.css";
import "./styles.css";
import "./plugin-settings.css";
import { connectHost } from "./host-capabilities.ts";
import { connectDesktop } from "./desktop-connection.ts";
const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

// Spike #2020: development-only switch between highlight set entry drafts (?highlight=a|b).
if (import.meta.env.DEV) {
  const draft = new URLSearchParams(window.location.search).get("highlight");
  if (draft) document.documentElement.dataset.highlightDraft = draft;
}
void connectDesktop();
void connectHost();
void themeReady.then(async () => {
  const Surface = import.meta.env.DEV && window.location.pathname === "/ui-gallery"
    ? (await import("./dev/ui-gallery.tsx")).UiGallery : App;
  createRoot(root).render(
    <StrictMode>
      <TooltipProvider>
        <Surface />
      </TooltipProvider>
    </StrictMode>,
  );
});
