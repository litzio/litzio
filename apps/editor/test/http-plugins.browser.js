async (page, { expect, pluginFixture, screenshots, openFolderPicker }) => {
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
  let detectedFolders = [pluginFixture.folder, pluginFixture.otherFolder];
  let holdEnabled = false, releaseEnabled;
  const heldEnabled = new Promise(resolve => { releaseEnabled = resolve; });
  const delayedResponses = [];
  // Isolate detection from the machine's real OneDrive account; folder listing still uses the Host.
  await page.route("**/api/plugins", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const delayed = holdEnabled;
    const response = await route.fetch();
    const value = await response.json();
    for (const plugin of value.plugins) if (plugin.id === "litzio.onedrive" && plugin.running) {
      plugin.status = { available: true, folders: detectedFolders.map((path, i) => ({ id: String(i), path, label: "Drive fixture", defaultCandidate: true })), decorations: detectedFolders.map((path, i) => ({ id: String(i), path, icon: "onedrive" })), accounts: [] };
    }
    if (delayed && value.plugins.some(plugin => plugin.id === "litzio.onedrive" && plugin.enabled)) {
      delayedResponses.push(value);
      await heldEnabled;
    }
    await route.fulfill({ response, json: value });
  });
  await openSettings();
  const official = page.getByRole("switch", { name: "Enable OneDrive", exact: true });
  await expect(official).not.toBeChecked();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "litzio.onedrive").official).toBe(true);
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: "docs/design/assets/bundled-plugins-1279/bundled-1440.png", mask: [page.locator(".sidebar-host-account")] }); }
  await official.click(); await expect(official).toBeChecked();
  await page.keyboard.press("Escape");
  if (screenshots) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tmp/onedrive-1287/enabled-1440.png", mask: [page.locator(".sidebar-host-account")] });
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.reload(); await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tmp/onedrive-1287/enabled-640-ko-dark.png", mask: [page.locator(".sidebar-host-account")] });
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.reload();
  }
  await expect(page.locator(".sidebar-folder-name")).toHaveCount(2);
  await expect(page.getByLabel("OneDrive", { exact: true })).toHaveCount(2);
  await openSettings();
  await page.reload(); await openSettings(); await expect(official).toBeChecked();
  // Hold a completed Host GET in transport, then finish a later user disable first.
  // The event requests the same refresh used after plugin management; only its response is delayed.
  holdEnabled = true;
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect.poll(() => delayedResponses.length).toBeGreaterThan(0);
  holdEnabled = false;
  await official.click(); await expect(official).not.toBeChecked();
  await expect(page.locator(".sidebar-folder-name")).toHaveCount(0);
  const lateResponse = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().method() === "GET" && response.ok());
  releaseEnabled();
  await (await lateResponse).finished();
  // Give the delivered JSON and React render a browser frame before checking the retained state.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(official).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-folder-name")).toHaveCount(0);
  const listing = await page.request.get(`${await page.evaluate(() => location.origin)}/api/folder?root=${encodeURIComponent(pluginFixture.folder)}`);
  expect(listing.ok()).toBe(true);
  await openSettings();
  await page.reload(); await openSettings(); await expect(official).not.toBeChecked();
  // A manually opened descendant remains owned and remembered independently of its automatic parent.
  await page.keyboard.press("Escape");
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  const rememberedFolders = () => page.evaluate(() => JSON.parse(localStorage.getItem(JSON.stringify(["local", "litzio.openFolders"])) ?? "[]"));
  await expect.poll(rememberedFolders).toEqual([pluginFixture.folder]);
  detectedFolders = [pluginFixture.folder.replace(/[\\/][^\\/]+$/, "")];
  await openSettings();
  await official.click(); await expect(official).toBeChecked();
  await expect(page.locator(".sidebar-folder-name")).toContainText("http-host-a");
  await expect.poll(rememberedFolders).toEqual([pluginFixture.folder]);
  await page.reload(); await openSettings(); await expect(official).toBeChecked();
  await expect(page.locator(".sidebar-folder-name")).toContainText("http-host-a");
  await official.click(); await expect(official).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-folder-name")).toHaveText("fixture");
  await expect.poll(rememberedFolders).toEqual([pluginFixture.folder]);
  await page.reload();
  await expect(page.locator(".sidebar-folder-name")).toHaveText("fixture");
  await openSettings();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  await page.getByTestId("folder-path").fill(pluginFixture.directory);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await expect(page.getByText("Trust required", { exact: false })).toBeVisible();
  const registered = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
  expect(registered.running).toBe(false);
  await page.getByRole("button", { name: "Drive fixture", exact: true }).click();
  if (registered.secrets.supported) {
    await page.getByLabel("pat: Not configured", { exact: true }).fill("browser-isolated-secret");
    await saveSecret();
    await expect(page.getByLabel("pat: Configured", { exact: true })).toHaveValue("");
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
    await page.getByRole("button", { name: "Drive fixture", exact: true }).click();
    await expect(page.getByLabel("pat: Unavailable or damaged", { exact: true })).toHaveValue("");
    await expect(page.getByText("Unable to read this secret. Delete or replace it.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete secret", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Delete secret", exact: true }).click();
    await expect(page.getByLabel("pat: Not configured", { exact: true })).toHaveValue("");
    await page.getByLabel("pat: Not configured", { exact: true }).fill("browser-repaired-secret");
    await saveSecret();
    await expect(page.getByLabel("pat: Configured", { exact: true })).toHaveValue("");
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
  const reloaded = pluginFixture.cli(["plugins", "reload", "fixture.drive"]);
  expect(reloaded.receipt.operation).toBe("plugins.reload");
  expect(reloaded.plugins.find(p => p.id === "fixture.drive").running).toBe(true);
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
  const cliSettings = pluginFixture.cli(["plugins", "settings", "fixture.drive", "--file", pluginFixture.otherJobInput]);
  expect(cliSettings.plugins.find(p => p.id === "fixture.drive").status.message).toBe("CLI connection");
  await page.getByRole("button", { name: "Drive fixture", exact: true }).click();
  await expect(page.getByLabel("Connection label", { exact: true })).toBeEnabled();
  await page.getByLabel("Connection label", { exact: true }).fill("UI connection");
  await page.getByLabel("Connection label", { exact: true }).press("Tab");
  await expect.poll(() => pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive")?.status?.message).toBe("UI connection");
  if (registered.secrets.supported) {
    await page.getByLabel("pat: Not configured", { exact: true }).fill("enabled-isolated-secret");
    await saveSecret();
    await expect(page.getByLabel("pat: Configured", { exact: true })).toHaveValue("");
    let live = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
    expect(live.status.accounts[0].label).toBe("Secret applied");
    expect(JSON.stringify(live)).not.toContain("enabled-isolated-secret");
    pluginFixture.cli(["plugins", "secret-delete", "fixture.drive", "pat"]);
    live = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
    expect(live.running).toBe(true);
    expect(live.status.accounts[0].label).toBe("Fixture account");
  }
  await page.keyboard.press("Escape");
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
  await expect(page.getByRole("region", { name: "Drive fixture", exact: true }).getByRole("status").filter({ hasText: /^Plugin disabled$/ })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("OneDrive", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sidebar-folder-name")).toContainText("fixture");
  pluginFixture.cli(["plugins", "unregister", "fixture.drive"]);
  expect(pluginFixture.cli(["plugins", "list"]).plugins.some(p => p.id === "fixture.drive")).toBe(false);
  // Actual detachable community artifact, same Host and CLI, one fake service.
  const docling = pluginFixture.docling;
  const id = "community.docling";
  let doclingRegistered = false;
  try {
    expect((await docling.cli(["plugins", "validate", docling.directory])).valid).toBe(true);
    await docling.cli(["plugins", "register", docling.directory]);
    doclingRegistered = true;
    const registered = (await docling.cli(["plugins", "list"])).plugins.find(p => p.id === id);
    expect(registered.official).toBe(false); expect(registered.running).toBe(false);
    await docling.cli(["plugins", "settings", id, "--file", docling.settings]);
    await docling.cli(["plugins", "trust", id, "--digest", registered.digest]);
    await docling.cli(["plugins", "enable", id]);
    const invoke = () => docling.cli(["operation", "invoke", id + ".connection", "--input", docling.input]);
    const connected = await invoke();
    expect(connected.result[0].status).toBe("연결됨");
    await page.reload(); await openSettings();
    await page.getByRole("button", { name: "Open view · Docling", exact: true }).click();
    const refresh = page.getByRole("button", { name: "Refresh data", exact: true });
    await refresh.click();
    await expect(page.getByRole("cell", { name: "연결됨", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: connected.result[0].detail, exact: true })).toBeVisible();
    if (screenshots) {
      for (const width of [1440, 640]) {
        if (width === 640) {
          await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
          await page.reload();
          await page.getByRole("button", { name: "설정", exact: true }).click();
          await page.getByRole("button", { name: "플러그인", exact: true }).click();
          await page.getByRole("button", { name: "뷰 열기 · Docling", exact: true }).click();
          await page.getByRole("button", { name: "데이터 새로고침", exact: true }).click();
          await expect(page.getByRole("cell", { name: "연결됨", exact: true })).toBeVisible();
        }
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: `tmp/docling-1321/connection-${width}.png`, mask: [page.locator(".sidebar-host-account"), page.locator(".view-workspace-favorites select"), page.locator(".view-controls select"), page.locator(".views-page > header p")], maskColor: "#a1a1aa" });
      }
      await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
      await page.reload(); await openSettings();
      await page.getByRole("button", { name: "Open view · Docling", exact: true }).click();
    }
    docling.setFailure(true);
    const failed = await invoke();
    expect(failed.result[0].status).toBe("오류");
    await refresh.click();
    await expect(page.getByRole("cell", { name: failed.result[0].detail, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "연결됨", exact: true })).toHaveCount(0);
    docling.setFailure(false);
    await refresh.click();
    await expect(page.getByRole("cell", { name: "연결됨", exact: true })).toBeVisible();
    const started = await docling.cli(["plugins", "start", id, "--input", docling.jobInput]);
    expect(started.job.state).toBe("running");
    await expect.poll(async () => (await docling.cli(["plugins", "status", started.job.requestId])).job.state).toBe("completed");
    expect((await docling.cli(["plugins", "result", started.job.requestId])).job.result.path).toContain("docling-cli.md");
    await page.keyboard.press("Control+Slash");
    await page.getByRole("combobox").fill("> Plugin jobs");
    await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
    const pane = page.getByTestId("plugin-jobs");
    await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Completed");
    await pane.getByRole("button", { name: "Open result document" }).click();
    const editor = page.locator(".tiptap").filter({ visible: true });
    await expect(editor).toContainText("Converted PDF");
    await expect(editor).toContainText("PDF body *literal*.");
    await expect(editor).toContainText("Cell one | Cell two");
    await page.getByRole("tab", { name: /Plugin jobs/ }).click();
    await pane.getByLabel("Job", { exact: true }).selectOption("community.docling/create-document");
    await pane.getByLabel("Input file").selectOption("sample.docling");
    await pane.getByLabel("Result path in Root").fill("docling-browser.md");
    await pane.getByRole("button", { name: "Start job", exact: true }).click();
    await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Completed");
    if (screenshots) for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 640) {
        await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
        await page.reload();
        await page.keyboard.press("Control+Slash");
        await page.getByRole("combobox").fill("> 플러그인 작업");
        await page.getByRole("option", { name: "플러그인 작업", exact: true }).click();
      }
      await expect(pane.getByRole("status", { name: width === 640 ? "작업 상태" : "Job status" })).toHaveText(width === 640 ? "완료" : "Completed");
      await page.screenshot({ path: `tmp/docling-1322/completed-${width}.png`, mask: [page.locator(".sidebar-host-account"), page.locator(".plugin-settings-row select"), pane.getByLabel(width === 640 ? "열린 폴더" : "Opened folder", { exact: true }), page.locator(".views-page > header p")], maskColor: "#a1a1aa" });
    }
    if (screenshots) { await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); }); await page.reload(); }
    docling.setDocumentInput(true);
    const failure = await docling.cli(["plugins", "start", id, "--input", docling.jobInput]);
    await expect.poll(async () => (await docling.cli(["plugins", "status", failure.job.requestId])).job.state).toBe("failed");
    expect((await docling.cli(["plugins", "status", failure.job.requestId])).job.result).toBeUndefined();
    expect(docling.conversionRequests()).toBe(0);
  } finally {
    if (doclingRegistered) {
      await docling.cli(["plugins", "disable", id]);
      await docling.cli(["plugins", "unregister", id]);
    }
  }
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

  return { secretSaves };
}
