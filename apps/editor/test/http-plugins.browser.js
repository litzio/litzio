async (page, { expect, pluginFixture, screenshots, openFolderPicker, openDocument, reloadDocument, waitForExplorerLayout }) => {
  const captureEntries = screenshots;
  if (pluginFixture.docling?.entryCaptureOnly) screenshots = false;
  // Manual visual review only; automatic assertions do not depend on these images.
  const captureEntry = async (name, widths = [1440]) => {
    if (!captureEntries) return;
    const viewport = page.viewportSize();
    const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme);
    for (const width of widths) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.mouse.move(0,0);
      await page.screenshot({path:`docs/design/assets/compare-entry-1465/${name}-${width}-${theme}.png`, mask:[page.locator(".sidebar-host-account"),page.locator(".sidebar-folder-header"),page.locator(".document-location"),page.getByLabel("Opened folder",{exact:true})],maskColor:"#a1a1aa"});
    }
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, originalTheme);
    await page.setViewportSize(viewport);
  };

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
  // Manual comparison evidence exercises only comparison; automatic HTTP still runs
  // the entire registration/settings/secret contract below.
  if (!(screenshots && pluginFixture.docling?.realFile && pluginFixture.docling?.comparisonCapture)) {
  await openSettings();
  const designated = pluginFixture.cli(["plugins", "list"]).plugins.filter(p => ["community.docling"].includes(p.id));
  expect(designated).toHaveLength(1);
  for (const plugin of designated) {
    expect(plugin.bundled).toBe(true); expect(plugin.official).toBe(false);
    expect(plugin.enabled).toBe(false); expect(plugin.trusted).toBe(false);
  }
  await page.getByRole("switch", { name: "Enable Docling", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Trust and enable Docling?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Enable Docling", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  await page.getByTestId("folder-path").fill(pluginFixture.directory);
  // Deliver the same list refresh used after settings changes while the user is
  // editing the picker. A changed description proves the refreshed React UI committed.
  await page.route("**/api/plugins", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    const value = await response.json();
    value.plugins.find(plugin => plugin.id === "community.docling").description = "Refreshed during plugin draft";
    await route.fulfill({ response, json: value });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("plugins-changed")));
  await expect(page.locator('section[aria-label="Docling"] .settings-description').first()).toHaveText("Refreshed during plugin draft");
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
  await expect(page.getByRole("region", { name: "Drive fixture", exact: true }).getByText("Community plugin", { exact: true })).toBeVisible();
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
  await expect(page.locator(".tiptap").first()).toHaveText(beforeDisable);
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
    if(await expandExplorer.isVisible()) await expandExplorer.click();
    const icon = page.locator(".sidebar").getByRole("button", { name: "Docling", exact: true }).locator("img.plugin-icon");
    await expect(icon).toBeVisible();
    await expect.poll(() => icon.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await openScreen('Docling');
    const panel = page.getByTestId("plugin-job-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".plugin-job-start").getByRole("button")).toBeDisabled();
    // Connection reads need no folder; file jobs explicitly select an opened Root.
    await openFolderPicker(page);
    await page.getByTestId("folder-path").fill(pluginFixture.folder);
    await page.getByTestId("folder-open").click();
    await expect(page.getByTestId("folder-path")).not.toBeVisible();
    await openScreen('Docling');
    await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
    // Only PDF conversion remains in the task panel; workspace opening uses Explorer.
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
    // The source archive opens its authoritative document directly. External generated copies are no longer Docling's write path.
    await showExplorer();
    const sourceRow = page.getByRole("treeitem").filter({has:page.locator(".sidebar-tree-name",{hasText:/^sample\.docling$/})});
    await sourceRow.focus();await sourceRow.press("Enter");
    const comparison = page.locator(".review-renderer").filter({visible:true});
    const pageCheck = n => comparison.getByRole("button",{name:`Page ${n}: Page checked`,exact:true});
    await expect(comparison.locator(".review-page img").first()).toBeVisible();
    await expect.poll(() => comparison.locator(".review-page img").first().evaluate(c => c.naturalWidth)).toBeGreaterThan(0);
    await comparison.getByRole("button",{name:"section_header · Supported",exact:true}).click();
    await expect(comparison.locator(".review-highlights > div")).toHaveCount(1);
    await expect(comparison.locator('.review-wires path[data-selected="true"]')).toHaveCount(1);
    await expect(comparison.locator(".heading-level").first()).toHaveText("H2");
    await comparison.locator(".tiptap p").filter({hasText:"PDF body *literal*."}).click();
    await expect(comparison.locator('[data-page-no="2"]')).toBeInViewport();
    await expect(comparison.getByRole("button",{name:"text · Supported",exact:true}).first()).toHaveAttribute("aria-pressed","true");
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await comparison.getByRole("spinbutton",{name:"Go to page",exact:true}).fill("1");
    await comparison.getByRole("spinbutton",{name:"Go to page",exact:true}).press("Enter");
    await expect(comparison.getByRole("spinbutton",{name:"Go to page",exact:true})).toHaveValue("1");
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await expect(comparison.getByRole("button",{name:"Refresh data",exact:true})).toBeEnabled();
    let releaseProgress;
    const heldProgress = new Promise(resolve => { releaseProgress = resolve; });
    let holdProgress = true, rejectProgress = false;
    await page.route("**/api/reviews",async route => {
      if (route.request().postDataJSON()?.action === "workspace-progress") {
        if (holdProgress) await heldProgress;
        if (rejectProgress) {
          // A definite Host rejection records this request ID; a fabricated failure would correctly remain unknown.
          const request=route.request();
          const response=await route.fetch({postData:JSON.stringify({...request.postDataJSON(),baseline:"0".repeat(64)}),headers:{...request.headers(),Connection:"close"}});
          return route.fulfill({json:await response.json()});
        }
      }
      await route.continue();
    });
    try {
      await pageCheck(1).click();
      await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeVisible();
      await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
      await expect(comparison).toBeVisible();
      await comparison.getByRole("spinbutton",{name:"Go to page",exact:true}).fill("2");
      await comparison.getByRole("spinbutton",{name:"Go to page",exact:true}).press("Enter");
      await expect(comparison.locator('[data-page-no="2"]')).toBeInViewport();
      await pageCheck(2).click();
    } finally { holdProgress = false; releaseProgress(); }
    await expect(comparison.getByText("Saving review progress…",{exact:true})).toBeHidden();
    await expect(comparison.getByRole("button",{name:"Refresh data",exact:true})).toBeEnabled();
    await expect(pageCheck(2)).toHaveAttribute("aria-pressed","true");
    rejectProgress = true;
    await pageCheck(2).click();
    await expect(comparison).toContainText("Review progress could not be saved.");
    await expect(pageCheck(2)).toBeDisabled();
    rejectProgress = false;
    await comparison.getByRole("button",{name:"Refresh data",exact:true}).click();
    await expect(pageCheck(2)).toHaveAttribute("aria-pressed","true");
    await page.unroute("**/api/reviews");
    const workspaceInput={root:pluginFixture.folder,workspace:"sample.docling",plugin:id,job:"create-document"};
    const progress=await docling.review("workspace-compare",workspaceInput);
    expect(progress.progress).toEqual({checkedPages:[1,2],lastPage:2});
    await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
    await showExplorer();await sourceRow.focus();await sourceRow.press("Enter");
    await expect(pageCheck(2)).toHaveAttribute("aria-pressed","true");
    await page.getByRole("tab",{name:"Source comparison",exact:true}).locator("..").getByRole("button").click();
    const found=await docling.review("workspace-find",{root:pluginFixture.folder,path:"sample.docling"});
    expect(found.targets.some(target=>target.workspace==="sample.docling")).toBe(true);
    // K1 native-document admission is closed for workspace providers; conversion remains offline after initial creation.
    await expect(docling.cli(["plugins","start",id,"--input",docling.jobInput])).rejects.toThrow();
    expect(docling.conversionRequests()).toBe(beforeNativeRequests);

  } finally {
    if (doclingRegistered) {
      await docling.cli(["plugins", "disable", id]);
      await docling.cli(["plugins", "unregister", id]);
    }
  }

}
