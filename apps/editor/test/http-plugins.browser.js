async (page, { expect, pluginFixture, screenshots, openFolderPicker, openDocument, reloadDocument, waitForExplorerLayout }) => {
  const secretSaves = [];
  const secretInput = page.getByLabel("Access token", { exact: true });
  const expectSecretState = async status => {
    await expect(secretInput).toHaveValue("");
    await expect(secretInput).toHaveAccessibleDescription(status);
    await expect(page.locator('.plugin-secret-form').filter({ has: secretInput }).getByRole('status')).toHaveText(status);
  };
  // Deleting a stored secret is destructive: Cancel keeps it and returns focus, Delete removes it.
  const deleteSecret = async ({ cancelFirst = false } = {}) => {
    const trigger = page.getByRole("button", { name: "Delete secret", exact: true });
    const before = cancelFirst ? await secretInput.getAttribute("aria-describedby").then(id => page.locator(`[id="${id}"]`).innerText()) : undefined;
    await trigger.click();
    const confirm = page.getByRole("dialog", { name: "Delete Access token?", exact: true });
    await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    if (cancelFirst) {
      await page.keyboard.press("Escape");
      await expect(confirm).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.locator('.plugin-secret-form').filter({ has: secretInput }).getByRole('status')).toHaveText(before);
      await trigger.click();
    }
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toBeHidden();
  };
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
    await page.getByTestId('activity-bar').getByRole('button',{name,exact:true}).click();
  };
  const observer = await page.context().newPage();
  // Headless Chromium reports every tab focused; explicitly deliver the window
  // lifecycle event after activating the peer, without injecting application state.
  const returnToObserver = async () => {
    await observer.bringToFront();
    await observer.evaluate(() => window.dispatchEvent(new Event('focus')));
  };
  try {
  await observer.goto(page.url());
  await expect(observer.locator('.sidebar')).toBeVisible();
  await page.bringToFront();
  await openSettings();
  pluginFixture.cli(["plugins", "register", pluginFixture.directory]);
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit path", exact: true }).click();
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
  await expect(page.locator('section[aria-label="Drive fixture"] .settings-description').first()).toHaveText("Version 1.2.3 · Local folder · Refreshed during plugin draft");
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
    await expectSecretState("Not configured");
    await secretInput.fill("browser-isolated-secret");
    await saveSecret();
    await expectSecretState("Configured");
    await expect(page.locator(".settings-row").filter({ has: secretInput }).getByRole("status")).toHaveText("Configured");
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
    await expectSecretState("Unavailable or damaged");
    await expect(page.getByText("Unable to read this secret. Delete or replace it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete secret", exact: true })).toBeEnabled();
    await deleteSecret();
    await expectSecretState("Not configured");
    await secretInput.fill("browser-repaired-secret");
    await saveSecret();
    await expectSecretState("Configured");
    await deleteSecret({ cancelFirst: true });
    await expectSecretState("Not configured");
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
    await page.screenshot({ path: `tmp/plugin-list-1379/list-${width}.png`, mask: [page.locator(".activity-bar-status")] });
    await page.getByRole("button", { name: width === 640 ? "Drive fixture 설정" : "Drive fixture settings", exact: true }).click();
    await page.getByText(width === 640 ? "상세 정보" : "Details", { exact: true }).click();
    await page.screenshot({ path: `tmp/plugin-list-1379/detail-${width}.png`, mask: [page.locator(".activity-bar-status")] });
    await page.keyboard.press("Escape");
    await page.getByRole("switch", { name: width === 640 ? "Drive fixture 활성화" : "Enable Drive fixture", exact: true }).click();
    await page.screenshot({ path: `tmp/plugin-list-1379/confirmation-${width}.png`, mask: [page.locator(".activity-bar-status")] });
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
  await expect(page.getByRole("region", {name:"Drive fixture",exact:true}).getByRole("status")).toHaveText("Running");
  const installed = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
  expect(installed.running).toBe(true);
  expect(installed.version).toBe("1.2.3");
  await returnToObserver();
  await expect(observer.getByTestId('activity-bar').getByRole('button', { name: 'Drive fixture', exact: true })).toBeVisible();
  await observer.getByTestId('activity-bar').getByRole('button', { name: 'Drive fixture', exact: true }).click();
  await expect(observer.getByText('Runtime fixture', { exact: true })).toBeVisible();
  const readSnapshot = async value => {
    const screen = observer.getByTestId("view-workspace").filter({ visible: true });
    await screen.getByRole("button", { name: "Read installed value" }).click();
    await expect(screen.locator("output")).toHaveText(value);
  };
  pluginFixture.editSource();
  await expect(observer.getByText('Runtime fixture', { exact: true })).toBeVisible();
  await readSnapshot("Original value");
  await page.bringToFront();
  // Settings finds the edited source and applies it to the same registration.
  const driveRow = page.getByRole("region", { name: "Drive fixture", exact: true });
  await page.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(driveRow.getByRole("status").filter({ hasText: "New content available" })).toBeVisible();
  if (screenshots) {
    for (const [width, theme] of [[1440, "light"], [1440, "dark"], [640, "light"]]) {
      await page.evaluate(theme => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", theme); }, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page.getByRole("button", { name: "플러그인", exact: true }).click();
      await expect(driveRow.getByRole("status").filter({ hasText: "새 내용 있음" })).toBeVisible();
      await page.getByTestId("settings-dialog").screenshot({ path: width === 1440 && theme === "light" ? "docs/design/assets/plugin-local-update-1750/after-1440-light.png" : `tmp/plugin-local-update-1750/after-${width}-${theme}.png` });
    }
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload(); await openSettings();
  }
  const updated = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().postDataJSON()?.action === "update");
  await driveRow.getByRole("button", { name: "Update Drive fixture", exact: true }).click();
  expect((await (await updated).json()).receipt.operation).toBe("plugins.update");
  await expect(driveRow.getByRole("button", { name: "Update Drive fixture", exact: true })).toHaveCount(0);
  await expect(driveRow.getByRole("status")).toHaveText("Running");
  expect(pluginFixture.cli(["plugins", "check-updates", "fixture.drive"]).updates[0].available).toBe(false);
  const measureCenter = async locator => {
    const { y, height } = await locator.boundingBox();
    return y + height / 2;
  };
  const verifyPluginAlignment = async (ko, theme) => {
    const list = page.getByRole("region", { name: ko ? "플러그인" : "Plugins", exact: true });
    const updateName = ko ? "업데이트 확인" : "Check for updates";
    const statusName = ko ? "최신 버전" : "Up to date";
    const listCheck = list.getByRole("button", { name: updateName, exact: true });
    await listCheck.click();
    const latestIn = scope => scope.getByText(statusName, { exact: true });
    await expect(latestIn(list)).toBeVisible();
    const warning = list.getByRole("status").filter({ hasText: ko ? "플러그인은 Host OS 권한으로 실행됩니다" : "Plugins use Host OS permissions" });
    const warningText = warning.getByText(ko ? "플러그인은 Host OS 권한으로 실행됩니다" : "Plugins use Host OS permissions", { exact: true });
    const warningIcon = warning.getByRole("button");
    const warningCenter = await measureCenter(warning);
    const offsets = {
      listStatus: (await measureCenter(latestIn(list))) - (await measureCenter(listCheck)),
      warningText: (await measureCenter(warningText)) - warningCenter,
      warningIcon: (await measureCenter(warningIcon)) - warningCenter,
    };
    const capture = view => page.screenshot({ path: `tmp/plugin-error-row-1909/after-alignment-${view}-1440-${theme}-ko.png`, mask: [page.locator(".activity-bar-status, .document-path, .sidebar-folder-name, .document-start-folder-path, .document-tab-name")] });
    if (screenshots) await capture("list");
    await list.getByRole("button", { name: ko ? "Drive fixture 설정" : "Drive fixture settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Drive fixture", exact: true });
    await expect(latestIn(dialog)).toBeVisible();
    const dialogStatus = await measureCenter(latestIn(dialog));
    const dialogOffsets = {
      dialogCheck: dialogStatus - (await measureCenter(dialog.getByRole("button", { name: updateName, exact: true }))),
      dialogRemove: dialogStatus - (await measureCenter(dialog.getByRole("button", { name: ko ? "제거" : "Remove", exact: true }))),
    };
    if (screenshots) await capture("dialog");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const geometry = { ...offsets, ...dialogOffsets };
    for (const [part, offset] of Object.entries(geometry)) expect(Math.abs(offset), part).toBeLessThan(1);
    return geometry;
  };
  const alignment = {};
  if (screenshots) {
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", theme); }, theme);
      await page.reload();
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page.getByRole("button", { name: "플러그인", exact: true }).click();
      alignment[theme] = await verifyPluginAlignment(true, theme);
    }
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.reload();
    await openSettings();
  } else {
    await verifyPluginAlignment(false, "light");
  }
  await returnToObserver();
  await expect(observer.getByText('Updated runtime fixture', { exact: true })).toBeVisible();
  await readSnapshot("Updated value");
  await page.bringToFront();
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('[data-testid="settings-dialog"]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const name = await page.getByRole("heading", { name: "Drive fixture", exact: true }).boundingBox();
    const toggle = await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).boundingBox();
    if(width === 1440) expect(toggle.x).toBeGreaterThan(name.x + name.width);
    else {
      expect(toggle.y).toBeGreaterThanOrEqual(name.y + name.height);
      const row = page.getByRole("region",{name:"Drive fixture",exact:true}).locator('.shared-row');
      expect(await row.evaluate(n=>Math.abs(n.querySelector('.settings-label').getBoundingClientRect().left-n.querySelector('.settings-row-control').getBoundingClientRect().left)<1)).toBe(true);
    }
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
    await expectSecretState("Not configured");
    await secretInput.fill("enabled-isolated-secret");
    await saveSecret();
    await expectSecretState("Configured");
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
  // The existing open-screen revision observer unmounts disabled code.
  await expect(observer.getByText('Updated runtime fixture', { exact: true })).not.toBeVisible();
  await returnToObserver();
  await expect(observer.getByTestId('activity-bar').getByRole('button', { name: 'Drive fixture', exact: true })).toHaveCount(0);
  await page.bringToFront();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).not.toBeChecked();
  // Alter the installed snapshot, leaving the registered source untouched.
  const pluginList = page.getByRole("region", { name: "Plugins", exact: true });
  const damaged = pluginList.getByRole("region", { name: "fixture.drive", exact: true });
  const details = damaged.getByRole("button", { name: "Plugin status details", exact: true });
  const reinstall = damaged.getByRole("button", { name: "Reinstall", exact: true });
  const responseFor = action => page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().postDataJSON()?.action === action);
  const capture = name => page.screenshot({ path: `tmp/plugin-error-row-1909/${name}.png`, mask: [page.locator(".activity-bar-status, .document-path, .sidebar-folder-name, .document-start-folder-path, .document-tab-name")] });
  if (screenshots) await page.setViewportSize({ width: 1440, height: 900 });

  pluginFixture.changeInstalledCopy();
  const enableFailed = responseFor("enable");
  await toggle.click();
  const rejectedEnable = await enableFailed;
  expect(rejectedEnable.status()).toBe(400);
  expect((await rejectedEnable.json()).artifactChanged).toBe(true);
  await expect(damaged.getByText("Local folder", { exact: true })).toBeVisible();
  await expect(damaged.getByText("No version", { exact: true })).toHaveCount(0);
  await expect(damaged.getByRole("status")).toHaveText("Plugin error");
  await expect(damaged.getByRole("switch")).not.toBeChecked();
  await expect(pluginList.getByRole("alert")).toHaveCount(0);
  const hint = "The installed files differ from when the plugin was installed. Reinstall to restore it from its source.";
  await expect(details).toHaveAccessibleDescription(hint);
  await reinstall.focus();
  await page.keyboard.press("Tab");
  await expect(details).toBeFocused();
  await expect(page.getByText(hint, { exact: true })).toBeVisible();
  if (screenshots) await capture("after-1440-light");

  // A failed request to check the entire list belongs below the list actions.
  const checkUpdates = pluginList.getByRole("button", { name: "Check for updates", exact: true });
  const listFailure = "Fixture update check failed.";
  await page.route("**/api/plugins", route => route.request().postDataJSON()?.action === "check-updates"
    ? route.fulfill({ status: 400, json: { error: listFailure } }) : route.continue());
  await checkUpdates.click();
  const listError = pluginList.getByRole("alert");
  await expect(listError).toHaveText(listFailure);
  const actionsBox = await pluginList.locator(".plugin-actions").boundingBox();
  expect((await listError.boundingBox()).y).toBeGreaterThan(actionsBox.y + actionsBox.height);
  await page.unrouteAll({ behavior: "wait" });
  await checkUpdates.click();
  await expect(listError).toHaveCount(0);
  await expect(checkUpdates).toBeEnabled();

  if (screenshots) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await capture("after-1920-light");
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("button", { name: "플러그인", exact: true }).click();
    const reinstallKo = page.getByRole("region", { name: "fixture.drive", exact: true }).getByRole("button", { name: "다시 설치", exact: true });
    await expect(reinstallKo).toBeVisible();
    await capture("after-1440-dark-ko");
    await page.setViewportSize({ width: 640, height: 900 });
    await capture("after-640-dark-ko");
    await reinstallKo.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByText("설치된 파일이 설치할 때와 다릅니다. 다시 설치하면 출처에서 새로 받아 복구합니다.", { exact: true })).toBeVisible();
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await openSettings();
  }

  await page.route("**/api/plugins", route => route.request().postDataJSON()?.action === "reload"
    ? route.fulfill({ status: 400, json: { error: "Fixture reinstall failed." } }) : route.continue());
  await reinstall.click();
  await expect(details).toHaveAccessibleDescription("Fixture reinstall failed.");
  await expect(pluginList.getByRole("alert")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });

  let releaseReinstall;
  const reinstallGate = new Promise(resolve => { releaseReinstall = resolve; });
  await page.route("**/api/plugins", async route => {
    if (route.request().postDataJSON()?.action === "reload") await reinstallGate;
    await route.continue();
  });
  try {
    const reinstalled = responseFor("reload");
    await reinstall.click();
    await expect(damaged.getByRole("button", { name: "Reinstalling…", exact: true })).toBeDisabled();
    if (screenshots) await capture("reinstalling-1440-light");
    releaseReinstall();
    expect((await (await reinstalled).json()).receipt.operation).toBe("plugins.reload");
    const recovered = pluginList.getByRole("region", { name: "Drive fixture", exact: true });
    await expect(recovered.getByRole("status")).toHaveText("Running");
    await expect(recovered.getByText(/^Version 1\.2\.3 · Local folder/)).toBeVisible();
    await expect(reinstall).toHaveCount(0);
    if (screenshots) await capture("reinstalled-1440-light");
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  } finally {
    releaseReinstall();
    await page.unrouteAll({ behavior: "wait" });
  }
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
  pluginFixture.cli(["plugins", "enable", "fixture.drive"]);
  await returnToObserver();
  await observer.getByTestId('activity-bar').getByRole('button', { name: 'Drive fixture', exact: true }).click();
  await expect(observer.getByText('Updated runtime fixture', { exact: true })).toBeVisible();
  await page.bringToFront();
  pluginFixture.cli(["plugins", "unregister", "fixture.drive"]);
  await expect(observer.getByText('Updated runtime fixture', { exact: true })).not.toBeVisible();
  await returnToObserver();
  await expect(observer.getByTestId('activity-bar').getByRole('button', { name: 'Drive fixture', exact: true })).toHaveCount(0);
  await page.bringToFront();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.some(p => p.id === "fixture.drive")).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect(page.getByRole("dialog", { name: "Drive fixture", exact: true })).not.toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "The selected plugin is no longer available." })).toBeVisible();
  expect(await page.evaluate(() => { window.pluginNoticeObserver.disconnect(); return window.pluginNoticeMaximum; }), "A closing dialog must not duplicate the selected-plugin notice").toBe(1);
  // The returned activation kind supplies the tooltip, including after the switch fails.
  const startup = { id: "fixture.startup", name: "Fixture plugin", version: "1.0.0", source: { kind: "local" }, trusted: true, enabled: true, running: false, activation: "loading" };
  const secretStoreError = "Windows secret store unavailable";
  const startupScreen = { plugin: startup.id, id: "main", title: "Fixture screen", icon: "file", primary: true, entry: "screen.jsx" };
  const restartActions = [];
  let restarting = true;
  await page.route("**/api/plugin-screens", route => {
    const screen = startup.activation ? { ...startupScreen, activation: startup.activation }
      : startup.running ? { ...startupScreen, codeRevision: "ready", ...(route.request().postDataJSON()?.screenCode === false ? {} : {
        code: 'export default React => () => React.createElement("p", null, "Fixture screen ready")',
      }) } : undefined;
    return route.fulfill({ json: { screens: screen ? [screen] : [] } });
  });
  let enableFailure = { kind: "processExit", message: "Plugin request failed" };
  await page.route("**/api/plugins", route => {
    const action = route.request().postDataJSON()?.action;
    if (action === "disable") {
      startup.enabled = false;
      delete startup.activation;
      if (restarting) restartActions.push("disable");
    }
    if (action === "enable") {
      if (restarting) {
        restartActions.push("enable");
        Object.assign(startup, { enabled: true, running: true });
        return route.fulfill({ json: { plugins: [startup] } });
      }
      Object.assign(startup, { activationFailure: enableFailure.kind, error: `Error: ${enableFailure.message}` });
      return route.fulfill({ status: 400, json: { error: enableFailure.message } });
    }
    if (route.request().method() === "GET" || action === "disable") return route.fulfill({ json: { plugins: [startup] } });
    return route.continue();
  });
  await page.reload();
  await openSettings();
  const startupRow = page.getByRole("region", { name: "Fixture plugin", exact: true });
  const startupDetails = startupRow.getByRole("button", { name: "Plugin status details", exact: true });
  const startupToggle = startupRow.getByRole("switch");
  const startupEntry = page.getByTestId("activity-bar").getByRole("button", { name: "Fixture screen", exact: true });
  const startupStatus = startupRow.getByRole("status");
  const captureLoading = async name => {
    if (screenshots) await page.screenshot({
      path: `tmp/plugin-startup-1918/${name}.png`,
      mask: [page.locator(".activity-bar-status, .document-path, .sidebar-folder-name, .document-start-folder-path"),
        page.locator(".document-tab-name").filter({ hasNotText: /^(Fixture screen|Settings|설정|a\.md)$/ })],
      maskColor: "#7d8795",
    });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(startupStatus).toHaveText("Loading");
  await expect(startupEntry).toHaveAccessibleDescription("Loading");
  await expect(startupRow.getByRole("button", { name: "Restart" })).toHaveCount(0);
  await captureLoading("loading-1440-light");
  await startupEntry.hover();
  await expect(page.getByText("Fixture screen · Loading", { exact: true })).toBeVisible();
  await captureLoading("activity-1440-light");
  await startupEntry.click();
  const workspace = page.getByTestId("view-workspace");
  await expect(workspace.getByRole("status")).toHaveText("Loading");
  await captureLoading("screen-1440-light");
  delete startup.activation;
  startup.running = true;
  await expect(workspace.getByText("Fixture screen ready", { exact: true })).toBeVisible();
  await expect(startupEntry).not.toHaveAccessibleDescription("Loading");
  startup.running = false;
  startup.activation = "slow";
  await openSettings();
  await expect(startupStatus).toHaveText("Not responding");
  await expect(startupDetails).toHaveAccessibleDescription("The plugin is taking longer than expected. You can wait or restart it.");
  await captureLoading("slow-1440-light");
  await startupRow.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(startupStatus).toHaveText("Running");
  expect(restartActions).toEqual(["disable", "enable"]);
  await startupEntry.click();
  await expect(workspace.getByText("Fixture screen ready", { exact: true })).toBeVisible();
  await openSettings();
  restarting = false;
  Object.assign(startup, { running: false, activationFailure: "processExit", error: "Plugin activation failed" });
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  const exitHint = "The plugin process exited before it was ready. Turn it off and back on.";
  await expect(startupRow.getByRole("status")).toHaveText("Plugin error");
  await expect(startupToggle).toBeChecked();
  await startupDetails.hover();
  await expect(page.getByText(exitHint, { exact: true })).toBeVisible();
  await startupToggle.click();
  await expect(startupToggle).not.toBeChecked();
  const manualEnable = responseFor("enable");
  await startupToggle.click();
  expect((await manualEnable).status()).toBe(400);
  await expect(startupDetails).toHaveAccessibleDescription(exitHint);
  await startupToggle.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(startupDetails).toBeFocused();
  await expect(page.getByText(exitHint, { exact: true })).toBeVisible();

  enableFailure = { kind: "other", message: secretStoreError };
  const rejectedByStore = responseFor("enable");
  await startupToggle.click();
  expect((await rejectedByStore).status()).toBe(400);
  await expect(startupDetails).toHaveAccessibleDescription(secretStoreError);
  await startupDetails.hover();
  await expect(page.getByText(secretStoreError, { exact: true })).toBeVisible();

  // The Host's list still carries the reason after the action's local row state is gone.
  await page.reload();
  await openSettings();
  await expect(startupDetails).toHaveAccessibleDescription(`Error: ${secretStoreError}`);
  Object.assign(startup, { enabled: true, activationFailure: "other", activationFailedAtStartup: true, error: "Plugin activation failed" });
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect(startupDetails).toHaveAccessibleDescription("Could not turn on the plugin. Turn it off and back on.");

  if (screenshots) {
    delete startup.activationFailedAtStartup;
    Object.assign(startup, { enabled: true, activation: "slow", activationFailure: undefined, error: undefined });
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const theme of ["dark"]) {
      await page.evaluate(theme => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", theme); }, theme);
      await page.reload();
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page.getByRole("button", { name: "플러그인", exact: true }).click();
      await startupRow.getByRole("button", { name: "플러그인 상태 자세히", exact: true }).hover();
      await expect(startupRow.getByRole("status")).toHaveText("응답이 늦음");
      await captureLoading(`slow-1440-${theme}-ko`);
    }
  }
  await page.unrouteAll({ behavior: "wait" });
  await page.keyboard.press("Escape");
  return { alignment };
  } finally { await observer.close(); }
}
