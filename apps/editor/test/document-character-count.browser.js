// The tab action counts applied edits without saving and shows the localized tooltip.
async (page, { openPath, expect, textFixture, screenshots }) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const initial = await (await page.request.get(`${origin}/api/document`, { headers: { Connection: "close" } })).json();
  const sep = initial.path.includes("\\") ? "\\" : "/";
  const root = initial.path.split(sep).slice(0, -4).join(sep);
  const source = "---\nlitzio: 1\ntitle: Character count example\n---\n\n# Count example\n\nHello world.\n";
  textFixture.replaceNative(source);
  await openPath(page, [root, "tmp", "text-mode", "native.md"].join(sep));

  const tooltip = page.getByTestId("character-count-tooltip");
  const count = async (language = "en") => {
    const command = page.getByRole("button", { name: language === "ko" ? "글자 수 보기" : "Count characters", exact: true });
    await command.hover();
    await expect(tooltip).toBeVisible();
    await command.click();
  };
  await count();
  await expect(tooltip).toContainText("25 with spaces, 23 without spaces");
  await page.getByRole("paragraph").filter({ hasText: "Hello world." }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" OK");
  await count();
  await expect(tooltip).toContainText("28 with spaces, 25 without spaces");
  await expect(page.getByTestId("save")).toHaveAttribute("data-save-state", "unsaved");

  if (screenshots) {
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: /^(Settings|설정)$/ }).click();
      await page.getByTestId("ui-language").selectOption("ko");
      await page.getByTestId("theme").selectOption(theme);
      await page.locator('[data-tab-id="settings"] .document-tab-close').click();
      await page.evaluate(() => document.fonts.ready);
      for (const width of [1920, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.mouse.move(width / 2, 500);
        await expect(tooltip).toHaveCount(0);
        await page.screenshot({ path: `tmp/character-count-captures/tab-${width}-${theme}.png` });
        if (width === 1920) {
          await count("ko");
          await expect(tooltip).toContainText("공백 포함 28자 · 공백 제외 25자");
          await page.screenshot({ path: `tmp/character-count-captures/tooltip-${width}-${theme}.png` });
        }
      }
    }
  }
}
