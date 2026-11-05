async (page, { expect, pluginFixture }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  const input = page.getByLabel("Local plugin artifact", { exact: true });
  const register = page.getByRole("button", { name: "Register plugin", exact: true });
  await expect(register).toBeDisabled();
  const rejectRegistration = async directory => {
    await input.fill(directory);
    const rejected = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().method() === "POST");
    await register.click();
    const response = await rejected;
    expect(response.status()).toBe(400);
    const failure = await response.json();
    await expect(page.getByRole("alert")).toContainText(failure.error);
    await expect(input).toHaveValue(directory);
  };
  await rejectRegistration(pluginFixture.directory + "-missing");
  await rejectRegistration(pluginFixture.folder);
  // The runner's fixture directory is inside the checkout's tmp directory.
  const normalized = pluginFixture.directory.replaceAll("\\", "/");
  await input.fill(normalized.slice(0, normalized.indexOf("/tmp/")) + "/plugins/onedrive/artifact");
  await register.click();
  await expect(page.getByRole("switch", { name: "Enable OneDrive", exact: true })).not.toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: /^Plugin disabled$/ })).toBeVisible();
  await expect(register).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("switch", { name: "Enable OneDrive", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Plugin running$/ })).toBeVisible();
  await page.getByRole("switch", { name: "Enable OneDrive", exact: true }).click();
  const removed = await page.request.post(await page.evaluate(() => location.origin + "/api/plugins"), { data: { action: "unregister", id: "litzio.onedrive" } });
  expect(removed.ok()).toBe(true);
}
