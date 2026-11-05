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
  await page.getByRole("button", { name: "Drive fixture", exact: true }).click();
  if (registered.secrets.supported) {
    await page.getByLabel("pat: Not configured", { exact: true }).fill("browser-isolated-secret");
    await page.getByRole("button", { name: "Save secret", exact: true }).click();
    await expect(page.getByLabel("pat: Configured", { exact: true })).toHaveValue("");
    const status = pluginFixture.cli(["plugins", "secret-status", "fixture.drive"]);
    expect(status.secrets.declarations[0].configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("browser-isolated-secret");
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      if (screenshots) await page.screenshot({ path: `tmp/plugin-stage1/secrets-${width}.png` });
    }
    await page.getByRole("button", { name: "Delete secret", exact: true }).click();
    await expect(page.getByLabel("pat: Not configured", { exact: true })).toHaveValue("");
  } else {
    await expect(page.getByText("Plugin secrets require a Windows Host", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save secret", exact: true })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  pluginFixture.cli(["plugins", "trust", "fixture.drive", "--digest", registered.digest]);
  await page.reload(); await openSettings();
  await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Plugin running$/ })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(true);
  await expect(page.getByText("Community plugin", { exact: true })).toBeVisible();
  await expect(page.getByText("Account: Fixture account (Isolated fixture)", { exact: true })).toBeVisible();
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('[data-testid="settings-dialog"]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const name = await page.getByRole("heading", { name: "Drive fixture", exact: true }).boundingBox();
    const toggle = await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).boundingBox();
    expect(toggle.x).toBeGreaterThan(name.x + name.width);
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
  await expect(page.getByRole("status").filter({ hasText: /^Plugin disabled$/ })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("OneDrive", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sidebar-folder-name")).toContainText("fixture");
  pluginFixture.cli(["plugins", "unregister", "fixture.drive"]);
  expect(pluginFixture.cli(["plugins", "list"]).plugins.some(p => p.id === "fixture.drive")).toBe(false);
  if (screenshots && pluginFixture.realSnapshot) {
    // Manual real-plugin evidence only. Node CLI reads the isolated Host, then masks
    // account/path metadata before any real data reaches browser tracing or screenshots.
    const snapshot = pluginFixture.realSnapshot();
    await page.route("**/api/plugins", route => route.fulfill({ json: snapshot }));
    await page.route("**/api/host-capabilities", route => route.fulfill({ json: { fileDeletion: "trash", identity: { runAs: "Example User" } } }));
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await openSettings();
    await expect(page.getByRole("heading", { name: "OneDrive", exact: true })).toBeVisible();
    for (const width of [1440, 640]) {
      if (width === 640) { await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); }); await page.reload(); await page.getByRole("button", { name: "설정", exact: true }).click(); await page.getByRole("button", { name: "플러그인", exact: true }).click(); }
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `tmp/plugin-stage1/onedrive-settings-${width}.png` });
      await page.keyboard.press("Escape");
      await page.screenshot({ path: `tmp/plugin-stage1/onedrive-source-${width}.png` });
      if (width === 1440) await openSettings();
    }
  }

}
