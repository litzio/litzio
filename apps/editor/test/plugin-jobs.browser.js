async (page, { expect, pluginFixture, openFolderPicker, screenshots }) => {
  pluginFixture.cli(["plugins", "register", pluginFixture.directory]);
  const plugin = pluginFixture.cli(["plugins", "list"]).plugins.find(p => p.id === "fixture.jobs");
  pluginFixture.cli(["plugins", "trust", plugin.id, "--digest", plugin.digest]);
  pluginFixture.cli(["plugins", "enable", plugin.id]);
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(pluginFixture.folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  const pane = page.getByTestId("plugin-jobs");
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/text");
  await pane.getByLabel("Host input file").selectOption({ label: "input.txt" });
  await pane.getByLabel("Result path in Root").fill("browser-result.md");
  await pane.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(pane.getByText(/^running/)).toBeVisible();
  const requestId = await pane.getByLabel("Request ID").inputValue();
  expect(pluginFixture.cli(["plugins", "status", requestId]).job.requestId).toBe(requestId);
  await expect(pane.getByRole("button", { name: "Open result document" })).toBeVisible();
  expect(pluginFixture.cli(["plugins", "result", requestId]).job.state).toBe("completed");
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
  await expect(pane.getByText(/^stopped/)).toBeVisible();
  await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
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
  await expect(pane.getByText(/^uncertain ·/)).toBeVisible();
  const lostId = await pane.getByLabel("Request ID").inputValue();
  expect(starts).toBe(1);
  await page.getByRole("button", { name: /Close Plugin jobs/ }).click();
  await expect(pane).toHaveCount(0);
  const stoppedObservations = observations;
  await expect.poll(() => pluginFixture.cli(["plugins", "status", lostId]).job.state).toBe("completed");
  expect(observations).toBe(stoppedObservations);
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name: "Plugin jobs", exact: true }).click();
  await pane.getByLabel("Request ID").fill(lostId);
  await pane.getByRole("button", { name: "Check status" }).click();
  await expect(pane.getByRole("button", { name: "Open result document" })).toBeVisible();
  expect(starts).toBe(1);
  await page.unroute("**/api/plugins", monitor);
  await pane.getByLabel("Job", { exact: true }).selectOption("fixture.jobs/text");
  for (const [input, state] of [["fail.txt", "failed"], ["uncertain.txt", "uncertain"]]) {
    await pane.getByLabel("Host input file").selectOption({ label: input });
    await pane.getByRole("button", { name: "Start job", exact: true }).click();
    await expect(pane.getByText(new RegExp(`^${state} ·`))).toBeVisible();
    await expect(pane.getByRole("button", { name: "Open result document" })).toHaveCount(0);
  }
  pluginFixture.cli(["plugins", "disable", plugin.id]);
  pluginFixture.cli(["plugins", "unregister", plugin.id]);
}
