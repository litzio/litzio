// The command counts applied edits without saving and shows the localized dialog.
async (page, { openPath, expect, textFixture, screenshots }) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const initial = await (await page.request.get(origin + "/api/document", { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes("\\") ? "\\" : "/";
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  textFixture.replaceNative("---\nlitzio: 1\ntitle: Character count example\n---\n\n# Count example\n\nHello world.\n");
  await openPath(page, [root, "tmp", "text-mode", "native.md"].join(sep));

  const result = page.getByTestId("character-count-result");
  const prepareCount = async (label = "Character count") => {
    await page.keyboard.press("ControlOrMeta+/");
    const input = page.getByRole("combobox");
    await input.fill("> " + label);
    await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
    return input;
  };
  const count = async label => (await prepareCount(label)).press("Enter");
  const close = async () => {
    await page.keyboard.press("Escape");
    await expect(result).toHaveCount(0);
  };
  await count();
  await expect(result).toHaveText("25 with spaces · 23 without spaces");
  await close();
  await page.getByRole("paragraph").filter({ hasText: "Hello world." }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" OK");
  await count();
  await expect(result).toHaveText("28 with spaces · 25 without spaces");
  await close();
  await expect(page.getByTestId("save")).toHaveAttribute("data-save-state", "unsaved");

  if (screenshots) {
    const configure = async (language, theme) => {
      await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
      await page.getByTestId("ui-language").selectOption(language);
      await page.getByTestId("theme").selectOption(theme);
      await page.locator('[data-tab-id="settings"] .document-tab-close').click();
      await page.evaluate(() => document.fonts.ready);
    };
    await page.setViewportSize({ width: 1920, height: 900 });
    for (const theme of ["light", "dark"]) {
      await configure("ko", theme);
      await count("글자 수");
      await expect(result).toHaveText("공백 포함 28자 · 공백 제외 25자");
      await page.screenshot({ path: "tmp/character-count-captures/dialog-1920-" + theme + ".png" });
      await close();
    }

    await configure("en", "light");
    await openPath(page, [root, "tmp", "character-count", "large.md"].join(sep));
    await page.getByRole("paragraph").filter({ hasText: "한글 문서 확인." }).first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" X");
    const milliseconds = [];
    for (let sample = 0; sample < 3; sample++) {
      const input = await prepareCount();
      await page.evaluate(() => {
        window.characterCountTime = new Promise(resolve => {
          document.addEventListener("keydown", () => {
            const start = performance.now();
            const observer = new MutationObserver(() => {
              if (!document.querySelector('[data-testid="character-count-result"]')) return;
              observer.disconnect();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          }, { capture: true, once: true });
        });
      });
      await input.press("Enter");
      await expect(result).toHaveText("45,002 with spaces · 35,001 without spaces", { timeout: 20_000 });
      milliseconds.push(await page.evaluate(() => window.characterCountTime));
      await close();
    }
    return { blocks: 5000, milliseconds };
  }
}
