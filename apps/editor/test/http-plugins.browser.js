async (page, { expect, pluginFixture, screenshots, openFolderPicker }) => {
  const openSettings = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
  };
  await openSettings();
  await page.getByLabel("Local plugin artifact", { exact: true }).fill(pluginFixture.directory);
  await page.getByRole("button", { name: "Register plugin", exact: true }).click();
  await expect(page.getByText("Trust required", { exact: false })).toBeVisible();
  const registered = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
  expect(registered.running).toBe(false);
  pluginFixture.cli(["plugins", "trust", "fixture.drive", "--digest", registered.digest]);
  await page.reload(); await openSettings();
  await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).click();
  await expect(page.getByText("Running · Community · Trusted", { exact: true })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(true);
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('[data-testid="settings-dialog"]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/plugin-stage1/settings-${width}.png` });
  }
  // Escape exits Settings without modifying the document or opened folders.
  await page.keyboard.press("Escape");
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await expect(page.getByLabel("OneDrive", { exact: true })).toBeVisible();
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    if (screenshots) await page.screenshot({ path: `tmp/plugin-stage1/decoration-${width}.png` });
  }
  await openSettings();
  await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).click();
  await expect(page.getByText("Disabled · Community · Trusted", { exact: true })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("OneDrive", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sidebar-folder-name")).toContainText("fixture");
}
