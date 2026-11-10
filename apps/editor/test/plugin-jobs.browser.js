async (page, { expect, pluginFixture, openFolderPicker, screenshots }) => {
  let latestRequestId;
  page.on("request", request => { if (request.url().endsWith("/api/plugins") && request.method() === "POST") { const body = request.postDataJSON(); if (body.action === "job-start") latestRequestId = body.requestId; } });
  pluginFixture.cli(["plugins", "register", pluginFixture.directory]);
  const plugin = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.jobs");
  pluginFixture.cli(["plugins", "trust", plugin.id, "--registration", plugin.registrationId, "--digest", plugin.digest]);
  pluginFixture.cli(["plugins", "enable", plugin.id]);
  const scriptDialogs = [];
  page.on("dialog", dialog => { scriptDialogs.push(dialog.message()); void dialog.dismiss(); });
  // CLI setup happens outside the app; reload to discover the contributed sidebar screen.
  await page.reload();
  await page.setViewportSize({width:1440,height:900});
  const sidebarIcon = page.getByRole('button', {name:'Job fixture',exact:true}).locator('img');
  await expect(sidebarIcon).toBeVisible();
  // A real registered/trusted fixture icon, fetched from the owning HTTP Host.
  const iconResponse = await page.request.get(page.url().split("/").slice(0,3).join("/") + `/api/plugins/icon?id=${plugin.id}&digest=${plugin.digest}`, { headers: { Connection: "close" } });
  expect(iconResponse.headers()["content-type"]).toBe("image/svg+xml");
  expect(iconResponse.headers()["x-content-type-options"]).toBe("nosniff");
  await page.getByRole("button", { name: "Job fixture", exact: true }).click();
  await expect(page.locator('.document-tabs img.plugin-icon')).toHaveCount(1);
  const initialPanel = page.getByTestId("plugin-job-panel").filter({ visible: true });
  await expect(initialPanel.getByRole("group", { name: "Task", exact: true })).toBeVisible();
  await expect(initialPanel.getByRole("button", { name: /File export.*.txt.*.bin/s })).toBeVisible();
  await expect(initialPanel.locator("table")).toHaveCount(0);
  await expect(initialPanel.locator(".plugin-job-hint")).toHaveText("Open a folder to select input files.");
  await initialPanel.locator(".plugin-job-hint").focus();
  await expect(initialPanel.locator(".plugin-job-hint")).toBeFocused();

  await expect.poll(() => page.locator('.sidebar img.plugin-icon, .document-tabs img.plugin-icon').evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 32))).toBe(true);
  if (screenshots) await page.screenshot({path:"tmp/1346/screen-1440.png", mask:[page.locator(".sidebar-host-account")]});
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await expect(page.getByRole('region', { name: 'Job fixture', exact: true }).locator('.plugin-heading img.plugin-icon')).toHaveCount(1);
  if (screenshots) {
    await page.screenshot({path:"tmp/1346/settings-1440.png", mask:[page.locator(".sidebar-host-account")]});
    await page.getByRole("button", {name:"Appearance & language",exact:true}).click();
    await page.getByTestId("theme").selectOption("dark");
    await page.getByTestId("ui-language").selectOption("ko");
    await page.getByRole("button", {name:"플러그인",exact:true}).click();
    await page.setViewportSize({width:640,height:900});
    await expect(page.getByRole('region', { name: 'Job fixture', exact: true }).locator('.plugin-heading img.plugin-icon')).toBeVisible();
    await page.screenshot({path:"tmp/1346/settings-640-ko-dark.png", mask:[page.locator(".sidebar-host-account")]});
    await page.getByRole("tab", {name:"Job fixture",exact:true}).click();
    await expect(page.locator('.document-tabs img.plugin-icon')).toBeVisible();
    await page.screenshot({path:"tmp/1346/screen-640-ko-dark.png", mask:[page.locator(".sidebar-host-account")]});
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole("button", {name:"설정",exact:true}).click();
    await page.getByRole("button", {name:"표시·언어",exact:true}).click();
    await page.getByTestId("theme").selectOption("light");
    await page.getByTestId("ui-language").selectOption("en");
  }
  expect(scriptDialogs).toEqual([]);
  const other = pluginFixture.cli(["plugins", "start", plugin.id, "--input", pluginFixture.otherJobInput]);
  await expect.poll(() => pluginFixture.cli(["plugins", "status", other.job.requestId]).job.state).toBe("completed");
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.otherFolder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  const pane = page.getByTestId("plugin-jobs");
  await pane.getByLabel("Task", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
  await pane.getByLabel("Input file").selectOption({ label: "▸ nested" });
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  await expect(pane.getByRole("button", { name: "Start job", exact: true })).toBeEnabled();
  await pane.getByLabel("Recent jobs").selectOption(other.job.requestId);
  await expect(pane.getByLabel("Opened folder", { exact: true })).toHaveValue(pluginFixture.otherFolder);
  await expect(pane.getByLabel("Input file")).toHaveValue("");
  await expect(pane.getByRole("button", { name: "Return to opened folder" })).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "Start job", exact: true })).toBeDisabled();
  await pane.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  await pane.getByLabel("Result file").fill("../outside.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Failed");
  await expect(pane.getByRole("alert")).toContainText(/outside|allowed|Root/i);
  await expect(pane.getByLabel("Result file")).toBeEnabled();
  await expect(pane.getByRole("button", { name: "Start job", exact: true })).toBeEnabled();
  await pane.getByLabel("Result file").fill("browser-result.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("In progress");
  const requestId = latestRequestId;
  await expect(pane.getByRole("button", { name: "Recheck status" })).toHaveCount(0);
  await expect(pane.getByLabel("Request ID")).toHaveCount(0);
  expect(pluginFixture.cli(["plugins", "status", requestId]).job.requestId).toBe(requestId);
  await expect(pane.getByRole("button", { name: "Open result document" })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "result", requestId]).job.state).toBe("completed");
  expect(pluginFixture.cli(["jobs", "list", plugin.id]).jobs.some(job => job.requestId === requestId)).toBe(true);
  for (const width of [1440, 640]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await pane.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (screenshots) await page.screenshot({ path: `tmp/plugin-jobs/completed-${width}.png` });
  }
  await pane.getByRole("button", { name: "Open result document" }).click();
  await expect(page.locator(".tiptap").filter({ visible: true })).toContainText("Job result.");
  const image = page.locator(".tiptap").filter({ visible: true }).getByRole("img", { name: "Imported image", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveAttribute("src", /assets/);
  await expect(page.locator(".tiptap").filter({ visible: true })).toContainText("A.3");
  await expect(page.getByRole("tab", { name: /Plugin jobs/ })).toBeVisible();
  const logo = page.locator('.tiptap').filter({ visible: true }).locator('figure').filter({ has: page.getByRole('img', { name: 'Logo', exact: true }) });
  await expect(logo.locator('figcaption')).toHaveText('Unnumbered logo');
  await expect(logo.locator('figcaption')).not.toHaveAttribute('data-caption-prefix');
  await expect(page.locator('.tiptap').filter({ visible: true }).getByTestId('table-caption')).not.toHaveAttribute('data-caption-prefix');
  await page.reload();
  await expect(page.locator('.tiptap').filter({ visible: true })).toContainText('Unnumbered logo');
  await expect(logo.locator('figcaption')).not.toHaveAttribute('data-caption-prefix');
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(width => { localStorage.setItem('litzio.uiLanguage', width === 640 ? 'ko' : 'en'); localStorage.setItem('litzio.theme', width === 640 ? 'dark' : 'light'); }, width);
      await page.reload();
      await expect(logo).toBeVisible();
      await page.screenshot({path: `tmp/plugin-jobs/unnumbered-${width}.png`, mask:[page.locator('.sidebar-host-account')]});
    }
    await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'en'); localStorage.setItem('litzio.theme', 'light'); });
    await page.reload();
  }
  // Reload closes the transient job tab; reopen it through its normal command.
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  await pane.getByLabel("Task", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  await pane.getByLabel("Result file").fill("stopped-result.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await pane.getByRole("button", { name: "Request cancellation" }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Cancellation requested");
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Cancelled");
  await expect(pane.getByRole("button", { name: "Request cancellation" })).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  await pane.getByLabel("Input file").selectOption({ label: "slow.txt" });
  await pane.getByLabel("Result file").fill("reopened-running.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("In progress");
  await page.getByRole("button", { name: /Close Plugin jobs/ }).click();
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("In progress");
  await expect(pane.getByRole("button", { name: "Open result document" })).toBeVisible({ timeout: 15000 });
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  let starts = 0, observations = 0, loseResponse = true;
  const monitor = async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    if (body.action === "job-start") starts++;
    if (body.action === "job-status") {
      observations++;
      if (loseResponse) { loseResponse = false; await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } }); await route.fulfill({ status: 200, contentType: "application/json", body: "{" }); return; }
    }
    await route.continue();
  };
  await page.route("**/api/plugins", monitor);
  await pane.getByLabel("Result file").fill("closed-result.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Outcome uncertain");
  const lostId = latestRequestId;
  expect(starts).toBe(1);
  await page.getByRole("button", { name: /Close Plugin jobs/ }).click();
  await expect(pane).toHaveCount(0);
  const stoppedObservations = observations;
  await expect.poll(() => pluginFixture.cli(["plugins", "status", lostId]).job.state).toBe("completed");
  expect(observations).toBe(stoppedObservations);
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Completed");
  await expect(pane.getByRole("button", { name: "Open result document" })).toBeVisible();
  expect(starts).toBe(1);
  await page.unroute("**/api/plugins", monitor);
  await pane.getByLabel("Task", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Task", { exact: true }).selectOption("fixture.jobs/file");
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  await expect(pane.getByLabel("Result file")).toHaveValue("input.bin");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("button", { name: "Copy result path", exact: true })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  const fileResult = pluginFixture.cli(["plugins", "result", latestRequestId]);
  expect(fileResult.job.result.kind).toBe("file");
  await expect(pane.getByText(fileResult.job.result.path, { exact: true })).toBeVisible();
  const cliFile = pluginFixture.cli(["plugins", "start", plugin.id, "--input", pluginFixture.fileJobInput]);
  await expect.poll(() => pluginFixture.cli(["plugins", "status", cliFile.job.requestId]).job.state).toBe("completed");
  expect(pluginFixture.cli(["plugins", "result", cliFile.job.requestId]).job.result.path.replaceAll("\\", "/")).toBe(pluginFixture.folder.replaceAll("\\", "/") + "/nested/input.bin");
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `tmp/plugin-jobs/file-${width}.png` });
    }
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByTestId("theme").selectOption("dark");
    await page.getByTestId("ui-language").selectOption("ko");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `tmp/plugin-jobs/file-ko-dark-${width}.png` });
    }
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByTestId("theme").selectOption("light");
    await page.getByTestId("ui-language").selectOption("en");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
  }
  await pane.getByLabel("Task", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Result file").fill("failure-result.md");
  for (const [input, state] of [["fail.txt", "Failed"], ["uncertain.txt", "Outcome uncertain"]]) {
    await pane.getByLabel("Input file").selectOption({ label: input });
    await pane.getByRole("button", { name: "Start job", exact: true }).click();
    await expect(pane.getByRole("status", { name: "Job status" })).toHaveText(state);
    await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  }
  const expandExplorer=page.getByRole('button',{name:'Expand Explorer',exact:true});
  if(await expandExplorer.isVisible()) await expandExplorer.click();
  await page.locator(".sidebar").getByRole("button", { name: "Job fixture", exact: true }).click();
  const panel = page.getByTestId("plugin-job-panel").filter({ visible: true });
  await panel.getByLabel("Opened folder", { exact: true }).selectOption(pluginFixture.folder);
  await panel.getByRole("checkbox", { name: "batch-a.txt", exact: true }).check();
  await panel.getByRole("checkbox", { name: "batch-b.txt", exact: true }).check();
  await expect(panel.locator(".plugin-job-start")).toContainText("2 files selected");
  await expect(panel.locator(".plugin-job-start").getByRole("button")).toHaveText("File export");
  await panel.locator(".plugin-job-start").getByRole("button").click();
  for (const file of ["batch-a.txt", "batch-b.txt"]) {
    const row = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: file, exact: true }) });
    await expect(row.getByRole("status")).toHaveText("Completed");
  }
  // Existing results are preserved and automatically numbered.
  const batch = pluginFixture.cli(["plugins", "start", plugin.id, "--job", "file", "--root", pluginFixture.folder, "--file", "cli-a.txt", "--file", "cli-b.txt"]);
  expect(batch.files).toHaveLength(2);
  for (const file of batch.files) await expect.poll(() => pluginFixture.cli(["plugins", "status", file.requestId]).job.state).toBe("completed");
  await panel.getByRole("checkbox", { name: "batch-a.txt", exact: true }).check();
  await panel.getByRole("checkbox", { name: "slow.txt", exact: true }).check();
  await panel.locator(".plugin-job-start").getByRole("button").click();
  await expect(panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "batch-a.txt", exact: true }) }).first().getByRole("cell", { name: "batch-a-2.bin", exact: true })).toBeVisible();
  await expect(panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "slow.txt", exact: true }) }).first().getByRole("status")).toHaveText("Completed", { timeout: 15000 });
  await panel.getByRole("button", { name: /Text import/ }).click();
  await panel.getByRole("checkbox", { name: "slow.txt", exact: true }).check();
  await panel.locator(".plugin-job-start").getByRole("button").click();
  const stoppedRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "slow.txt", exact: true }) }).first();
  await stoppedRow.getByRole("button", { name: "Request cancellation", exact: true }).click();
  await expect(stoppedRow.getByRole("status")).toHaveText("Cancelled");
  await panel.getByRole("checkbox", { name: "start-fail.txt", exact: true }).check();
  await panel.locator(".plugin-job-start").getByRole("button").click();
  const failureRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "start-fail.txt", exact: true }) }).first();
  await expect(failureRow.getByRole("status")).toHaveText("Outcome uncertain");
  await failureRow.getByRole("button", { name: "Job details: start-fail.txt", exact: true }).hover();
  await expect(page.locator("[data-slot=tooltip-content]")).toContainText("The plugin could not acknowledge the start request.");
  await page.keyboard.press("Escape");
  await panel.getByRole("checkbox", { name: "input.txt", exact: true }).check();
  await panel.locator(".plugin-job-start").getByRole("button").click();
  const nativeRow = panel.getByRole("row").filter({ has: page.getByRole("cell", { name: "input.txt", exact: true }) }).first();
  await expect(nativeRow.getByRole("button", { name: "Open result: input.txt", exact: true })).toBeVisible();
  for (const selector of [".plugin-job-files", ".view-table-scroll"]) {
    expect(await panel.locator(selector).evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  }
  expect((await failureRow.boundingBox()).height).toBe((await nativeRow.boundingBox()).height);

  if (screenshots) {
    for (const width of [1440, 640]) {
      if (width === 640) {
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByTestId("theme").selectOption("dark");
        await page.getByTestId("ui-language").selectOption("ko");
        await page.keyboard.press("Escape");
      }
      await page.setViewportSize({ width, height: 900 });
      await panel.scrollIntoViewIfNeeded();
      await page.getByTestId("view-workspace").filter({ visible: true }).getByRole("heading", { name: "Job fixture", exact: true }).scrollIntoViewIfNeeded();
      await expect(panel.getByRole("row").nth(1).getByRole("cell").first()).toHaveText("input.txt");
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width === 640) {
        expect(await panel.locator(".view-table-scroll").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        const info = panel.getByRole("button", { name: "작업 상세: start-fail.txt", exact: true }).first();
        await nativeRow.getByRole("button", { name: "결과 열기: input.txt", exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(info).toBeFocused();
        await expect(page.locator("[data-slot=tooltip-content]")).toBeVisible();
        await expect(page.locator("[data-slot=tooltip-content]")).toContainText("플러그인이 작업 시작을 확인하지 못했습니다.");
        await page.screenshot({ path: "tmp/plugin-jobs/failure-details-640.png", maskColor: "#a1a1aa", mask: [page.locator(".sidebar-host-account"), panel.getByLabel("열린 폴더", { exact: true })] });
        await page.keyboard.press("Escape");
        await nativeRow.getByRole("cell").first().click();
      }
      await page.getByTestId("view-workspace").filter({ visible: true }).getByRole("heading", { name: "Job fixture", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `tmp/plugin-jobs/panel-${width}.png`, maskColor: "#a1a1aa", mask: [page.locator(".sidebar-host-account"), panel.getByLabel(width === 640 ? "열린 폴더" : "Opened folder", { exact: true })] });
    }
    // Screenshot-only scroll inspection; this is separate from the user-flow assertions.
    await panel.locator(".view-table-scroll").evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.screenshot({ path: "tmp/plugin-jobs/panel-640-end.png", maskColor: "#a1a1aa", mask: [page.locator(".sidebar-host-account"), panel.getByLabel("열린 폴더", { exact: true })] });
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByTestId("theme").selectOption("light");
    await page.getByTestId("ui-language").selectOption("en");
    await page.keyboard.press("Escape");
  }
  await nativeRow.getByRole("button", { name: "Open result: input.txt", exact: true }).click();
  await expect(page.locator(".tiptap").filter({ visible: true })).toContainText("Job result.");
  pluginFixture.cli(["plugins", "disable", plugin.id]);
  pluginFixture.cli(["plugins", "unregister", plugin.id]);
}
