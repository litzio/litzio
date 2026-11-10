async (page, { expect, pluginFixture, screenshots }) => {
  // Match the HTTP fixture: machine OneDrive accounts are unrelated to connection settings.
  await page.route("**/api/plugins", async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close" } });
    const value = await response.json();
    for (const plugin of value.plugins ?? []) if (plugin.id === "litzio.onedrive" && plugin.running) {
      plugin.status = { available: true, folders: [], decorations: [], accounts: [] };
    }
    await route.fulfill({ response, json: value });
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  const official = page.getByRole("region", { name: "OneDrive", exact: true });
  const officialToggle = official.getByRole("switch", { name: "Enable OneDrive", exact: true });
  await expect(official.getByText("Official plugin", { exact: true })).toBeVisible();
  await expect(officialToggle).not.toBeChecked();
  await official.getByRole("button", { name: "OneDrive settings", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "OneDrive", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Check connection", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const name of ["Docling", "Jira"]) {
    await page.getByRole("region", { name, exact: true }).getByRole("button", { name: `${name} settings`, exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  const officialEnabled = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "enable");
  await officialToggle.click();
  expect((await officialEnabled).ok()).toBe(true);
  await expect(official.getByRole("switch")).toBeChecked();
  await officialToggle.click();
  await expect(official.getByRole("switch")).not.toBeChecked();

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
  await expect(toggle).toBeEnabled();
  await external.getByRole("switch").click();
  await page.getByRole("dialog").getByRole("button", { name: "Trust and enable", exact: true }).click();
  await expect(toggle).toBeEnabled();
  await expect(external.getByRole("switch")).toBeChecked();
  await expect(external.getByRole("button", { name: "Vite fixture", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Open view ·/ })).toHaveCount(0);
  await external.getByRole("button", { name: "Vite fixture settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.getByText("Simulates service availability", { exact: true })).not.toBeVisible();
  const serviceUrl = dialog.getByRole("textbox", { name: "docling-serve URL", exact: true });
  await serviceUrl.fill("https://docling.example.test/service");
  const check = dialog.getByRole("button", { name: "Check connection", exact: true });
  let invokes = 0;
  page.on("request", request => { if (request.url().endsWith("/api/plugins") && request.method() === "POST" && request.postDataJSON()?.action === "invoke") invokes++; });
  await page.route("**/api/plugins", async route => {
    const data = route.request().postDataJSON();
    if (data?.action === "settings") return route.fulfill({ status: 400, json: { error: "Fixture save rejected" } });
    await route.continue();
  });
  await serviceUrl.press("Tab");
  await expect(serviceUrl).toHaveAttribute("aria-invalid", "true");
  await expect(serviceUrl).toHaveValue("https://docling.example.test/service");
  await expect(dialog.locator('[id="' + await serviceUrl.getAttribute("aria-describedby") + '"]')).toContainText("Could not save settings. Check the values and try again.");
  await check.click();
  expect(invokes).toBe(0);
  await page.unroute("**/api/plugins");
  await page.route("**/api/plugins", async route => {
    if (route.request().postDataJSON()?.action === "settings") return route.fulfill({ status: 400, json: { error: "opaque validator message", settingsIssues: [{ keyword: "type", path: "/failure" }] } });
    await route.continue();
  });
  await serviceUrl.focus();
  await serviceUrl.press("Tab");
  await expect(dialog.getByRole("switch", { name: "Simulate failure", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Save failed: Enter a value of the expected type.", { exact: true })).toBeVisible();
  await page.unroute("**/api/plugins");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/plugins", async route => {
    if (route.request().postDataJSON()?.action === "settings") await gate;
    await route.continue();
  });
  await serviceUrl.focus();
  await check.click();
  await expect(dialog.getByRole("status").filter({ hasText: /^Saving…$/ })).toBeVisible();
  expect(invokes).toBe(0);
  release();
  await expect(dialog.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: /^Fixture connected$/ })).toBeVisible();
  await page.unroute("**/api/plugins");
  await serviceUrl.fill("");
  await serviceUrl.press("Tab");
  await expect(serviceUrl).toHaveAttribute("aria-invalid", "true");
  await expect(serviceUrl).toHaveValue("");
  await expect(dialog.locator('[id="' + await serviceUrl.getAttribute("aria-describedby") + '"]')).toContainText("This value is too short. Enter a longer value.");
  if (screenshots) await page.screenshot({ path: "tmp/plugin-settings-1407/error-1440.png", mask: [page.locator(".sidebar-host-account")] });
  await serviceUrl.fill("https://docling.example.test/service");
  await serviceUrl.press("Tab");
  await expect(dialog.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await dialog.getByText("Simulate failure", { exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText("Simulates service availability");
  const externalSave = await page.request.post(await page.evaluate(() => location.origin + "/api/plugins"), { headers: { Connection: "close", Origin: await page.evaluate(() => location.origin) }, data: { action: "settings", id: "fixture.vite", settings: { serverUrl: "https://docling.example.test/updated" } } });
  expect(externalSave.ok()).toBe(true);
  await check.click();
  await expect(serviceUrl).toHaveValue("https://docling.example.test/updated");
  await serviceUrl.fill("https://docling.example.test/service");
  await serviceUrl.press("Tab");
  await expect(dialog.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await dialog.getByRole("switch", { name: "Simulate failure", exact: true }).click();
  await expect(check).toBeEnabled();
  await check.click();
  await expect(dialog.getByRole("status").filter({ hasText: /^연결하지 못했습니다\./ })).toBeVisible();
  await page.keyboard.press("Escape");
  await toggle.click();
  await external.getByRole("button", { name: "Vite fixture settings", exact: true }).click();
  await expect(check).toBeDisabled();
  await check.locator("..").hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText("Plugin disabled");
  await page.keyboard.press("Escape");
  await toggle.click();
  await expect(external.getByRole("switch")).toBeChecked();
  const listing = await (await page.request.get(await page.evaluate(() => location.origin + "/api/plugins"), { headers: { Connection: "close" } })).json();
  expect(listing.plugins.find(p => p.id === "fixture.vite").status.message).toBe("0.4.0");
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
      await page.reload();
      await page.getByRole("button", { name: width === 640 ? "설정" : "Settings", exact: true }).click();
      await page.getByRole("button", { name: width === 640 ? "플러그인" : "Plugins", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Vite fixture", exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-settings-1334/after-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
      await page.getByRole("button", { name: width === 640 ? "Vite fixture 설정" : "Vite fixture settings", exact: true }).click();
      await page.getByRole("button", { name: width === 640 ? "연결 확인" : "Check connection", exact: true }).click();
      await expect(page.getByRole("dialog").getByText("연결하지 못했습니다. 저장된 서버 주소와 자격 증명을 확인한 뒤 다시 시도하세요.", { exact: true })).toBeVisible();
      expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(page.getByRole("dialog").getByRole("textbox", { name: "docling-serve URL", exact: true })).toHaveValue("https://docling.example.test/service");
      await expect(page.getByRole("dialog").locator('input[type="password"]')).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-settings-1334/detail-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
      if (width === 640) {
        const url = page.getByRole("dialog").getByRole("textbox", { name: "docling-serve URL", exact: true });
        await url.fill(""); await url.press("Tab");
        await expect(page.getByText("저장 실패: 입력한 값이 너무 짧습니다. 더 길게 입력하세요.", { exact: true })).toBeVisible();
        await page.screenshot({ path: "tmp/plugin-settings-1407/error-640-ko.png", mask: [page.locator(".sidebar-host-account")] });
      }
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); localStorage.setItem("litzio.theme", "light"); });
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
  }
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "ko"); localStorage.setItem("litzio.theme", "dark"); });
      await page.reload();
      await page.getByRole("button", { name: "설정", exact: true }).click();
      await page.getByRole("button", { name: "플러그인", exact: true }).click();
      await page.getByRole("button", { name: "Vite fixture 설정", exact: true }).click();
      await page.screenshot({ path: `tmp/remove-plugin-1413/settings-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
      await page.getByRole("dialog").getByRole("button", { name: "제거", exact: true }).click();
      await page.screenshot({ path: `tmp/remove-plugin-1413/confirm-${width}.png`, mask: [page.locator(".sidebar-host-account")] });
      await page.getByRole("button", { name: "취소", exact: true }).click();
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => { localStorage.setItem("litzio.uiLanguage", "en"); });
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Plugins", exact: true }).click();
  }
  await external.getByRole("button", { name: "Vite fixture settings", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove Vite fixture?", exact: true });
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeChecked();
  await external.getByRole("button", { name: "Vite fixture settings", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await confirmation.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(external).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add plugin…", exact: true })).toBeFocused();
}
