// Manual same-snapshot capture only. Run through pnpm browser:test, with the K1
// product Host still running after plugin-jobs. Absolute paths and local account
// labels are replaced only in rendered text during capture, then restored.
async (page, { expect, screenshots, openFolderPicker }) => {
  if (!screenshots) throw new Error("Use --screenshots");
  const history = await (await page.request.post(page.url().split("/").slice(0,3).join("/") + "/api/plugins", { headers:{Origin:page.url().split("/").slice(0,3).join("/")}, data: {action:"job-list"} })).json();
  const job = history.jobs.find(item => item.state === "completed" && item.result?.kind === "file");
  if (!job) throw new Error("Run plugin-jobs first on this Host");
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(job.root);
  await page.getByTestId("folder-open").click();
  await expect(page.getByTestId("folder-path")).not.toBeVisible();
  await page.keyboard.press("Control+Slash");
  await page.getByRole("combobox").fill("> Plugin jobs");
  await page.getByRole("option", { name:"Plugin jobs", exact:true }).click();
  const pane = page.getByTestId("plugin-jobs");
  await pane.getByLabel("Recent jobs").selectOption(job.requestId);
  await expect(pane.getByRole("status",{name:"Job status"})).toHaveText("Completed");
  const capture = async (suffix) => {
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      window.captureText = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const sanitized = node.textContent.replace(/[A-Za-z]:\\Users\\[^\\]+/g,"C:\\Users\\Author").replace(/\b[A-Z][A-Z0-9-]*\\[^\s\\]+/g,"HOST-PC\\Author");
        if (node.textContent !== sanitized) { window.captureText.push([node,node.textContent]); node.textContent = sanitized; }
      }
    });
    try { await page.screenshot({path:`tmp/plugin-jobs/review-${suffix}.png`}); }
    finally { await page.evaluate(() => { for (const [node,text] of window.captureText) node.textContent = text; delete window.captureText; }); }
  };
  await page.setViewportSize({width:1440,height:900});
  await capture("1440");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByTestId("theme").selectOption("dark");
  await page.getByTestId("ui-language").selectOption("ko");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings-dialog")).not.toBeVisible();
  for (const width of [1440,640]) { await page.setViewportSize({width,height:900}); await capture(`ko-dark-${width}`); }
}
