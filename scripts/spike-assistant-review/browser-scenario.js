async (page, { activeDocument, openPath, expect }) => {
  // The document paths are supplied by the local runner, only editor content is captured.
  const entries = __REVIEW_ENTRIES__;
  const results = [];
  for (const entry of entries) {
    try {
      await openPath(page, entry.file);
      const editor = activeDocument(page).locator(".document-editor");
      await expect(editor).toBeVisible();
      const blocks = editor.locator(":scope > *");
      const blockCount = await blocks.count();
      // Traverse the rendered editor from top to bottom to trigger lazy figure loading.
      await editor.evaluate(async element => {
        const panel = element.closest(".document-scroll");
        if (!panel) return;
        for (let offset = 0; offset <= panel.scrollHeight; offset += panel.clientHeight) {
          panel.scrollTop = offset;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      });
      await editor.getByTestId("figure-image").evaluateAll(images => Promise.all(images.map(img => img.decode().catch(() => {}))));
      const display = await editor.evaluate(element => ({
        headings: element.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        listItems: element.querySelectorAll("li").length,
        tables: element.querySelectorAll("table").length,
        invalidMath: element.querySelectorAll(".katex-error").length,
        equationNumbers: Array.from(element.querySelectorAll(".equation-row"), row => ({
          rendered: row.querySelector('[data-testid="equation-number"]')?.textContent ?? null,
          formula: row.querySelector("annotation")?.textContent ?? null,
        })),
        codeBlocks: Array.from(element.querySelectorAll("pre"), block => block.textContent?.slice(0, 120)),
        images: Array.from(element.querySelectorAll('[data-testid="figure-image"]'), img => ({ loaded: img.complete && img.naturalWidth > 0 })),
        imageErrors: element.querySelectorAll('[data-testid="figure-image-error"]').length,
      }));
      const anchors = [
        [".document-editor", "Review participants"],
        ["h1,h2,h3,h4,h5,h6", "Parameter settings and expressions"],
        ["h1,h2,h3,h4,h5,h6", "Derived measures and literal transcription"],
        ["h1,h2,h3,h4,h5,h6", "Verification graph and units"],
        ["h1,h2,h3,h4,h5,h6", "Conditional values and note scope"],
      ];
      for (const [i, [selector, text]] of anchors.entries()) {
        const anchor = selector === ".document-editor"
          ? editor.getByText(text, { exact: false }).first()
          : editor.locator(selector).filter({ hasText: text }).first();
        if (!await anchor.count()) continue;
        await anchor.evaluate(node => node.scrollIntoView({ block: "start" }));
        const clip = await editor.evaluate(element => {
          const editorRect = element.getBoundingClientRect();
          const viewport = element.closest(".document-scroll")?.getBoundingClientRect() ?? editorRect;
          const x = Math.max(0, Math.ceil(Math.max(viewport.left, editorRect.left) - 18));
          const y = Math.max(0, Math.ceil(viewport.top));
          return { x, y, width: Math.floor(Math.min(innerWidth, viewport.right, editorRect.right + 18) - x),
            height: Math.floor(Math.min(innerHeight, viewport.bottom) - y) };
        });
        await page.screenshot({ path: entry.output + "-" + i + ".png", clip });
      }
      results.push({ name: entry.name, blockCount, display });
    } catch (error) {
      results.push({ name: entry.name, error: String(error).split("\n")[0] });
    }
  }
  expect(results.filter(r => r.error)).toEqual([]);
  return results;
}
