async (page, { expect, pluginFixture, openFolderPicker, screenshots }) => {
  let latestRequestId;
  page.on("request", request => { if (request.url().endsWith("/api/plugins") && request.method() === "POST") { const body = request.postDataJSON(); if (body.action === "job-start") latestRequestId = body.requestId; } });
  pluginFixture.cli(["plugins", "register", pluginFixture.directory]);
  const plugin = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.jobs");
  pluginFixture.cli(["plugins", "trust", plugin.id, "--digest", plugin.digest]);
  pluginFixture.cli(["plugins", "enable", plugin.id]);
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
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/text");
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
  await pane.getByLabel("Result path in Root").fill("../outside.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Failed");
  await expect(pane.getByRole("alert")).toContainText(/outside|allowed|Root/i);
  await expect(pane.getByLabel("Result path in Root")).toBeEnabled();
  await expect(pane.getByRole("button", { name: "Start job", exact: true })).toBeEnabled();
  await pane.getByLabel("Result path in Root").fill("browser-result.md");
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
  // Selecting the retained job tab and starting another explicit request tests Stop.
  await page.getByRole("tab", { name: /Plugin jobs/ }).click();
  await pane.getByLabel("Result path in Root").fill("stopped-result.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await pane.getByRole("button", { name: "Request cancellation" }).click();
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Cancellation requested");
  await expect(pane.getByRole("status", { name: "Job status" })).toHaveText("Cancelled");
  await expect(pane.getByRole("button", { name: "Request cancellation" })).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  await pane.getByLabel("Input file").selectOption({ label: "slow.txt" });
  await pane.getByLabel("Result path in Root").fill("reopened-running.md");
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
      if (loseResponse) { loseResponse = false; await route.fetch(); await route.fulfill({ status: 200, contentType: "application/json", body: "{" }); return; }
    }
    await route.continue();
  };
  await page.route("**/api/plugins", monitor);
  await pane.getByLabel("Result path in Root").fill("closed-result.md");
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
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/file");
  await pane.getByLabel("Input file").selectOption({ label: "input.txt" });
  await expect(pane.getByLabel("Result path in Root")).toHaveValue("input.bin");
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
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Result path in Root").fill("failure-result.md");
  for (const [input, state] of [["fail.txt", "Failed"], ["uncertain.txt", "Outcome uncertain"]]) {
    await pane.getByLabel("Input file").selectOption({ label: input });
    await pane.getByRole("button", { name: "Start job", exact: true }).click();
    await expect(pane.getByRole("status", { name: "Job status" })).toHaveText(state);
    await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  }
  pluginFixture.cli(["plugins", "disable", plugin.id]);
  pluginFixture.cli(["plugins", "unregister", plugin.id]);
}
