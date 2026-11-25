async (page, { openFolderPicker, expect }) => {
  const { folder, name, output, steps = [] } = captureConfig;
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(folder);
  await page.getByTestId("folder-open").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const button = page.getByTestId("activity-bar").getByRole("button", { name, exact: true });
  await button.click();
  const screen = page.getByTestId("view-workspace").filter({ visible: true });
  await expect(screen).toBeVisible();
  await page.waitForFunction(() => {
    const screen = Array.from(document.querySelectorAll('[data-testid="view-workspace"]')).find(node => node.getClientRects().length);
    return screen?.querySelector("button, input, h2, h3, [role=alert], svg");
  });
  const mask = [page.getByText(/(?:[a-z]:[\\/]|\/Users\/|\/home\/)/i)];
  await screen.screenshot({ path: output + "-opened.png", mask, maskColor: "#ddd" });
  const observations = [{ text: await screen.innerText(), aria: await screen.ariaSnapshot() }];
  for (const [index, step] of steps.entries()) {
    try {
      const target = step.selector ? page.locator(step.selector)
        : step.role ? page.getByRole(step.role, { name: step.name, exact: true })
        : page.getByText(step.name, { exact: true });
      if (step.upload) await target.setInputFiles(folder + "/" + step.upload, { timeout: 5000 });
      else if (step.fill !== undefined) {
        await target.fill(step.fill, { timeout: 5000 });
        await target.press("Tab", { timeout: 5000 });
      } else if (step.double) await target.dblclick({ timeout: 5000 });
      else await target.click({ timeout: 5000 });
      if (step.expect) await expect(page.getByText(step.expect, { exact: step.exact ?? false }).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
      const document = page.locator('[data-document-tab][data-active="true"]');
      if (step.document) {
        await expect(screen).toHaveCount(0, { timeout: 8000 });
        await expect(document.locator(".document-editor")).toBeVisible({ timeout: 8000 });
      }
      const workspace = step.document || !await screen.count() ? document : screen;
      if (step.capture !== false) await workspace.screenshot({ path: output + "-" + (index + 1) + ".png", timeout: 5000, mask, maskColor: "#ddd" });
      observations.push({ text: await workspace.innerText({ timeout: 5000 }), aria: await workspace.ariaSnapshot({ timeout: 5000 }) });
    } catch (error) {
      observations.push({ error: String(error) });
      break;
    }
  }
  return observations;
}
