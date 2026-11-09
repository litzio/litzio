async (page, { expect, pluginFixture, screenshots, openFolderPicker }) => {
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
  const beforeEnableLists = listRequests;
  await official.click(); await expect(official).toBeChecked();
  expect(listRequests).toBe(beforeEnableLists);
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
  await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
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
    await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
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
  await page.getByRole("button", { name: "Drive fixture settings", exact: true }).click();
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
  await expect(page.locator(".plugin-settings-dialog")).not.toBeVisible();
  // Escape exits Settings after the nested dialog has finished closing.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
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
    await docling.cli(["plugins", "trust", id, "--digest", registered.digest]);
    await docling.cli(["plugins", "enable", id]);
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
    await expect(panel.getByRole("button", { name: "Start job", exact: true })).toBeDisabled();
    // Connection reads need no folder; file jobs explicitly select an opened Root.
    await openFolderPicker(page);
    await page.getByTestId("folder-path").fill(pluginFixture.folder);
    await page.getByTestId("folder-open").click();
    await expect(page.getByTestId("folder-path")).not.toBeVisible();
    await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
    await panel.getByLabel("Job", { exact: true }).selectOption("convert-pdf");
    await panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true }).check();
    await panel.getByRole("checkbox", { name: "dashboard-b.pdf", exact: true }).check();
    await panel.getByRole("button", { name: "Start job", exact: true }).click();
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
    await expect(filePane.getByLabel("Result path in Root")).toHaveValue("source.docling");
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
    await expect(editor).not.toContainText("Docling conversion:");
    await page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).click();
    // Re-selecting the current Root must preserve its loaded files.
    await expect(panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true })).toBeVisible();
    await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
    await expect(panel.getByRole("checkbox", { name: "dashboard-a.pdf", exact: true })).toBeVisible();
    await panel.getByLabel("Job", { exact: true }).selectOption("create-document");
    await panel.getByRole("checkbox", { name: "sample.docling", exact: true }).check();
    await panel.getByRole("button", { name: "Start job", exact: true }).click();
    const nativeRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "sample.docling", exact: true }) }).first();
    await expect(nativeRow.getByRole("status")).toHaveText("Completed");
    await nativeRow.getByRole("button", { name: "Open result: sample.docling", exact: true }).click();
    await expect(editor).toContainText("PDF body *literal*.");
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
      await page.getByLabel("pat: Not configured", { exact: true }).fill("mock-jira-token");
      await saveSecret();
      await expect(page.getByLabel("pat: Configured", { exact: true })).toHaveValue("");
      await jira.cli(["plugins", "trust", "community.jira", "--digest", registered.digest]);
      await jira.cli(["plugins", "enable", "community.jira"]);
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
      expect(connected.result.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2"]);
      expect(connected.result[0].assignee).toBe("—");
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
      const assignedStart = Date.now();
      const queryButton = page.getByRole("button", { name: "조회", exact: true });
      const queryRows = async value => {
        jira.setQuery(value);
        const cli = await invoke();
        expect(cli.receipt.outcome).toBe("success");
        return cli.result;
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
      await page.getByRole("textbox", { name: "계정", exact: false }).fill(account);
      await page.getByRole("combobox", { name: "해결 여부", exact: false }).selectOption("전체");
      await queryButton.click();
      await expect(page.getByRole("cell", { name: "MOCK-6", exact: true })).toBeVisible();
      expect((await queryRows({ status: "해결됨" })).map(row => row.key)).toEqual(["MOCK-2"]);
      const filters = { project: "MOCK", reporter: account, dateField: "생성일", dateFrom: "2026-11-01", dateTo: "2026-11-09" };
      await queryRows(filters);
      expect(jira.searches()[0].jql).toBe('assignee = currentUser() AND resolution = Unresolved AND project = "MOCK" AND reporter = "someone\\\"\\\\else" AND created >= "2026-11-01" AND created < "2026-11-10" ORDER BY updated DESC');
      for (const [field, value] of Object.entries(filters).filter(([field]) => field !== "dateField")) await page.getByRole("textbox", { name: ({ project: "프로젝트 키", reporter: "보고자", dateFrom: "시작일", dateTo: "종료일" })[field], exact: false }).fill(value);
      await page.getByRole("combobox", { name: "기간 기준", exact: false }).selectOption("생성일");
      await queryButton.click();
      await expect(page.getByRole("cell", { name: "MOCK-6", exact: true })).toBeVisible();
      await queryRows({ dateFrom: "2026-02-30" }).then(() => { throw new Error("Invalid date accepted"); }, () => {});
      for (const label of ["프로젝트 키", "보고자", "시작일", "종료일"]) await page.getByRole("textbox", { name: label, exact: false }).fill("");
      jira.setQuery({ key: "MOCK-1" });
      const detail = await jira.cli(["operation", "invoke", "community.jira.detail", "--input", jira.input]);
      expect(detail.receipt.outcome).toBe("success");
      expect(detail.result).toMatchObject({ key: "MOCK-1", issueUrl: jira.baseUrl + "/browse/MOCK-1", commentsTotal: 12, commentsStartAt: 0, commentsReturned: 10, descriptionTruncated: true });
      expect(detail.result.description).toHaveLength(16000);
      expect(detail.result.comments[0]).toMatchObject({ id: "12", bodyTruncated: true });
      expect(detail.result.comments[0].body).toHaveLength(4000);
      expect(Number.isFinite(Date.parse(detail.result.fetchedAt))).toBe(true);
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
      await expect(page.getByText("500 / 500", { exact: true })).toBeVisible();
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
      for (const row of connected.result) {
        const tr = page.getByRole("row").filter({ has: page.getByRole("cell", { name: row.key, exact: true }) });
        expect(row.issueUrl).toBe(jira.baseUrl + "/browse/" + row.key);
        await expect(tr.getByRole("cell")).toHaveText([row.key, row.summary, row.status, row.assignee, row.reporter, row.created, row.updated]);
      }
      const issueLink = page.getByRole("link", { name: "MOCK-1", exact: true });
      await expect(issueLink).toBeVisible();
      await expect(issueLink).toHaveAttribute("href", jira.baseUrl + "/browse/MOCK-1");
      if (screenshots) {
        for (const width of [1440, 640]) {
          if (width === 640) {
            await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
            await page.reload();
            await page.getByRole("button", { name: "설정", exact: true }).click();
            await page.getByRole("button", { name: "플러그인", exact: true }).click();
            await page.keyboard.press("Escape");
            await page.locator(".sidebar").getByRole("button", { name: "Jira", exact: true }).click();
            await page.getByRole("button", { name: "간편 검색", exact: true }).click();
            await page.getByRole("textbox", { name: "이슈 번호", exact: false }).fill("MOCK-1, MOCK-2, MOCK-404");
            await search.click();
            await expect(page.getByRole("cell", { name: "MOCK-1", exact: true })).toBeVisible();
          }
          await page.setViewportSize({ width, height: 900 });
          await page.getByRole("table").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `tmp/jira-1350/issues-${width}.png`, mask: [page.locator(".sidebar-host-account"), page.locator(".view-controls select"), page.locator(".views-page > header p")], maskColor: "#a1a1aa" });
        }
        await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
        await page.reload(); await openSettings();
        await page.keyboard.press("Escape");
      await page.locator(".sidebar").getByRole("button", { name: "Jira", exact: true }).click();
        await page.getByRole("button", { name: "간편 검색", exact: true }).click();
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
      expect(overridden.map(row => row.key)).toEqual(["MOCK-1", "MOCK-2"]);
      expect(overridden.map(row => row.issueUrl)).toEqual(["https://jira.example.com/context/browse/MOCK-1", "https://jira.example.com/context/browse/MOCK-2"]);
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
