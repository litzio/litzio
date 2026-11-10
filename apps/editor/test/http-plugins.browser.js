async (page, { expect, pluginFixture, screenshots, openFolderPicker, reloadDocument }) => {

  const secretSaves = [];
  let listRequests = 0;
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
    if (route.request().method() === "GET") ++listRequests;
    const delayed = holdEnabled && route.request().method() === "GET";
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    const value = await response.json();
    for (const plugin of value.plugins) if (plugin.id === "litzio.onedrive" && plugin.running) {
      plugin.status = { available: true, folders: detectedFolders.map((path, i) => ({ id: String(i), path, label: "Drive fixture", defaultCandidate: true })), decorations: detectedFolders.map((path, i) => ({ id: String(i), path, icon: "plugin" })), accounts: [] };
    }
    if (delayed && value.plugins.some(plugin => plugin.id === "litzio.onedrive" && plugin.enabled)) {
      delayedResponses.push(value);
      await heldEnabled;
    }
    await route.fulfill({ response, json: value });
  });
  await openSettings();
  const designated = pluginFixture.cli(["plugins", "list"]).plugins.filter(p => ["community.docling", "community.jira"].includes(p.id));
  expect(designated).toHaveLength(2);
  for (const plugin of designated) {
    expect(plugin.bundled).toBe(true); expect(plugin.official).toBe(false);
    expect(plugin.enabled).toBe(false); expect(plugin.trusted).toBe(false);
  }
  await page.getByRole("switch", { name: "Enable Docling", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Trust and enable Docling?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable Docling", exact: true })).not.toBeChecked();
  const official = page.getByRole("switch", { name: "Enable OneDrive", exact: true });
  await expect(official).not.toBeChecked();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "litzio.onedrive").official).toBe(true);
  if (screenshots) { await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: "tmp/plugin-stage1/bundled-1440.png", mask: [page.locator(".sidebar-host-account")] }); }
  const beforeEnableLists = listRequests;
  await official.click(); await expect(official).toBeChecked();
  expect(listRequests).toBe(beforeEnableLists);
  if (screenshots) {
    await expect(page.locator(".plugin-heading .plugin-icon")).toBeVisible();
    await expect.poll(() => page.locator(".plugin-heading .plugin-icon").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "OneDrive", exact: true })).toBeVisible();
    await page.screenshot({ path: "tmp/folder-1366/settings-1440.png", mask: [page.locator(".sidebar-host-account")] });
  }
  await page.keyboard.press("Escape");
  if (screenshots) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".sidebar-folder-name .plugin-icon")).toHaveCount(2);
    await expect.poll(() => page.locator(".sidebar-folder-name .plugin-icon").evaluateAll(images => images.every(image => image.naturalWidth > 0))).toBe(true);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "tmp/onedrive-1287/enabled-1440.png", mask: [page.locator(".sidebar-host-account")] });
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
    await page.setViewportSize({ width: 640, height: 900 });
    await page.reload(); await page.waitForLoadState("networkidle");
    await expect(page.locator(".sidebar-folder-name .plugin-icon")).toHaveCount(2);
    await expect.poll(() => page.locator(".sidebar-folder-name .plugin-icon").evaluateAll(images => images.every(image => image.naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: "tmp/onedrive-1287/enabled-640-ko-dark.png", mask: [page.locator(".sidebar-host-account")] });
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("button", { name: "플러그인", exact: true }).click();
    await expect(page.getByRole("heading", { name: "OneDrive", exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".plugin-heading .plugin-icon").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: "tmp/folder-1366/settings-640-ko-dark.png", mask: [page.locator(".sidebar-host-account")] });
    await page.keyboard.press("Escape");
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.reload();
  }
  await expect(page.locator(".sidebar-folder-name")).toHaveCount(2);
  await expect(page.locator(".sidebar-folder-name .plugin-icon")).toHaveCount(2);
  await expect.poll(() => page.locator(".sidebar-folder-name .plugin-icon").evaluateAll(images => images.every(image => image.naturalWidth > 0))).toBe(true);
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
  const listing = await page.request.get(`${await page.evaluate(() => location.origin)}/api/folder?root=${encodeURIComponent(pluginFixture.folder)}`, { headers: { Connection: "close" } });
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
  await expect(page.getByRole("region", { name: "Drive fixture", exact: true }).getByText("Community plugin", { exact: true })).toBeVisible();
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
    expect(live.status.accounts[0].label).toBe("Secret applied");
    expect(JSON.stringify(live)).not.toContain("enabled-isolated-secret");
    pluginFixture.cli(["plugins", "secret-delete", "fixture.drive", "pat"]);
    live = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive");
    expect(live.running).toBe(true);
    expect(live.status.accounts[0].label).toBe("Fixture account");
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".plugin-settings-dialog")).not.toBeVisible();
  // Escape exits Settings after the nested dialog has finished closing.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
  // Any running folder source opens automatically, before a manual folder action.
  await expect(page.locator(".sidebar-folder-name")).toHaveCount(2);
  await expect(page.locator(`[data-testid="folder"][data-root=${JSON.stringify(pluginFixture.otherFolder)}]`)).toBeVisible();
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await expect(page.locator(".sidebar-folder-name .plugin-icon")).toBeVisible();
  await expect.poll(() => page.locator(".sidebar-folder-name .plugin-icon").evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    if (screenshots) await page.screenshot({ path: `tmp/plugin-stage1/decoration-${width}.png` });
  }
  await openSettings();
  await page.getByRole("switch", { name: "Enable Drive fixture", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable Drive fixture", exact: true })).not.toBeChecked();
  expect(pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.drive").running).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator(".sidebar-folder-name .plugin-icon")).toHaveCount(0);
  await expect(page.locator(".sidebar-folder-name")).toHaveText("fixture");
  pluginFixture.cli(["plugins", "unregister", "fixture.drive"]);
  expect(pluginFixture.cli(["plugins", "list"]).plugins.some(p => p.id === "fixture.drive")).toBe(false);
  // Actual detachable community artifact, same Host and CLI, one fake service.
  const docling = pluginFixture.docling;
  const id = "community.docling";
  let requestPhase = "docling";
  const requestCounts = {}, requestSeconds = {};
  const countRequest = request => {
    const pathname = request.url().replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (!["/api/views", "/api/plugins"].includes(pathname)) return;
    const action = request.postDataJSON()?.action ?? request.method();
    const key = `${requestPhase} ${pathname} ${action}`;
    requestCounts[key] = (requestCounts[key] ?? 0) + 1;
    const second = `${requestPhase} ${pathname} ${Math.floor(Date.now() / 1000)}`;
    requestSeconds[second] = (requestSeconds[second] ?? 0) + 1;
  };
  page.on("request", countRequest);
  let doclingRegistered = false;
  try {
    expect((await docling.cli(["plugins", "validate", docling.directory])).valid).toBe(true);
    await docling.cli(["plugins", "register", docling.directory]);
    doclingRegistered = true;
    const registered = (await docling.cli(["plugins", "list"])).plugins.find(p => p.id === id);
    expect(registered.official).toBe(false); expect(registered.running).toBe(false);
    await docling.cli(["plugins", "settings", id, "--file", docling.settings]);
    await docling.cli(["plugins", "trust", id, "--registration", registered.registrationId]);
    await docling.cli(["plugins", "enable", id]);
    // Manual real-service evidence uses an already converted archive. Never put
    // external model latency inside the 180s automatic fake-service regression.
    if (screenshots && docling.realFile && docling.comparisonCapture) {
      await openFolderPicker(page);
      await page.getByTestId("folder-path").fill(pluginFixture.folder);
      await page.getByTestId("folder-open").click();
      await expect(page.getByTestId("folder-path")).not.toBeVisible();
      docling.setRealInput();
      const started = await docling.cli(["plugins","start",id,"--input",docling.jobInput]);
      // Manual real-document capture waits for the actual terminal K1 state;
      // conversion/authoring duration is measured separately, not a 5s fixture assertion.
      let completed;
      do {
        completed = (await docling.cli(["plugins","status",started.job.requestId])).job;
        if (completed.state === "running") await new Promise(resolve => setTimeout(resolve,250));
      } while (completed.state === "running");
      expect(completed.state).toBe("completed");
      const result = (await docling.cli(["plugins","result",started.job.requestId])).job.result;
      const current = await docling.review("read",result.comparison);
      await docling.review("progress",{...result.comparison,baseline:current.baseline,requestId:await page.evaluate(()=>crypto.randomUUID()),progress:{checkedPages:[],lastPage:docling.comparisonPage}});
      for (const width of [1440,640]) {
        await page.setViewportSize({width,height:1000});
        await page.evaluate(width => {localStorage.setItem("litzio.uiLanguage",width === 640 ? "ko":"en");localStorage.setItem("litzio.theme",width === 640 ? "dark":"light");},width);
        await page.reload();
        await page.locator(".sidebar").getByRole("button",{name:"Docling",exact:true}).click();
        const panel = page.getByTestId("plugin-job-panel");
        const row = panel.getByRole("row").filter({has:page.getByRole("cell",{name:"real.docling",exact:true})}).first();
        await expect(row.getByRole("status")).toHaveText(width === 640 ? "완료":"Completed");
        if (docling.comparisonBefore) {
          await page.screenshot({path:`tmp/docling-1408/before-${width}.png`,mask:[page.locator(".sidebar-host-account"),panel.getByLabel(width===640?"열린 폴더":"Opened folder",{exact:true})]});
        } else {
          await row.getByRole("button",{name:width===640?"원본 대조":"Compare source",exact:true}).click();
          const compare = page.locator(".review-renderer").filter({visible:true});
          await expect(compare.locator(".review-page img")).toBeVisible();
          await expect.poll(()=>compare.locator(".review-page img").evaluate(c=>c.naturalWidth)).toBeGreaterThan(0);
          const unchecked = compare.getByRole("button",{name:width===640?"페이지 확인함":"Mark page checked",exact:true});
          if (await unchecked.isVisible()) await unchecked.click();
          await expect(compare.getByRole("button",{name:width===640?"확인한 페이지":"Page checked",exact:true})).toHaveAttribute("aria-pressed","true");
          await expect(compare.getByText(width===640?"확인 기록 저장 중…":"Saving review progress…",{exact:true})).toBeHidden();
          await expect(compare.getByRole("button",{name:width===640?"데이터 새로고침":"Refresh data",exact:true})).toBeEnabled();
          const table = compare.getByRole("button",{name:"table · Supported",exact:true}).first();
          if (await table.count()) { await table.click(); await expect(compare.locator(".review-highlights > div")).not.toHaveCount(0); }
          expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({path:`tmp/docling-1408/after-${width}.png`,mask:[page.locator(".sidebar-host-account")]});
        }
      }
      return;
    }
    if (screenshots && docling.realFile) {
      await openFolderPicker(page);
      await page.getByTestId("folder-path").fill(pluginFixture.folder);
      await page.getByTestId("folder-open").click();
      await expect(page.getByTestId("folder-path")).not.toBeVisible();
      docling.setRealInput();
      const started = await docling.cli(["plugins", "start", id, "--input", docling.jobInput]);
      await expect.poll(async () => (await docling.cli(["plugins", "status", started.job.requestId])).job.state).toBe("completed");
      const report = await docling.report(started.job.requestId);
      await docling.repeatReal();
      expect(report.summary).not.toContain("그림 이미지 미포함");
      expect(report.summary).toContain("캡션 번호 미보존 1");
      for (const width of [1440, 640]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
        await page.reload();
        if (docling.beforeFile) {
          await page.locator('[role="treeitem"][data-path$="docling-before.md"]').click();
          await expect(page.getByTestId("current-file")).toHaveAttribute("title", /docling-before\.md$/);
          await page.screenshot({ path: `tmp/docling-1382/before-${width}.png`, mask: [page.locator(".sidebar-host-account")], maskColor: "#a1a1aa" });
        }
        await page.locator('[role="treeitem"][data-path$="docling-real.md"]').click();
        await expect(page.getByTestId("current-file")).toHaveAttribute("title", /docling-real\.md$/);
        const document = page.locator(".tiptap").filter({ visible: true });
        await expect(document.locator("table")).toContainText("Revenue");
        await expect(document).toContainText("Two connected stages");
        await expect(document).toContainText("Figure IV: Unreadable source number");
        await expect(document.locator('figure img')).toHaveCount(2);
        await expect.poll(() => document.locator('figure img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
        await expect(document.locator('figure').filter({hasText:'Two connected stages'}).locator('figcaption')).toHaveAttribute('data-caption-prefix', /Figure 6/);
        await expect(document.locator('figure').filter({hasText:'Figure IV:'}).locator('figcaption')).not.toHaveAttribute('data-caption-prefix');
        await expect(document.getByTestId('table-caption')).toHaveAttribute('data-caption-prefix', /Table 2-1/);
        await page.screenshot({ path: `tmp/docling-1382/after-${width}.png`, mask: [page.locator(".sidebar-host-account")], maskColor: "#a1a1aa" });
        await document.locator('figure').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `tmp/docling-1382/figures-${width}.png`, mask: [page.locator(".sidebar-host-account")], maskColor: "#a1a1aa" });
        await page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).click();
        const panel = page.getByTestId("plugin-job-panel");
        const row = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "real.docling", exact: true }) }).first();
        await expect(row).toContainText(report.summary);
        const masks = [page.locator(".sidebar-host-account"), panel.getByLabel(width === 640 ? "열린 폴더" : "Opened folder", { exact: true })];
        await page.screenshot({ path: `tmp/docling-1382/losses-${width}.png`, mask: masks, maskColor: "#a1a1aa" });
        if (width === 640) {
          await panel.locator(".view-table-scroll").evaluate(element => element.scrollTo({ left: element.scrollWidth }));
          await page.screenshot({ path: "tmp/docling-1382/losses-640-end.png", mask: masks, maskColor: "#a1a1aa" });
        }
      }
      return { realDocling: true, report };
    }
    const invoke = () => docling.cli(["operation", "invoke", id + ".connection", "--input", docling.input]);
    const connected = await invoke();
    expect(connected.result.ok).toBe(true);
    // Settings health check needs no opened Root and exposes no API key field.
    await page.evaluate(() => { localStorage.removeItem(JSON.stringify(["local", "litzio.openFolders"])); });
    await page.reload(); await openSettings();
    await expect(page.locator(".sidebar-folder-name")).toHaveCount(0);
    await page.getByRole("button", { name: "Docling settings", exact: true }).click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator('input[type="password"]')).toHaveCount(0);
    const check = detail.getByRole("button", { name: "Check connection", exact: true });
    await check.click();
    await expect(detail.getByText(connected.result.message, { exact: true })).toBeVisible();
    docling.setFailure(true);
    const failed = await invoke();
    expect(failed.result.ok).toBe(false);
    await check.click();
    await expect(detail.getByText(failed.result.message, { exact: true })).toBeVisible();
    docling.setFailure(false);
    await check.click();
    await expect(detail.getByText(connected.result.message, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).click();
    const icon = page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).locator("img.plugin-icon");
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    const panel = page.getByTestId("plugin-job-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".plugin-job-start").getByRole("button")).toBeDisabled();
    // Connection reads need no folder; file jobs explicitly select an opened Root.
    await openFolderPicker(page);
    await page.getByTestId("folder-path").fill(pluginFixture.folder);
    await page.getByTestId("folder-open").click();
    await expect(page.getByTestId("folder-path")).not.toBeVisible();
    await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
    await panel.getByRole("group", { name: "Task", exact: true }).getByRole("button", { name: /PDF 변환/ }).click();
    await panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true }).check();
    await panel.getByRole("checkbox", { name: "dashboard-b.pdf", exact: true }).check();
    await panel.locator(".plugin-job-start").getByRole("button").click();
    for (const name of ["dashboard-a", "dashboard-b"]) {
      const row = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: name + ".pdf", exact: true }) }).first();
      await expect(row.getByRole("status")).toHaveText("Completed");
      await expect(row.getByRole("button", { name: "Copy result path", exact: true })).toBeVisible();
      await docling.verifyFile(pluginFixture.folder + "/" + name + ".docling", name + ".pdf");
    }
    const pdfJob = await docling.cli(["plugins", "start", id, "--input", docling.fileJobInput]);
    expect(pdfJob.job.state).toBe("running");
    await expect.poll(async () => (await docling.cli(["plugins", "status", pdfJob.job.requestId])).job.state).toBe("completed");
    const pdfResult = (await docling.cli(["plugins", "result", pdfJob.job.requestId])).job.result;
    expect(pdfResult.kind).toBe("file");
    expect(pdfResult.path.replaceAll("\\", "/")).toBe(pluginFixture.folder.replaceAll("\\", "/") + "/source.docling");
    await docling.verifyFile(pdfResult.path);
    await page.keyboard.press("Control+Slash");
    await page.getByRole("combobox").fill("> Plugin jobs");
    await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
    const filePane = page.getByTestId("plugin-jobs");
    await expect(filePane.getByRole("status", { name: "Job status" })).toHaveText("Completed");
    await expect(filePane.getByText(pdfResult.path, { exact: true })).toBeVisible();
    await filePane.getByLabel("Input file").selectOption("source.pdf");
    await expect(filePane.getByLabel("Result file")).toHaveValue("source.docling");
    if (screenshots) {
      for (const width of [1440, 640]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 640) {
          await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
          await page.reload();
          await page.keyboard.press("Control+Slash");
          await page.getByRole("combobox").fill("> 플러그인 작업");
          await page.getByRole("option", { name: "플러그인 작업", exact: true }).click();
        }
        await expect(filePane.getByRole("status", { name: width === 640 ? "작업 상태" : "Job status" })).toHaveText(width === 640 ? "완료" : "Completed");
        await filePane.getByLabel(width === 640 ? "입력 파일" : "Input file").selectOption("source.pdf");
        await page.screenshot({ path: `tmp/docling-1322/file-${width}.png`, mask: [page.locator(".sidebar-host-account"), filePane.getByLabel(width === 640 ? "열린 폴더" : "Opened folder", { exact: true }), page.locator(".views-page > header p"), page.locator(".plugin-job-file-result p")], maskColor: "#a1a1aa" });
      }
      await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); }); await page.reload();
    } else await page.getByRole("button", { name: "Close Plugin jobs", exact: true }).click();
    docling.setPdfOutcome("failure");
    const failedPdf = await docling.cli(["plugins", "start", id, "--input", docling.fileJobInput]);
    await expect.poll(async () => (await docling.cli(["plugins", "status", failedPdf.job.requestId])).job.state).toBe("failed");
    docling.setPdfOutcome("pending");
    const waitingPdf = await docling.cli(["plugins", "start", id, "--input", docling.fileJobInput]);
    await expect.poll(async () => (await docling.cli(["plugins", "status", waitingPdf.job.requestId])).job.phase).toBe("PDF 변환 중");
    const submittedBeforeWaiter = docling.submissions();
    const queuedPdf = await docling.cli(["plugins", "start", id, "--input", docling.queuedJobInput]);
    expect(queuedPdf.job.state).toBe("running");
    expect(queuedPdf.job.phase).toBe("서버 대기 중");
    const stoppedWaiter = (await docling.cli(["plugins", "stop", queuedPdf.job.requestId])).job;
    expect(stoppedWaiter.state).toBe("stopped");
    expect(stoppedWaiter.result).toBeUndefined();
    expect(docling.submissions()).toBe(submittedBeforeWaiter);
    const stoppedPdf = (await docling.cli(["plugins", "stop", waitingPdf.job.requestId])).job;
    expect(stoppedPdf.state).toBe("stopped");
    expect(stoppedPdf.stopRequested).toBe(true);
    expect(stoppedPdf.result).toBeUndefined();
    const beforeNativeRequests = docling.conversionRequests();
    const started = await docling.cli(["plugins", "start", id, "--input", docling.jobInput]);
    expect(started.job.state).toBe("running");
    await expect.poll(async () => (await docling.cli(["plugins", "status", started.job.requestId])).job.state).toBe("completed");
    expect((await docling.cli(["plugins", "result", started.job.requestId])).job.result.path).toContain("docling-cli.md");
    const conversionReport = await docling.report(started.job.requestId);
    expect(conversionReport.documentRevision).toBe((await docling.cli(["plugins", "result", started.job.requestId])).job.result.revision);
    expect(conversionReport.items.find(item => item.self_ref === "#/pictures/0").targets).toEqual(conversionReport.items.find(item => item.self_ref === "#/texts/7").targets);
    await page.keyboard.press("Control+Slash");
    await page.getByRole("combobox").fill("> Plugin jobs");
    await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
    const pane = page.getByTestId("plugin-jobs");
    await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Completed");
    await pane.getByRole("button", { name: "Open result document" }).click();
    const editor = page.locator(".tiptap").filter({ visible: true });
    await expect(editor).toContainText("Converted PDF");
    await expect(editor).toContainText("PDF body *literal*.");
    await expect(editor.locator("table")).toContainText("Cell one");
    await expect(editor.locator("ol").filter({ hasText: "First item" })).toContainText("First item");
    await expect(editor.locator("pre")).toContainText("print(1)");
    await expect(editor).toContainText("Original caption.");
    const figure = editor.locator('figure').filter({ hasText: 'Original caption.' });
    await expect.poll(() => figure.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(figure.locator('figcaption')).toHaveAttribute('data-caption-prefix', /Figure 1/);
    await expect(figure).not.toContainText('Figure 1:');
    const unnumbered = editor.locator('figure').filter({ hasText: 'Figure IV: Unreadable number' });
    await expect(unnumbered.locator('figcaption')).not.toHaveAttribute('data-caption-prefix');
    expect(conversionReport.summary).toContain('캡션 번호 미보존 1');
    expect(conversionReport.losses.filter(loss => loss.kind === 'picture-image')).toHaveLength(1);
    await expect(editor).not.toContainText("RUNNING HEADER");
    await expect(editor).not.toContainText("Docling conversion:");
    const generatedWarning = page.getByTestId("generated-document-warning").filter({ visible: true });
    await expect(generatedWarning).toBeVisible();
    await generatedWarning.locator('span[tabindex="0"]').hover();
    await expect(page.locator("[data-slot=tooltip-content]")).toBeVisible();
    await expect(page.locator("[data-slot=tooltip-content]")).toContainText("Direct edits will be overwritten");
    await page.mouse.move(0, 0);
    // The warning must allow the ordinary editor's Save, then regeneration can replace
    // the explicitly reread revision. Patch semantics are covered below the UI layer.
    await page.getByTestId("view-visual").click();
    await editor.getByText("PDF body *literal*.", { exact: true }).click();
    await page.keyboard.press("End"); await page.keyboard.type(" Direct edit.");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("status")).toHaveAttribute("data-operation", "saved");
    const reviewInput = { root: pluginFixture.folder, document: "docling-cli.md" };
    const review = await docling.review("read", reviewInput);
    expect(review.state).toBe("externally-modified");
    const corrected = await docling.review("patch", { ...reviewInput, baseline: review.baseline, requestId: "6cf96dcb-0c9c-41c5-b14c-c9d6736bb3e7", patches: [
      { type: "text", self_ref: "#/texts/4", text: "Reviewed PDF body." },
    ] });
    expect(corrected.correctionsSaved).toBe(true); expect(corrected.documentRegenerated).toBe(true);
    await reloadDocument(page);
    await expect(editor).toContainText("Reviewed PDF body.");
    await expect(editor).not.toContainText("Direct edit.");
    await expect(generatedWarning).toBeVisible();
    await page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).click();
    // Re-selecting the current Root must preserve its loaded files.
    await expect(panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true })).toBeVisible();
    await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
    await expect(panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true })).toBeVisible();
    await panel.getByRole("group", { name: "Task", exact: true }).getByRole("button", { name: /문서 만들기/ }).click();
    await panel.getByRole("checkbox", { name: "sample.docling", exact: true }).check();
    await panel.locator(".plugin-job-start").getByRole("button").click();
    const nativeRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "sample.docling", exact: true }) }).first();
    await expect(nativeRow.getByRole("status")).toHaveText("Completed");
    await expect(nativeRow).toContainText("병합 칸 반복 1");
    await nativeRow.getByRole("button", { name: "Open result: sample.docling", exact: true }).click();
    await expect(editor).toContainText("PDF body *literal*.");
    await page.locator(".sidebar").getByRole("button", {name:"Docling",exact:true}).click();
    await nativeRow.getByRole("button",{name:"Compare source",exact:true}).click();
    const comparison = page.locator(".review-renderer").filter({visible:true});
    await expect(comparison.locator(".review-page img")).toBeVisible();
    await expect.poll(() => comparison.locator(".review-page img").evaluate(c => c.naturalWidth)).toBeGreaterThan(0);
    await comparison.getByRole("button",{name:"section_header · Supported",exact:true}).click();
    await expect(comparison.locator(".review-highlights > div")).toHaveCount(1);
    await comparison.locator(".tiptap p").filter({hasText:"PDF body *literal*."}).click();
    await expect(comparison).toContainText("Page 2 / 2");
    await expect(comparison.getByRole("button",{name:"text · Supported",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await comparison.getByRole("button",{name:"Previous page",exact:true}).click();
    await expect(comparison).toContainText("Page 1 / 2");
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await expect(comparison.getByRole("button",{name:"Refresh data",exact:true})).toBeEnabled();
    let releaseProgress;
    const heldProgress = new Promise(resolve => { releaseProgress = resolve; });
    let holdProgress = true, rejectProgress = false;
    await page.route("**/api/reviews",async route => {
      if (route.request().postDataJSON()?.action === "generated-progress") {
        if (holdProgress) await heldProgress;
        if (rejectProgress) return route.fulfill({json:{error:"Fixture save failure",receipt:{outcome:"failure"}}});
      }
      await route.continue();
    });
    try {
      await comparison.getByRole("button",{name:"Mark page checked",exact:true}).click();
      await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeVisible();
      await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
      await expect(comparison).toBeVisible();
      await comparison.getByRole("button",{name:"Next page",exact:true}).click();
      await expect(comparison).toContainText("Page 2 / 2");
      await comparison.getByRole("button",{name:"Mark page checked",exact:true}).click();
    } finally { holdProgress = false; releaseProgress(); }
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await expect(comparison.getByRole("button",{name:"Refresh data",exact:true})).toBeEnabled();
    await expect(comparison.getByRole("button",{name:"Page checked",exact:true})).toHaveAttribute("aria-pressed","true");
    rejectProgress = true;
    await comparison.getByRole("button",{name:"Page checked",exact:true}).click();
    await expect(comparison).toContainText("Review progress could not be saved.");
    await expect(comparison.getByRole("button",{name:"Mark page checked",exact:true})).toBeDisabled();
    rejectProgress = false;
    await comparison.getByRole("button",{name:"Refresh data",exact:true}).click();
    await expect(comparison.getByRole("button",{name:"Page checked",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.unroute("**/api/reviews");
    const resultPath = (await docling.cli(["jobs","list",id])).jobs.find(j => j.result?.comparison?.document && j.file?.endsWith("sample.docling"))?.result.comparison.document;
    const progress = await docling.review("compare",{root:pluginFixture.folder,document:resultPath});
    expect(progress.progress).toEqual({checkedPages:[1,2],lastPage:2});
    await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
    await page.locator(".sidebar").getByRole("button",{name:"Docling",exact:true}).click();
    await nativeRow.getByRole("button",{name:"Compare source",exact:true}).click();
    await expect(comparison).toContainText("Page 2 / 2");
    await expect(comparison.getByRole("button",{name:"Page checked",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
    await page.setViewportSize({width:1280,height:720});
    await page.locator(".sidebar").getByRole("button",{name:"Docling",exact:true}).click();
    docling.setDocumentInput(true);
    const failure = await docling.cli(["plugins", "start", id, "--input", docling.jobInput]);
    await expect.poll(async () => (await docling.cli(["plugins", "status", failure.job.requestId])).job.state).toBe("failed");
    expect((await docling.cli(["plugins", "status", failure.job.requestId])).job.result).toBeUndefined();
    expect(docling.conversionRequests()).toBe(beforeNativeRequests);

    if (screenshots) for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
      await page.reload();
      await page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).click();
      await expect(panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "sample.docling", exact: true }) }).first().getByRole("status")).toHaveText(width === 640 ? "완료" : "Completed");
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `tmp/docling-002/dashboard-${width}.png`, mask: [page.locator(".sidebar-host-account"), panel.getByLabel(width === 640 ? "열린 폴더" : "Opened folder", { exact: true })], maskColor: "#a1a1aa" });
    }
    if (screenshots) {
      await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
      await page.reload();
    }

  } finally {
    if (doclingRegistered) {
      await docling.cli(["plugins", "disable", id]);
      await docling.cli(["plugins", "unregister", id]);
    }
  }
  requestPhase = "after-docling";
  let assignedQueryMs;
  const jira = pluginFixture.jira;
  expect((await jira.cli(["plugins", "validate", jira.directory])).valid).toBe(true);
  await jira.cli(["plugins", "register", jira.directory]);
  try {
    const registered = (await jira.cli(["plugins", "list"])).plugins.find(p => p.id === "community.jira");
    expect(registered.official).toBe(false);
    // Required PAT uses the production Windows secret store; other Hosts validate only.
    if (registered.secrets.supported) {
      await jira.cli(["plugins", "settings", "community.jira", "--file", jira.settings]);
      await page.reload(); await openSettings();
      await page.getByRole("button", { name: "Jira settings", exact: true }).click();
      await page.getByLabel("개인 액세스 토큰: Not configured", { exact: true }).fill("mock-jira-token");
      await saveSecret();
      await expect(page.getByLabel("개인 액세스 토큰: Configured", { exact: true })).toHaveValue("");
      await jira.cli(["plugins", "enable", "community.jira", "--trust", "--registration", registered.registrationId]);
      await page.reload(); await openSettings();
      await page.getByRole("button", { name: "Jira settings", exact: true }).click();
      const health = page.getByRole("button", { name: "Check connection", exact: true });
      await health.click();
      await expect(page.getByRole("status").filter({ hasText: "Jira 연결과 PAT 인증을 확인했습니다." })).toBeVisible();
      if (screenshots) {
        for (const width of [1440, 640]) {
          if (width === 640) {
            await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
            await page.reload();
            await page.getByRole("button", { name: "설정", exact: true }).click();
            await page.getByRole("button", { name: "플러그인", exact: true }).click();
            await page.getByRole("button", { name: "Jira 설정", exact: true }).click();
            await page.getByRole("button", { name: "연결 확인", exact: true }).click();
            await expect(page.getByRole("status").filter({ hasText: "Jira 연결과 PAT 인증을 확인했습니다." })).toBeVisible();
          }
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `tmp/jira-1350/connection-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
        }
        await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
        await page.reload(); await openSettings();
        await page.getByRole("button", { name: "Jira settings", exact: true }).click();
      }
      jira.setFault(401);
      await health.click();
      await expect(page.getByRole("status").filter({ hasText: "인증에 실패했습니다. PAT를 확인하세요. (401)" })).toBeVisible();
      expect(await page.getByRole("dialog", { name: "Jira", exact: true }).innerText()).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
      jira.setFault(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      const invoke = () => jira.cli(["operation", "invoke", "community.jira.issues", "--input", jira.input]);
      const connected = await invoke();
      expect(connected.result.rows.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2"]);
      expect(connected.result.rows[0].assignee).toBe("—");
      await page.reload(); await openSettings();
      await page.keyboard.press("Escape");
      await page.locator(".sidebar").getByRole("button", { name: "Jira", exact: true }).click();
      await page.getByRole("textbox", { name: "JQL", exact: false }).fill("project = MOCK ORDER BY updated DESC");
      await page.getByRole("button", { name: "조회", exact: true }).click();
      await expect(page.getByRole("cell", { name: "MOCK-6", exact: true })).toBeVisible();
      jira.setFault(400);
      jira.setQuery({ jql: "project =" });
      const syntax = await jira.cli(["operation", "invoke", "community.jira.jql", "--input", jira.input]);
      expect(syntax.errorKind).toBe("failed");
      expect(JSON.stringify(syntax)).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
      await page.getByRole("textbox", { name: "JQL", exact: false }).fill("project =");
      await page.getByRole("button", { name: "조회", exact: true }).click();
      await expect(page.getByText("View operation failed.", { exact: false })).toBeVisible();
      jira.setFault(0);
      await page.getByRole("button", { name: "간편 검색", exact: true }).click();
      const accountInput = page.locator('[data-view-field="account"]');
      const projectInput = page.locator('[data-view-field="project"]');
      const more = page.getByRole("button", { name: /Additional conditions/ });
      await expect(accountInput).toHaveAttribute("placeholder", "Fixture PAT user");
      await expect(accountInput).toHaveValue("");
      await expect(page.locator('[data-view-field="reporter"]')).toHaveCount(0);
      // Candidates insert Jira identifiers, never display names. Guidance alone never queries.
      const beforeCandidates = jira.searches().length;
      await accountInput.fill("mo");
      await page.getByRole("option", { name: "Fixture PAT user (mock-user)", exact: true }).click();
      await expect(accountInput).toHaveValue("mock-user");
      await accountInput.fill("");
      await projectInput.fill("Fi");
      await page.getByRole("option", { name: "Fixture project (MOCK)", exact: true }).click();
      await expect(projectInput).toHaveValue("MOCK");
      await projectInput.fill("");
      expect(jira.searches().length).toBe(beforeCandidates);
      await more.click();
      const reporterInput = page.locator('[data-view-field="reporter"]');
      await reporterInput.fill("mo");
      await page.getByRole("option", { name: "Fixture PAT user (mock-user)", exact: true }).click();
      await expect(reporterInput).toHaveValue("mock-user");
      await reporterInput.fill("");
      await more.click();
      const assignedStart = Date.now();
      const queryButton = page.getByRole("button", { name: "조회", exact: true });
      const queryRows = async value => {
        jira.setQuery(value);
        const cli = await invoke();
        expect(cli.receipt.outcome).toBe("success");
        return cli.result.rows;
      };
      const mine = await queryRows({});
      expect(mine.map(row => row.key)).toEqual(["MOCK-1", "MOCK-8"]);
      expect(jira.searches()).toEqual([{ jql: "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC", startAt: 0 }]);
      await queryButton.click();
      await expect(page.getByRole("cell", { name: "MOCK-8", exact: true })).toBeVisible();
      const account = 'someone"\\else';
      const all = await queryRows({ account, status: "전체" });
      expect(all.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2", "MOCK-6", "MOCK-8"]);
      expect(jira.searches().map(v => v.startAt)).toEqual([0, 2]);
      expect(jira.searches()[0].jql).toBe('assignee = "someone\\"\\\\else" ORDER BY updated DESC');
      await page.locator('[data-view-field="account"]').fill(account);
      await page.getByRole("combobox", { name: "해결 여부", exact: false }).selectOption("전체");
      await queryButton.click();
      await expect(page.getByRole("cell", { name: "MOCK-6", exact: true })).toBeVisible();
      expect((await queryRows({ status: "해결됨" })).map(row => row.key)).toEqual(["MOCK-2"]);
      const filters = { project: "MOCK", reporter: account, dateField: "생성일", dateFrom: "2026-11-01", dateTo: "2026-11-09" };
      await queryRows(filters);
      expect(jira.searches()[0].jql).toBe('assignee = currentUser() AND resolution = Unresolved AND project = "MOCK" AND reporter = "someone\\\"\\\\else" AND created >= "2026-11-01" AND created < "2026-11-10" ORDER BY updated DESC');
      await more.click();
      for (const [field, value] of Object.entries(filters).filter(([field]) => field !== "dateField")) await page.locator(`[data-view-field="${field}"]`).fill(value);
      await page.getByRole("combobox", { name: "기간 기준", exact: false }).selectOption("생성일");
      await more.click();
      await expect(page.locator(".view-query-summary")).toContainText("2026-11-01");
      await expect(page.locator(".view-query-summary")).toContainText(account);
      await queryButton.click();
      await expect(page.getByRole("cell", { name: "MOCK-6", exact: true })).toBeVisible();
      await more.click();
      await expect(page.locator('[data-view-field="reporter"]')).toHaveValue(account);
      await queryRows({ dateFrom: "2026-02-30" }).then(() => { throw new Error("Invalid date accepted"); }, () => {});
      for (const label of ["프로젝트 키", "보고자", "시작일", "종료일"]) await page.getByLabel(label, { exact: true }).fill("");
      jira.setQuery({ key: "MOCK-1" });
      const detail = await jira.cli(["operation", "invoke", "community.jira.detail", "--input", jira.input]);
      expect(detail.receipt.outcome).toBe("success");
      expect(detail.result).toMatchObject({ key: "MOCK-1", issueUrl: jira.baseUrl + "/browse/MOCK-1", commentsTotal: 12, commentsStartAt: 0, commentsReturned: 10, descriptionTruncated: true });
      expect(detail.result.description).toHaveLength(16000);
      expect(detail.result.comments[0]).toMatchObject({ id: "12", bodyTruncated: true });
      expect(detail.result.comments[0].body).toHaveLength(4000);
      expect(detail.result.fetchedAt).toMatch(/^\d{2}-\d{2}-\d{2} \d{2}:\d{2}$/);
      jira.setFault(403);
      const detailDenied = await jira.cli(["operation", "invoke", "community.jira.detail", "--input", jira.input]);
      expect(detailDenied.errorKind).toBe("forbidden");
      expect(JSON.stringify(detailDenied)).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
      jira.setFault(0);
      jira.setLarge(true);
      const capped = await queryRows({});
      expect(capped).toHaveLength(500);
      expect(capped.at(-1).key).toBe("MOCK-500");
      expect(jira.searches().map(v => v.startAt)).toEqual([0, 100, 200, 300, 400]);
      await queryButton.click();
      await expect(page.getByText("500 / 500 · Total: 501", { exact: true })).toBeVisible();
      if (screenshots) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.getByRole("table").scrollIntoViewIfNeeded();
        await page.screenshot({ path: "tmp/jira-1350/assigned-500-1440.png", mask: [page.locator(".sidebar-host-account"), page.locator(".view-controls select"), page.locator(".views-page > header p")], maskColor: "#a1a1aa" });
      }
      assignedQueryMs = Date.now() - assignedStart;
      jira.setLarge(false);
      jira.setInput("MOCK-1, MOCK-2, MOCK-404");
      await page.getByRole("textbox", { name: "이슈 번호", exact: false }).fill("MOCK-1, MOCK-2, MOCK-404");
      const search = page.getByRole("button", { name: "조회", exact: true });
      await search.click();
      for (const row of connected.result.rows) {
        const tr = page.getByRole("row").filter({ has: page.getByRole("cell", { name: row.key, exact: true }) });
        expect(row.issueUrl).toBe(jira.baseUrl + "/browse/" + row.key);
        await expect(tr.getByRole("cell")).toHaveText([row.key, row.summary, row.status, row.assignee, row.reporter, row.created, row.updated]);
      }
      await page.getByRole("button", { name: "Columns", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: "우선순위", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("columnheader", { name: "우선순위", exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Columns", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: "우선순위", exact: true }).click();
      await page.keyboard.press("Escape");
      const issueLink = page.getByRole("link", { name: "MOCK-1", exact: true });
      await expect(issueLink).toBeVisible();
      await expect(issueLink).toHaveAttribute("href", jira.baseUrl + "/browse/MOCK-1");
      if (screenshots) {
        for (const width of [1440, 640]) {
          await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
          await page.setViewportSize({ width, height: 900 });
          await page.reload();
          await page.locator(".sidebar").getByRole("button", { name: "Jira", exact: true }).click();
          await page.getByRole("button", { name: "간편 검색", exact: true }).click();
          const disclosure = page.getByRole("button", { name: width === 640 ? /추가 조건/ : /Additional conditions/ });
          await expect(page.locator('[data-view-field="account"]')).toHaveAttribute("placeholder", "Fixture PAT user");
          const capture = async state => {
            await page.mouse.move(0, 0);
            await page.screenshot({ path: `docs/design/assets/search-form-1370/${state}-${width}${width===640?"-ko-dark":""}.png`, mask: [page.locator(".sidebar-host-account"), page.locator(".views-page > header p")], maskColor: "#a1a1aa" });
          };
          await capture("default");
          await disclosure.click();
          await page.locator('[data-view-field="project"]').fill("MOCK");
          await page.locator('[data-view-field="reporter"]').fill("mock-user");
          await page.locator('[data-view-field="dateFrom"]').fill("2026-11-01");
          await page.locator('[data-view-field="dateTo"]').fill("2026-11-09");
          await disclosure.click();
          await search.click();
          await expect(page.getByRole("cell", { name: "MOCK-1", exact: true })).toBeVisible();
          await capture("collapsed");
          await page.getByRole("button", { name: width === 640 ? "열 선택" : "Columns", exact: true }).click();
          await capture("columns");
          await page.keyboard.press("Escape");
          await disclosure.click();
          await page.keyboard.press("Escape");
          await capture("expanded");
          if (width === 640) {
            await page.locator('[data-view-field="keys"]').scrollIntoViewIfNeeded();
            await capture("expanded-bottom");
          }
        }
        await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
        await page.reload();
        await page.locator(".sidebar").getByRole("button", { name: "Jira", exact: true }).click();
        await page.getByRole("button", { name: "간편 검색", exact: true }).click();
        await page.getByRole("button", { name: /Additional conditions/ }).click();
        await page.getByRole("textbox", { name: "이슈 번호", exact: false }).fill("MOCK-1, MOCK-2, MOCK-404");
        await search.click();
        await expect(page.getByRole("cell", { name: "MOCK-1", exact: true })).toBeVisible();
      }
      jira.setQuery({});
      await page.getByRole("textbox", { name: "이슈 번호", exact: false }).fill("");
      for (const [status, kind, advice] of [[401, "auth", "Authentication required."], [403, "forbidden", "Access denied."], [500, "unavailable", "Service unavailable."], [302, "failed", "View operation failed."], [408, "timeout", "Operation timed out."]]) {
        jira.setFault(status);
        const failed = await invoke();
        expect(failed.errorKind).toBe(kind);
        expect(JSON.stringify(failed)).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
        const queried = page.waitForResponse(response => response.url().endsWith("/api/views") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "run");
        await search.click();
        const ui = await (await queried).json();
        expect(ui.errorKind).toBe(kind);
        expect(JSON.stringify(ui)).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
        await expect(page.getByRole("alert").filter({ hasText: advice })).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: /Previous query result/ })).toBeVisible();
        expect(await page.locator("body").innerText()).not.toMatch(/RAW-JIRA-SENTINEL|mock-jira-token/);
      }
      expect(jira.redirects()).toBe(0);
      jira.setFault(0);
      jira.setSettings({ baseUrl: "https://jira.example.com/context", apiUrl: jira.baseUrl + "/rest/api/2/" });
      await jira.cli(["plugins", "settings", "community.jira", "--file", jira.settings]);
      jira.setInput("MOCK-2, MOCK-1, MOCK-2");
      const overridden = (await invoke()).result;
      expect(overridden.rows.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2"]);
      expect(overridden.rows.map(row => row.issueUrl)).toEqual(["https://jira.example.com/context/browse/MOCK-1", "https://jira.example.com/context/browse/MOCK-2"]);
      for (const baseUrl of ["https://user:password@example.com", "https://example.com?query=1", "https://example.com#fragment"]) {
        jira.setSettings({ baseUrl });
        await jira.cli(["plugins", "settings", "community.jira", "--file", jira.settings]);
        expect((await invoke()).errorKind).toBe("failed");
      }
      jira.setInput("MOCK-1, MOCK-2, MOCK-404");
      jira.setSettings({ baseUrl: jira.baseUrl });
      await jira.cli(["plugins", "settings", "community.jira", "--file", jira.settings]);
      await search.click();
      await expect(page.getByRole("cell", { name: "MOCK-1", exact: true })).toBeVisible();
      if (jira.mock) {
        jira.setSettings({ baseUrl: "http://127.0.0.1:8081" });
        await jira.cli(["plugins", "settings", "community.jira", "--file", jira.settings]);
        const healthResult = await jira.cli(["operation", "invoke", "community.jira.connection", "--input", jira.healthInput]);
        expect(healthResult.result).toEqual({ ok: true, message: "Jira 연결과 PAT 인증을 확인했습니다." });
        const mockAll = await queryRows({ status: "전체" });
        expect(mockAll.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2", "MOCK-6", "MOCK-8"]);
        // Mock supports connection and current-user search, not key-in JQL or comments.
        const mock = { result: mockAll };
        expect(mock.result.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2", "MOCK-6", "MOCK-8"]);
        expect(mock.result[0].summary).not.toBe("—");
        expect(mock.result[0].issueUrl).toBe("http://127.0.0.1:8081/browse/MOCK-1");
      }
    }
  } finally {
    await jira.cli(["plugins", "disable", "community.jira"]);
    await jira.cli(["plugins", "unregister", "community.jira"]);
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

  page.off("request", countRequest);
  return { secretSaves, assignedQueryMs, requestCounts, maxRequestsPerSecond: Math.max(0, ...Object.values(requestSeconds)) };
}
