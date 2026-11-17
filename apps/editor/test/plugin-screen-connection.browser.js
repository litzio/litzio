async (page, { expect, openPath, pluginFixture, screenshots }) => {
  const origin = page.url().split("/").slice(0, 3).join("/");
  const health = await page.request.get(origin + "/daemon/health", {
    headers: { Connection: "close", "X-Litzio-Protocol": "4" },
  });
  expect(health.ok()).toBe(true);
  const { instanceId, productVersion, screenInstanceGuard } = await health.json();
  await page.addInitScript(({ instanceId, productVersion, screenInstanceGuard }) => {
    window.litzioDesktop = {
      hostConnection: async () => ({ url: location.origin, instanceId, productVersion, screenInstanceGuard, desktopVersion: productVersion }),
      info: async () => ({ version: productVersion, channel: "stable", updatesSupported: false, update: { phase: "idle" }, seenUpdate: null }),
      startup: async () => ({}), checkDaemon: async () => {},
      setTheme: async () => false, setWindowBackground: async () => {}, setOpenedFolders: async () => {},
      onUpdateState: () => () => {}, onRestartCheck: () => () => {}, reportPendingWork: () => {},
    };
  }, { instanceId, productVersion, screenInstanceGuard });
  const code = `export default function(React) {
    return function Screen({ ui, saveDocument }) {
      const [status, setStatus] = React.useState("Ready");
      async function save() {
        setStatus("Saving sample");
        try {
          const result = await saveDocument({ name: "slow-save.md", authoring: { title: "Slow save sample", inputs: [] } });
          setStatus(result.revision ? "Sample saved" : "Missing revision");
        } catch (error) { setStatus(error.name); }
      }
      return React.createElement(ui.ScreenLayout, { status: React.createElement(ui.Status, { tone: "neutral", label: status }),
        actions: React.createElement(ui.Button, { onClick: save }, "Save sample") });
    };
  }`;
  await page.route("**/api/plugin-screens", route => route.fulfill({ json: {
    screens: [{ plugin: "fixture.slow", id: "main", entry: "screen.jsx", title: "Slow save", primary: true, code, codeRevision: "1" }],
    receipt: { outcome: "success" },
  } }));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openPath(page, pluginFixture.document);
  await page.locator(".sidebar").getByRole("button", { name: "Slow save", exact: true }).click();
  const workspace = page.getByTestId("view-workspace").filter({ visible: true });
  const hostStatus = page.locator(".host-status");
  await expect(hostStatus).toHaveAttribute("data-tone", "connected");

  let holdingSave = false;
  let saveInstance;
  let release;
  const replyGate = new Promise(resolve => { release = resolve; });
  const slowHealth = async route => {
    if (holdingSave) await replyGate;
    await route.continue();
  };
  const slowSave = async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    // The route forwards only the disposable fixture's write.
    expect(route.request().postDataJSON().path.replaceAll("\\", "/"))
      .toBe(pluginFixture.folder.replaceAll("\\", "/") + "/slow-save.md");
    saveInstance = route.request().headers()["x-litzio-host-instance"];
    holdingSave = true;
    const response = await route.fetch({ headers: { ...route.request().headers(), Connection: "close", Origin: origin } });
    expect(response.status()).toBe(201);
    await replyGate;
    await route.fulfill({ response });
  };
  let saveFailure;
  page.on("requestfailed", request => {
    if (request.url().endsWith("/api/document") && request.method() === "PUT") saveFailure = request.failure()?.errorText;
  });
  await page.route("**/daemon/health", slowHealth);
  await page.route("**/api/document", slowSave);
  try {
    await workspace.getByRole("button", { name: "Save sample" }).click();
    await expect(hostStatus).toHaveText("Unreachable", { timeout: 12_000 });
    if (screenshots) {
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        await page.screenshot({ path: `tmp/1738-slow-save-${theme}.png`, mask: [page.locator(".sidebar")] });
      }
    }
    expect(saveFailure, "the health timeout must not cancel the save").toBeUndefined();
    await expect(workspace.getByText("Saving sample", { exact: true })).toBeVisible();
  } finally {
    holdingSave = false;
    release();
    await page.unroute("**/daemon/health", slowHealth);
    await page.unroute("**/api/document", slowSave);
  }
  await expect(workspace.getByText("Sample saved", { exact: true })).toBeVisible();
  expect(saveInstance).toBe(instanceId);
  await expect(hostStatus).toHaveAttribute("data-tone", "connected", { timeout: 10_000 });

  // The same address can report a new daemon instance between native reconnects.
  await page.route("**/daemon/health", route => route.fulfill({ json: {
    protocolVersion: "4", productVersion, instanceId: "replacement-instance",
  } }), { times: 1 });
  await expect(workspace.getByText("Unavailable", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(workspace.getByRole("button", { name: "Save sample" })).toHaveCount(0);
}
