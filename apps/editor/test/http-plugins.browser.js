async (page, { expect, pluginFixture, screenshots, openFolderPicker, openDocument, reloadDocument, waitForExplorerLayout }) => {
  const secretSaves = [];
  const saveSecret = async () => {
    const start = Date.now();
    const saved = page.waitForResponse(response => response.url().endsWith("/api/plugins/secrets") && response.request().method() === "POST");
    const refreshed = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().method() === "GET");
    await page.getByRole("button", { name: "Save secret", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    const storedMs = Date.now() - start;
    expect((await refreshed).ok()).toBe(true);
    secretSaves.push({ storedMs, refreshedMs: Date.now() - start });
  };
  const openSettings = async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
  };
  const expandExplorer=page.getByRole('button',{name:/^(Expand Explorer|탐색기 펼치기)$/});
  const showExplorer = async () => {
    await waitForExplorerLayout(page);
    if (await expandExplorer.isVisible()) await expandExplorer.click();
  };
  const openScreen = async name => {
    await showExplorer();
    await page.locator('.sidebar').getByRole('button',{name,exact:true}).click();
  };
  await openSettings();
  pluginFixture.cli(["plugins", "register", pluginFixture.directory]);
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  await page.getByTestId("folder-path").fill(pluginFixture.directory);
  // Deliver the same list refresh used after settings changes while the user is
  // editing the picker. A changed description proves the refreshed React UI committed.
  await page.route("**/api/plugins", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    const value = await response.json();
    value.plugins.find(plugin => plugin.id === "fixture.drive").description = "Refreshed during plugin draft";
    await route.fulfill({ response, json: value });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect(page.locator('section[aria-label="Drive fixture"] .settings-description').first()).toHaveText("Refreshed during plugin draft");
  await expect(page.getByTestId("folder-path")).toHaveValue(pluginFixture.directory);
  await expect(page.getByTestId("folder-path")).toBeFocused();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).toBeEnabled();
  const registered = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
  expect(registered.running).toBe(false);
  await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
  if (registered.secrets.supported) {
    await page.getByLabel("Access token: Not configured", { exact: true }).fill("browser-isolated-secret");
    await saveSecret();
    await expect(page.getByLabel("Access token: Configured", { exact: true })).toHaveValue("");
    const status = pluginFixture.cli(["plugins", "secret-status", "fixture.drive"]);
    expect(status.secrets.declarations[0].configured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("browser-isolated-secret");
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      if (screenshots) {
        // Before baseline removes only the new additive secret section; no source checkout changes.
        const section = await page.getByRole("region", { name: "Plugin secrets", exact: true }).elementHandle();
        await section.evaluate(el => { el.style.display = "none"; });
        await page.screenshot({ path: `tmp/plugin-stage1/secrets-before-${width}.png` });
        await section.evaluate(el => { el.style.removeProperty("display"); });
        await page.screenshot({ path: `tmp/plugin-stage1/secrets-${width}.png` });
      }
    }
    pluginFixture.corruptSecret();
    await page.reload(); await openSettings();
    await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
    await expect(page.getByLabel("Access token: Unavailable or damaged", { exact: true })).toHaveValue("");
    await expect(page.getByText("Unable to read this secret. Delete or replace it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete secret", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Delete secret", exact: true }).click();
    await expect(page.getByLabel("Access token: Not configured", { exact: true })).toHaveValue("");
    await page.getByLabel("Access token: Not configured", { exact: true }).fill("browser-repaired-secret");
    await saveSecret();
    await expect(page.getByLabel("Access token: Configured", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Delete secret", exact: true }).click();
    await expect(page.getByLabel("Access token: Not configured", { exact: true })).toHaveValue("");
  } else {
    await expect(page.getByText("Plugin secrets require a Windows Host", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save secret", exact: true })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  const toggle = page.getByRole("switch", { name: "Enable Drive fixture", exact: true });
  await toggle.click();
  const confirmation = page.getByRole("dialog", { name: "Trust and enable Drive fixture?", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(toggle).not.toBeChecked();
  const cancelled = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
  expect(cancelled.trusted).toBe(false); expect(cancelled.enabled).toBe(false);
  await toggle.click();
  await expect(confirmation).toBeVisible();
  if (screenshots) for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await page.keyboard.press("Escape");
    await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
    await page.reload();
    await page.getByRole("button", { name: width === 640 ? "설정" : "Settings", exact: true }).click();
    await page.getByRole("button", { name: width === 640 ? "플러그인" : "Plugins", exact: true }).click();
    await page.screenshot({ path: `tmp/plugin-list-1379/list-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
    await page.getByRole("button", { name: width === 640 ? "Drive fixture 설정" : "Drive fixture settings", exact: true }).click();
    await page.getByText(width === 640 ? "상세 정보" : "Details", { exact: true }).click();
    await page.screenshot({ path: `tmp/plugin-list-1379/detail-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
    await page.keyboard.press("Escape");
    await page.getByRole("switch", { name: width === 640 ? "Drive fixture 활성화" : "Enable Drive fixture", exact: true }).click();
    await page.screenshot({ path: `tmp/plugin-list-1379/confirmation-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
  }
  if (screenshots) {
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload(); await openSettings(); await toggle.click();
  }
  const approved = page.waitForRequest(request => request.url().endsWith("/api/plugins") && request.method() === "POST" && request.postDataJSON()?.action === "enable" && request.postDataJSON()?.trust === true);
  await confirmation.getByRole("button", { name: "Trust and enable", exact: true }).click();
  expect((await approved).postDataJSON().registrationId).toBe(registered.registrationId);
  await expect(confirmation).not.toBeVisible();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: /^Plugin running$/ })).toHaveCount(0);
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(true);
  const reloaded = pluginFixture.cli(["plugins", "reload", "fixture.drive"]);
  expect(reloaded.receipt.operation).toBe("plugins.reload");
  expect(reloaded.plugins.find(p => p.id === "fixture.drive").running).toBe(true);
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('[data-testid="settings-dialog"]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const name = await page.getByRole("heading", { name: "Drive fixture", exact: true }).boundingBox();
    const toggle = await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).boundingBox();
    expect(toggle.x).toBeGreaterThan(name.x + name.width);
    if (screenshots) await page.screenshot({ path: `tmp/plugin-stage1/settings-${width}.png` });
  }
  const cliSettings = pluginFixture.cli(["plugins", "settings", "fixture.drive", "--file", pluginFixture.otherJobInput]);
  expect(cliSettings.plugins.find(p => p.id === "fixture.drive").status.message).toBe("CLI connection");
  await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
  await expect(page.getByLabel("Connection label", { exact: true })).toBeEnabled();
  await page.getByLabel("Connection label", { exact: true }).fill("UI connection");
  await page.getByLabel("Connection label", { exact: true }).press("Tab");
  await expect.poll(() => pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive")?.status?.message).toBe("UI connection");
  if (registered.secrets.supported) {
    await page.getByLabel("Access token: Not configured", { exact: true }).fill("enabled-isolated-secret");
    await saveSecret();
    await expect(page.getByLabel("Access token: Configured", { exact: true })).toHaveValue("");
    let live = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
    expect(live.status.message).toBe("Secret applied");
    expect(JSON.stringify(live)).not.toContain("enabled-isolated-secret");
    pluginFixture.cli(["plugins", "secret-delete", "fixture.drive", "pat"]);
    live = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
    expect(live.running).toBe(true);
    expect(live.status.message).toBe("UI connection");
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".plugin-settings-dialog")).not.toBeVisible();
  // Escape exits Settings after the nested dialog has finished closing.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
  await openDocument(page, pluginFixture.document);
  const beforeDisable = await page.locator(".tiptap").first().innerText();
  await openSettings();
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).toBeChecked();
  // A stale completed GET must not undo a later disable mutation.
  let release, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/plugins", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    held = true;
    await gate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect.poll(() => held).toBe(true);
  await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).not.toBeChecked();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(false);
  const delivered = page.waitForResponse(r => r.url().endsWith("/api/plugins") && r.request().method() === "GET");
  release(); await (await delivered).finished();
  await page.unrouteAll({ behavior: "wait" });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.locator(".tiptap").first().innerText()).toBe(beforeDisable);
  await expect(page.locator(".sidebar-folder-name")).toHaveText("fixture");
  await openSettings();
  await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
  // Observe every DOM commit, including the still-mounted closing dialog. A final
  // count alone could miss a duplicate notice that disappears with the portal.
  await page.evaluate(() => {
    window.pluginNoticeMaximum = 0;
    window.pluginNoticeObserver = new MutationObserver(() => {
      const count = [...document.querySelectorAll('[role="alert"]')].filter(node => node.textContent === "The selected plugin is no longer available.").length;
      window.pluginNoticeMaximum = Math.max(window.pluginNoticeMaximum, count);
    });
    window.pluginNoticeObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  pluginFixture.cli(["plugins", "unregister", "fixture.drive"]);
  expect(pluginFixture.cli(["plugins", "list"]).plugins.some(p => p.id === "fixture.drive")).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect(page.getByRole("dialog", { name: "Drive fixture", exact: true })).not.toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "The selected plugin is no longer available." })).toBeVisible();
  expect(await page.evaluate(() => { window.pluginNoticeObserver.disconnect(); return window.pluginNoticeMaximum; }), "A closing dialog must not duplicate the selected-plugin notice").toBe(1);
  await page.keyboard.press("Escape");
}
