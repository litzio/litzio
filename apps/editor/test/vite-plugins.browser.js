async (page, { expect, pluginFixture, screenshots, openFolderPicker, brand }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = await page.evaluate(() => location.origin);
  const headers = { Connection: "close", Origin: origin };
  const managePlugin = async data => {
    const response = await page.request.post(origin + "/api/plugins", { headers, data });
    expect(response.ok()).toBe(true);
    expect((await response.json()).receipt.outcome).toBe("success");
  };
  const activityBar = page.getByTestId("activity-bar");
  const installedScreen = activityBar.getByRole("button", { name: "Vite fixture", exact: true });
  const installedPlugin = page.getByRole("region", { name: "Vite fixture", exact: true });
  const initialPlugins = page.waitForResponse(response => response.url() === origin + "/api/plugins" && response.request().method() === "GET");
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await initialPlugins;
  await page.evaluate(() => {
    window.__pluginRefreshFocusEvents = [];
    window.addEventListener("focus", event => window.__pluginRefreshFocusEvents.push(event.type));
    document.addEventListener("visibilitychange", event => window.__pluginRefreshFocusEvents.push(event.type));
  });
  // An external HTTP client has no same-window activity to trigger a refresh.
  await managePlugin({ action: "install", directory: pluginFixture.directory });
  expect((await (await page.request.post(origin + "/api/plugin-screens", { headers, data: { action: "screens", screenCode: false } })).json()).screens)
    .toEqual(expect.arrayContaining([expect.objectContaining({ title: "Vite fixture" })]));
  await expect(installedScreen).toHaveCount(0);
  await expect(installedPlugin).toHaveCount(0);
  await managePlugin({ action: "unregister", id: "fixture.vite" });

  // This scenario uses a real Host; preceding scenarios can remember mocked threads.
  const forgetConversation = () => page.evaluate(key => localStorage.removeItem(key), brand.storagePrefix + ".assistantConversation.v2");
  await forgetConversation();
  await page.keyboard.press("Control+Shift+Y");
  const assistant = page.getByTestId("assistant-panel");
  const message = assistant.getByRole("textbox", { name: "Message assistant" });
  const stop = assistant.getByRole("button", { name: "Stop response", exact: true });
  await message.fill("Install fixture from: " + pluginFixture.directory);
  await assistant.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(stop).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(origin + "/api/plugins", { headers })).json()).plugins.some(plugin => plugin.id === "fixture.vite" && plugin.enabled)).toBe(true);
  await expect(installedScreen).toBeVisible();
  await expect(installedPlugin).toBeVisible();
  await expect(stop).toBeVisible(); // The fake provider leaves the turn running.
  await installedScreen.click();
  const workspace = page.getByTestId("view-workspace");
  await workspace.getByRole("button", { name: "Count: 0", exact: true }).click();
  const refreshOnStop = page.waitForResponse(response => response.url() === origin + "/api/plugin-screens"
    && response.request().postDataJSON()?.screenCode !== false); // The open tab requests screen code.
  await stop.click();
  await expect(assistant.getByText("Stopped", { exact: true })).toBeVisible();
  await refreshOnStop;
  await expect(workspace.getByRole("button", { name: "Count: 1", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__pluginRefreshFocusEvents)).toEqual([]);
  await assistant.getByRole("button", { name: "Close assistant" }).click();
  await forgetConversation();
  await managePlugin({ action: "unregister", id: "fixture.vite" });
  await page.setViewportSize(originalViewport);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await page.getByRole("button", { name: "Add plugin…", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit path", exact: true }).click();
  const input = page.getByTestId("folder-path");
  const register = page.getByTestId("folder-open");
  await expect(register).toBeDisabled();
  await input.fill(pluginFixture.directory + "-missing");
  await expect(register).toBeDisabled();
  await input.press("Enter");
  await expect(page.getByTestId("folder-picker-meta")).toHaveText("folder does not exist");
  const picker = page.getByRole("dialog").filter({ has: register });
  await picker.getByRole("button", { name: "Edit path", exact: true }).click();
  await input.fill(pluginFixture.folder);
  const { promise: registrationAllowed, resolve: allowRegistration } = Promise.withResolvers();
  const delayRegistration = async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.action === "register") await registrationAllowed;
    await route.fallback();
  };
  await page.route("**/api/plugins", delayRegistration);
  try {
    const rejected = page.waitForResponse(response => response.url().endsWith("/api/plugins") && response.request().method() === "POST");
    try {
      await register.click();
      await expect(register).toHaveText("Adding…");
      await expect(register).toBeDisabled();
    } finally {
      allowRegistration();
    }
    expect((await rejected).status()).toBe(400);
  } finally {
    await page.unroute("**/api/plugins", delayRegistration);
  }
  await expect(picker.getByRole("alert")).toHaveText("This folder does not contain a plugin manifest (litzio-plugin.json). Choose a plugin folder.");
  await expect(input).toHaveValue(pluginFixture.folder);
  await expect(register).toBeEnabled();
  if (screenshots) {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(async theme => { const { applyTheme } = await import("/src/theme.ts"); await applyTheme(theme, false); }, theme);
      await picker.screenshot({ path: `docs/design/assets/plugin-register-precheck-1913/after-1440-${theme}.png`, mask: [input, picker.locator(".folder-picker-place")], maskColor: "#777" });
    }
    await page.evaluate(async () => { const { applyTheme } = await import("/src/theme.ts"); await applyTheme("light", false); });
  }
  await input.fill(pluginFixture.directory);
  await register.click();
  await expect(input).not.toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const external = page.getByRole("region", { name: "Vite fixture", exact: true });
  await expect(external.getByText(/^Version 0\.1\.0/)).toBeVisible();
  const toggle = external.getByRole("switch", { name: "Enable Vite fixture", exact: true });
  await expect(toggle).toBeEnabled();
  await external.getByRole("switch").click();
  await page.getByRole("dialog").getByRole("button", { name: "Trust and enable", exact: true }).click();
  await expect(toggle).toBeEnabled();
  await expect(external.getByRole("switch")).toBeChecked();
  await expect(external.getByText(/^Version 0\.1\.0 · Local folder/)).toBeVisible();
  // A public GitHub repository: find its plugin folders, choose one and its track, then add it like a folder.
  await page.getByRole("button", { name: "Add from GitHub…", exact: true }).click();
  const github = page.getByRole("dialog", { name: "Add plugin from GitHub", exact: true });
  const captureRateLimit = async label => {
    await page.screenshot({
      path: `tmp/github-rate-limit-1773/${label}-1440.png`,
      mask: [page.locator(".activity-bar-status, .document-path, .sidebar-folder-name, .document-start-folder-path")],
    });
  };
  if (screenshots) {
    // Reproduce the previous Host message in the same dialog for visual comparison.
    const legacy = "GitHub 요청 한도에 도달했습니다. 잠시 뒤 다시 시도하세요.";
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(async () => { const { i18n } = await import("/src/i18n.ts"); await i18n.changeLanguage("ko"); });
    await page.route("**/api/plugins", route => route.fulfill({ status: 400, json: { error: legacy } }), { times: 1 });
    await page.getByRole("dialog").getByRole("textbox").fill("https://github.com/litzio-fixtures/rate-limited");
    await page.getByRole("textbox", { name: "GitHub 주소" }).press("Enter");
    await expect(page.getByRole("alert")).toHaveText(legacy);
    await captureRateLimit("before-light");
    await page.evaluate(async () => { const { i18n } = await import("/src/i18n.ts"); await i18n.changeLanguage("en"); });
  }
  await github.getByRole("textbox", { name: "GitHub address", exact: true }).fill("https://github.com/litzio-fixtures/rate-limited");
  await github.getByRole("button", { name: "Find", exact: true }).click();
  const rateError = github.getByRole("alert");
  const loginHint = "Sign in with GitHub CLI or set GH_TOKEN to raise the limit.";
  await expect(rateError).toContainText("GitHub rate limit reached. Try again after");
  await expect(github.getByText(loginHint, { exact: true })).toHaveCount(0);
  await page.keyboard.press("Tab");
  const rateDetails = github.getByRole("button", { name: "Plugin status details" });
  await expect(rateDetails).toBeFocused();
  await expect(rateDetails).toHaveAccessibleDescription(loginHint);
  await expect(page.getByText(loginHint, { exact: true })).toBeVisible();
  if (screenshots) {
    await page.evaluate(async () => { const { i18n } = await import("/src/i18n.ts"); await i18n.changeLanguage("ko"); });
    await page.setViewportSize({ width: 1440, height: 1100 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(async theme => { const { applyTheme } = await import("/src/theme.ts"); await applyTheme(theme, false); }, theme);
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("GitHub 요청 한도에 도달했습니다.");
      await captureRateLimit(`after-${theme}`);
    }
    await page.evaluate(async () => {
      const { i18n } = await import("/src/i18n.ts");
      const { applyTheme } = await import("/src/theme.ts");
      await applyTheme("light", false);
      await i18n.changeLanguage("en");
    });
  }
  await github.getByRole("textbox", { name: "GitHub address", exact: true }).fill("https://github.com/litzio-fixtures/plugins");
  await github.getByRole("button", { name: "Find", exact: true }).click();
  await expect(github.getByRole("radio")).toHaveCount(2);
  // Editing the address discards the previous result, so Add cannot register another address's folder.
  const address = github.getByRole("textbox", { name: "GitHub address", exact: true });
  await address.fill("https://github.com/litzio-fixtures/other");
  await expect(github.getByRole("radio")).toHaveCount(0);
  await expect(github.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await address.fill("https://github.com/litzio-fixtures/plugins");
  await github.getByRole("button", { name: "Find", exact: true }).click();
  await expect(github.getByRole("radio")).toHaveCount(2);
  await expect(github.getByRole("button", { name: "Release", exact: true })).toHaveAttribute("aria-pressed", "true");
  await github.getByRole("radio", { name: /^Beta fixture/ }).check();
  await expect(github.getByRole("button", { name: "Release", exact: true })).toBeDisabled();
  await expect(github.getByRole("button", { name: "Branch", exact: true })).toHaveAttribute("aria-pressed", "true");
  await github.getByRole("button", { name: "Add", exact: true }).click();
  await expect(github).toHaveCount(0);
  const remote = page.getByRole("region", { name: "Beta fixture", exact: true });
  await expect(remote.getByText("Version 0.2.0 · GitHub litzio-fixtures/plugins/plugins/beta · Branch", { exact: true })).toBeVisible();
  await expect(remote.getByRole("switch", { name: "Enable Beta fixture", exact: true })).not.toBeChecked();
  // The list check, the row and the plugin dialog all show the Host's one result.
  const checkAll = page.getByRole("button", { name: "Check for updates", exact: true });
  await checkAll.click();
  await expect(remote.getByRole("status").filter({ hasText: "Update available" })).toBeVisible();
  // One plugin's settings check only that plugin and can apply its update in place.
  await remote.getByRole("button", { name: "Beta fixture settings", exact: true }).click();
  const betaSettings = page.getByRole("dialog", { name: "Beta fixture", exact: true });
  await expect(betaSettings.getByRole("status").filter({ hasText: "Update available" })).toBeVisible();
  await betaSettings.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(betaSettings.getByRole("status").filter({ hasText: "Update available" })).toBeVisible();
  if (screenshots) {
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('ko');});
    await page.setViewportSize({width:1440,height:1100});
    await page.mouse.move(0,0);
    await betaSettings.screenshot({path:'docs/design/assets/plugin-github-install-1750/plugin-check-1440-light.png'});
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('en');});
  }
  await betaSettings.getByRole("button", { name: "Update", exact: true }).click();
  await expect(betaSettings.getByRole("button", { name: "Update", exact: true })).toHaveCount(0);
  await betaSettings.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(betaSettings.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(betaSettings).toHaveCount(0);
  await expect(remote.getByText(/^Version 0\.3\.0 · GitHub/)).toBeVisible();
  const listUpToDate = page.getByRole("status").filter({ hasText: /^Up to date$/ });
  await checkAll.click();
  await expect(listUpToDate).toBeVisible();
  await remote.getByRole("button", { name: "Beta fixture settings", exact: true }).click();
  await expect(betaSettings.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible();
  await betaSettings.getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(betaSettings.getByRole("status").filter({ hasText: "Up to date" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listUpToDate).toBeVisible();
  await expect(external.getByRole("button", { name: "Vite fixture", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Open view ·/ })).toHaveCount(0);
  await external.getByRole("button", { name: "Vite fixture settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const switchRow = dialog.getByRole('switch', {name:'Simulate failure',exact:true}).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " settings-row ")]');
  await expect(switchRow).toBeVisible();
  expect(await switchRow.evaluate(row => row.querySelector('[role="switch"]').getBoundingClientRect().right === row.getBoundingClientRect().right)).toBe(true);
  await expect(dialog.locator('input[type="password"]')).toHaveAccessibleName('Access token');
  await expect(dialog.locator('input[type="password"]')).toHaveAccessibleDescription('Not configured');
  await expect(dialog.getByRole('status', {name:''}).filter({hasText:/^Not configured$/})).toBeVisible();
  await expect(page.getByText("Simulates service availability", { exact: true })).not.toBeVisible();
  if(screenshots) {
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('ko');});
    for(const [width,theme] of [[1440,'light'],[1440,'dark'],[640,'light']]) {
      await page.setViewportSize({width,height:1100});
      await page.evaluate(async theme=>{const {applyTheme}=await import('/src/theme.ts');await applyTheme(theme,false);},theme);
      await dialog.screenshot({path:`docs/design/assets/settings-parts-1685/after-plugin-settings-${width}-${theme}.png`});
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    for(const [width,theme] of [[1440,'light'],[1440,'dark'],[640,'light']]) {
      await page.setViewportSize({width,height:1100});
      await page.evaluate(async theme=>{const {applyTheme}=await import('/src/theme.ts');await applyTheme(theme,false);},theme);
      await page.mouse.move(0,0);
      await expect(page.locator('[data-slot=tooltip-content][data-open]')).toHaveCount(0);
      await page.getByTestId('settings-dialog').screenshot({path:`docs/design/assets/settings-parts-1685/plugin-list-${width}-${theme}.png`});
    }
    await page.setViewportSize({width:1440,height:1100});
    await page.evaluate(async()=>{const {applyTheme}=await import('/src/theme.ts');await applyTheme('light',false);});
    await page.mouse.move(0,0);
    await page.getByTestId('settings-dialog').screenshot({path:'docs/design/assets/plugin-github-install-1750/after-1440-light.png'});
    await external.getByRole('button',{name:'Vite fixture 설정',exact:true}).click();
    await page.evaluate(async()=>{const {i18n}=await import('/src/i18n.ts');await i18n.changeLanguage('en');});
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(async()=>{const {applyTheme}=await import('/src/theme.ts');await applyTheme('light',false);});
  }
  const serviceUrl = dialog.getByRole("textbox", { name: "Service URL", exact: true });
  await serviceUrl.fill("https://fixture.example.test/service");
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
  await expect(serviceUrl).toHaveValue("https://fixture.example.test/service");
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
  await expect(dialog.locator(".settings-row").filter({ has: page.getByRole("switch", { name: "Simulate failure", exact: true }) }).getByRole("alert")).toHaveText("Save failed: Enter a value of the expected type.");
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
  // The error belongs to the Service URL Row, not to the row below it.
  await expect(dialog.locator(".settings-row").filter({ has: page.getByRole("textbox", { name: "Service URL", exact: true }) }).getByRole("alert")).toHaveText("Save failed: This value is too short. Enter a longer value.");
  if (screenshots) await page.screenshot({ path: "tmp/plugin-settings-1407/error-1440.png", mask: [page.locator(".activity-bar-status")] });
  await serviceUrl.fill("https://fixture.example.test/service");
  await serviceUrl.press("Tab");
  await expect(dialog.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await dialog.getByText("Simulate failure", { exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText("Simulates service availability");
  const externalSave = await page.request.post(await page.evaluate(() => location.origin + "/api/plugins"), { headers: { Connection: "close", Origin: await page.evaluate(() => location.origin) }, data: { action: "settings", id: "fixture.vite", settings: { serverUrl: "https://fixture.example.test/updated" } } });
  expect(externalSave.ok()).toBe(true);
  await check.click();
  await expect(serviceUrl).toHaveValue("https://fixture.example.test/updated");
  await serviceUrl.fill("https://fixture.example.test/service");
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
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveText("Plugin disabled");
  await page.keyboard.press("Escape");
  await toggle.click();
  await expect(external.getByRole("switch")).toBeChecked();
  await expect(external.getByRole("status")).toHaveText("Running");
  const listing = await (await page.request.get(await page.evaluate(() => location.origin + "/api/plugins"), { headers: { Connection: "close" } })).json();
  expect(listing.plugins.find(p => p.id === "fixture.vite").status.message).toBe("0.22.0");
  if (screenshots) {
    for (const width of [1440, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(width => { localStorage.setItem("litzio.uiLanguage", width === 640 ? "ko" : "en"); localStorage.setItem("litzio.theme", width === 640 ? "dark" : "light"); }, width);
      await page.reload();
      await page.getByRole("button", { name: width === 640 ? "설정" : "Settings", exact: true }).click();
      await page.getByRole("button", { name: width === 640 ? "플러그인" : "Plugins", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Vite fixture", exact: true })).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-settings-1334/after-${width}.png`, mask: [page.locator(".activity-bar-status")] });
      await page.getByRole("button", { name: width === 640 ? "Vite fixture 설정" : "Vite fixture settings", exact: true }).click();
      await page.getByRole("button", { name: width === 640 ? "연결 확인" : "Check connection", exact: true }).click();
      await expect(page.getByRole("dialog").getByText("연결하지 못했습니다. 저장된 서버 주소와 자격 증명을 확인한 뒤 다시 시도하세요.", { exact: true })).toBeVisible();
      expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(page.getByRole("dialog").getByRole("textbox", { name: "Service URL", exact: true })).toHaveValue("https://fixture.example.test/service");
      await expect(page.getByRole("dialog").locator('input[type="password"]')).toBeVisible();
      await page.screenshot({ path: `tmp/plugin-settings-1334/detail-${width}.png`, mask: [page.locator(".activity-bar-status")] });
      if (width === 640) {
        const url = page.getByRole("dialog").getByRole("textbox", { name: "Service URL", exact: true });
        await url.fill(""); await url.press("Tab");
        await expect(page.getByText("저장 실패: 입력한 값이 너무 짧습니다. 더 길게 입력하세요.", { exact: true })).toBeVisible();
        await page.screenshot({ path: "tmp/plugin-settings-1407/error-640-ko.png", mask: [page.locator(".activity-bar-status")] });
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
      await page.screenshot({ path: `tmp/remove-plugin-1413/settings-${width}.png`, mask: [page.locator(".activity-bar-status")] });
      await page.getByRole("dialog").getByRole("button", { name: "제거", exact: true }).click();
      await page.screenshot({ path: `tmp/remove-plugin-1413/confirm-${width}.png`, mask: [page.locator(".activity-bar-status")] });
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
