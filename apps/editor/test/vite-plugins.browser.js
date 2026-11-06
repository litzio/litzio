async (page, { expect, pluginFixture }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  const official = page.getByRole("region", { name: "OneDrive", exact: true });
  const officialToggle = official.getByRole("switch", { name: "Enable OneDrive", exact: true });
  await expect(official.getByText("Official plugin", { exact: true })).toBeVisible();
  await expect(officialToggle).not.toBeChecked();
  await officialToggle.click();
  await expect(official.getByRole("status").filter({ hasText: /^Plugin running$/ })).toBeVisible();
  await officialToggle.click();
  await expect(official.getByRole("status").filter({ hasText: /^Plugin disabled$/ })).toBeVisible();

  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  const input = page.getByTestId("folder-path");
  const register = page.getByTestId("folder-open");
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
  await input.fill(pluginFixture.directory);
  await register.click();
  await expect(input).not.toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const external = page.getByRole("region", { name: "Vite fixture", exact: true });
  const toggle = external.getByRole("switch", { name: "Enable Vite fixture", exact: true });
  await expect(toggle).toBeDisabled();
  await external.getByRole("button", { name: "Trust this artifact", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Trust this artifact", exact: true }).click();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(external.getByRole("status").filter({ hasText: /^Plugin running$/ })).toBeVisible();
  const listing = await (await page.request.get(await page.evaluate(() => location.origin + "/api/plugins"))).json();
  expect(listing.plugins.find(p => p.id === "fixture.vite").status.message).toBe("0.1.0");
  await toggle.click();
  const removed = await page.request.post(await page.evaluate(() => location.origin + "/api/plugins"), { data: { action: "unregister", id: "fixture.vite" } });
  expect(removed.ok()).toBe(true);
}
